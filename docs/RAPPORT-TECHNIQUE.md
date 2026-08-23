# Rapport technique — Stratégie DevSecOps

**Projet.** ShopFlow — frontend e-commerce consommant la Fake Store API
**Module.** Ingénierie DevSecOps — Déploiement d'une plateforme e-commerce moderne
**Date.** 18 août 2026

---

## Sommaire

1. [Contexte et périmètre](#1-contexte-et-périmètre)
2. [Architecture cible](#2-architecture-cible)
3. [Chaîne de valeur](#3-chaîne-de-valeur)
4. [Décisions techniques et justifications](#4-décisions-techniques-et-justifications)
5. [Stratégie de sécurité](#5-stratégie-de-sécurité)
6. [Stratégie de tests](#6-stratégie-de-tests)
7. [Stratégie d'observabilité](#7-stratégie-dobservabilité)
8. [Pilotage : SLO et métriques DORA](#8-pilotage--slo-et-métriques-dora)
9. [Preuves d'exécution](#9-preuves-dexécution)
10. [Limites actuelles et améliorations futures](#10-limites-actuelles-et-améliorations-futures)

---

## 1. Contexte et périmètre

L'application livre trois parcours : authentification via `/auth/login`,
consultation du catalogue, gestion du panier. Elle consomme l'API publique
Fake Store, sur laquelle nous n'avons **aucun contrôle** : ni son
disponibilité, ni ses en-têtes, ni son modèle d'authentification.

Cette contrainte structure tout le reste. Une part importante des décisions qui
suivent consiste à isoler notre chaîne de livraison d'une dépendance que nous ne
maîtrisons pas — sans quoi notre pipeline échouerait au rythme des pannes d'un
service tiers gratuit.

**Périmètre couvert :** code applicatif, tests, conteneurisation, pipeline
CI/CD, contrôles de sécurité, déploiement, observabilité.
**Hors périmètre :** backend métier (l'API est fournie), paiement réel,
gestion de compte.

---

## 2. Architecture cible

Le diagramme complet est dans [`diagrams/architecture.md`](diagrams/architecture.md).
Composants et responsabilités :

| Composant | Rôle | Choix retenu |
|---|---|---|
| Utilisateur / navigateur | Exécution de la SPA | — |
| Périmètre | TLS, HSTS, limitation de débit, routage canari | Ingress NGINX + cert-manager |
| Frontend conteneurisé | Sert les fichiers statiques et les en-têtes de sécurité | `nginx-unprivileged` 1.31-alpine, UID 101, rootfs en lecture seule |
| API Fake Store | Authentification et catalogue | Externe, non maîtrisée |
| Pipeline CI/CD | Construction, vérification, promotion | GitHub Actions |
| Registre d'images | Stockage des artefacts signés | Docker Hub (`bao236/examdevsecops`) |
| Outils de sécurité | Gitleaks, Semgrep, OSV-Scanner, Trivy, Dockle, ZAP, Cosign | voir §5 |
| Observabilité | Métriques, logs, traces, RUM | Prometheus, Loki, Tempo, Grafana, OpenTelemetry |

### Le principe structurant : *build once, deploy many*

L'image est construite **une seule fois**, puis promue de staging vers
production sans reconstruction. La configuration propre à l'environnement est
injectée au démarrage du conteneur (`docker/entrypoint.sh` génère
`/tmp/shopflow/config.js`, servi par nginx via un `alias`).

**Pourquoi.** Reconstruire par environnement casse la chaîne de confiance :
l'artefact déployé en production ne serait plus celui qui a été testé, scanné et
signé. La signature Cosign ne vaudrait plus rien. Ici, le digest vérifié en
production est bit à bit celui validé en CI.

**Gain mesurable.** Une promotion staging → production ne coûte plus un build
complet (~4 min) mais un simple `kubectl set image` (~30 s), et supprime
définitivement la classe de bugs « ça marchait en staging ».

---

## 3. Chaîne de valeur

Le diagramme détaillé figure dans [`diagrams/architecture.md`](diagrams/architecture.md#2-chaîne-de-valeur--du-commit-au-feedback-de-production).

| Étape | Durée cible | Bloquant ? | Boucle de retour |
|---|---|---|---|
| Hook pre-commit | ~20 s | non (contournable) | poste du développeur |
| Qualité (lint, types, format) | ~2 min | oui | PR |
| Secrets (historique complet) | ~1 min | oui | PR |
| Tests unitaires + couverture | ~2 min | oui | PR |
| SAST / SCA | ~3 min | oui | PR + onglet Security |
| Build + SBOM + Trivy + Dockle | ~5 min | oui | PR |
| E2E sur le conteneur | ~4 min | oui | PR |
| DAST ZAP | ~4 min | oui | PR |
| **Lead time PR → main** | **~12 min** (étapes parallélisées) | | |
| Staging automatique | ~2 min | oui | smoke tests |
| Validation humaine | variable | oui | environnement protégé |
| Canari + observation | ~6 min | oui | Prometheus |
| **Lead time commit → production** | **~25 min** hors validation humaine | | |

**Décision de conception du pipeline : échouer vite et parallèle.**
Les contrôles de moins de 3 minutes (lint, types, secrets) tournent en premier
et en parallèle. Un développeur qui a oublié un `console.log` le sait en
2 minutes, pas après 20 minutes de build et de scans. À raison de plusieurs PR
par jour et par développeur, la différence se compte en heures de contexte
préservé chaque semaine.

---

## 4. Décisions techniques et justifications

### 4.1 Application et build

| Décision | Alternative écartée | Pourquoi — gain attendu |
|---|---|---|
| **React 18 + TypeScript** | JavaScript nu | Le typage statique déplace en compilation une classe entière de défauts (champ absent, mauvais type de réponse API). Coût : ~1 min de `tsc` en CI ; gain : des bugs qui n'atteignent jamais la revue. |
| **Vite 6** | Webpack, CRA | Build de production en **1,1 s** mesuré sur ce projet. Sur un pipeline exécuté ~20 fois par jour, l'écart avec un build Webpack (~30-60 s) représente plusieurs heures de CI par mois. |
| **`fetch` natif, pas d'axios** | axios | Une dépendance runtime de moins dans le graphe : moins de surface supply-chain, bundle plus léger. Le timeout et la gestion d'erreur tiennent en 40 lignes (`src/api/client.ts`). |
| **Découpage `vendor` / `index`** | bundle unique | Le chunk `vendor` (React, Router) change rarement : le cache navigateur le conserve entre déploiements. Seul le chunk applicatif (51 kB gzip) est retéléchargé. |
| **Sourcemaps générées puis supprimées de l'image** | pas de sourcemaps | Les sourcemaps sont indispensables pour lire une stack trace de production, mais les publier expose le code source. On les produit, on les archive côté CI, et on les retire de l'image (`RUN find … -name '*.map' -delete`) — doublé d'un refus nginx. |

### 4.2 Conteneurisation

| Décision | Alternative écartée | Pourquoi — gain attendu |
|---|---|---|
| **Multi-stage : deps / build / runtime** | image unique | L'image finale ne contient ni Node, ni npm, ni code source, ni `node_modules`. **Effet mesuré : 0 vulnérabilité HIGH/CRITICAL** au scan Trivy, alors que l'image de build `node:22-alpine` en compte 8. Ce qui n'est pas livré n'est pas attaquable. |
| **Étage `deps` séparé** | tout dans un étage | Le cache Docker n'est invalidé que si `package*.json` change. Un commit qui ne touche que du code source saute l'installation npm — environ 90 s économisées par build. |
| **`npm ci --ignore-scripts`** | `npm install` | `ci` est déterministe (lockfile). `--ignore-scripts` neutralise les `postinstall`, vecteur classique de compromission supply-chain (`event-stream`, `ua-parser-js`). |
| **Images de base épinglées par digest** | tag flottant `:alpine` | Un tag est mutable : `node:22-alpine` ne désigne pas le même contenu dans trois mois. Le digest garantit la reproductibilité et empêche une substitution d'image en amont. Dependabot met les digests à jour **par PR**, donc chaque changement de base est revu. |
| **`nginx-unprivileged`, UID 101, port 8080** | `nginx` officiel en root | Pas de root dans le conteneur, pas de capability `NET_BIND_SERVICE` nécessaire. Une évasion applicative n'aboutit pas à un utilisateur privilégié. |
| **rootfs en lecture seule + `cap_drop: ALL` + `no-new-privileges`** | défauts Docker | Empêche l'écriture d'une charge utile et l'escalade de privilèges après compromission. **Cette contrainte a réellement mordu pendant le développement** : l'entrypoint écrivait `config.js` dans la racine web et le conteneur refusait de démarrer. Corrigé en écrivant dans `/tmp` (tmpfs) avec un `alias` nginx. |

### 4.3 CI/CD

| Décision | Alternative écartée | Pourquoi — gain attendu |
|---|---|---|
| **GitHub Actions** | Jenkins auto-hébergé | Aucun serveur de CI à maintenir ni à sécuriser. Surtout : l'**OIDC natif** permet la signature Cosign keyless — aucune clé privée à stocker ni à faire tourner. |
| **`permissions: contents: read` global** | permissions par défaut | Moindre privilège. Chaque job élargit explicitement ce dont il a besoin (`packages: write`, `id-token: write`). Un job compromis ne peut pas pousser sur le dépôt. |
| **`concurrency` avec `cancel-in-progress`** | tout exécuter | On ne paie pas de minutes CI pour valider un commit déjà remplacé. |
| **Pas de publication d'image sur les PR** | publier toutes les images | Une PR issue d'un fork ne doit jamais pouvoir écrire dans le registre : ce serait un vecteur direct d'empoisonnement. Sur PR, l'image est construite, scannée, testée — puis jetée. |
| **Porte de qualité unique (`quality-gate`)** | 8 contrôles requis dans les réglages GitHub | Un seul *required check* à protéger côté branche. Ajouter un contrôle au pipeline ne demande plus de modifier la configuration du dépôt — moins d'écart entre ce que le pipeline vérifie et ce que la branche exige. |
| **Signature Cosign keyless + vérification avant déploiement** | pousser sans signer | Le job `verify-artifact` refuse toute image dont la signature ne remonte pas à `ci.yml@refs/heads/main` via OIDC. Une image poussée manuellement dans le registre **ne peut pas être déployée**. |

### 4.4 Déploiement

| Décision | Alternative écartée | Pourquoi — gain attendu |
|---|---|---|
| **Staging automatique, production sur validation humaine** | tout automatique | Le déclencheur technique est automatisé, la **décision** reste humaine et tracée via un environnement GitHub protégé. Compromis assumé pour une application e-commerce sans backend de rollback transactionnel. |
| **Canari 10 % + observation 5 min** | rolling update direct | Un défaut n'impacte qu'un utilisateur sur dix, pendant 5 minutes. La promotion est décidée sur une **requête Prometheus réelle** (taux de 5xx du canari), pas sur un `sleep` optimiste. |
| **`maxUnavailable: 0` + `PodDisruptionBudget`** | défauts Kubernetes | Aucune capacité retirée avant que les nouvelles instances ne soient prêtes ; une maintenance de nœud ne peut pas descendre sous 2 répliques. |
| **`startupProbe` avant `livenessProbe`** | liveness seule | Sans startupProbe, un démarrage lent déclenche la liveness et provoque une boucle de redémarrage — panne auto-infligée classique. |
| **`NetworkPolicy` en refus par défaut** | réseau plat Kubernetes | Par défaut tout pod parle à tout pod. Ici le frontend ne peut joindre que le DNS et le collecteur OTel : une compromission ne donne pas de pivot vers le cluster. |

### 4.5 Observabilité

| Décision | Alternative écartée | Pourquoi — gain attendu |
|---|---|---|
| **OpenTelemetry** | SDK propriétaire | Standard CNCF : changer Tempo pour Jaeger ou un SaaS ne touche pas une ligne de code applicatif. Pas de verrouillage sur la donnée de télémétrie. |
| **Collecteur intermédiaire** | export direct navigateur → backend | (1) Le navigateur ne détient aucune credential vers le backend ; (2) la purge des attributs sensibles et l'échantillonnage sont **côté serveur**, donc non contournables ; (3) changer de backend ne redéploie pas le frontend. |
| **Échantillonnage par queue : 100 % des erreurs et des lentes, 10 % du reste** | 100 % de tout | Les traces qui servent au diagnostic sont conservées intégralement ; le coût de stockage est divisé par environ 8. Décider *après* avoir vu la trace complète (tail sampling) est ce qui permet de ne jamais perdre une erreur. |
| **Logs JSON structurés** | texte libre | Parsés tels quels par Promtail. Aucune expression régulière fragile à maintenir, requêtes Loki par champ. |
| **Purge applicative des champs sensibles** (`redact`) | filtrage en aval | Un jeton ne doit pas *sortir* du navigateur, pas seulement ne pas être indexé. Double barrière : `redact()` côté client, `replace` côté Promtail. |
| **Dashboards versionnés dans Git, `allowUiUpdates: false`** | configuration cliquée | Un dashboard modifié à la main est perdu au prochain incident et irreproductible. L'observabilité est du code. |
| **RUM via `web-vitals`** | Lighthouse en CI seulement | Lighthouse mesure un laboratoire. Seul le RUM révèle la performance perçue sur le parc réel et permet d'alerter sur une régression introduite par un déploiement. |

---

## 5. Stratégie de sécurité

### 5.1 Modèle de menace abrégé

| Menace | Vecteur | Contrôle | Où |
|---|---|---|---|
| Vol de jeton | XSS puis lecture de `localStorage` | Jeton **en mémoire uniquement** + CSP `script-src 'self'` | `src/api/tokenStore.ts`, `docker/security-headers.conf` |
| XSS stocké/réfléchi | Injection dans le DOM | React échappe par défaut ; `react/no-danger` en erreur ; règle Semgrep sur `dangerouslySetInnerHTML` | ESLint, Semgrep |
| Redirection ouverte / `javascript:` | URL d'image contrôlée par l'API | Validation `^https?://` sur `image` | `src/api/products.ts` |
| Secret publié | Clé commitée | Gitleaks en pre-commit **et** en CI sur l'historique complet | `security/gitleaks/` |
| Dépendance vulnérable | CVE npm | OSV-Scanner + `npm audit --omit=dev` + Dependabot | CI |
| Image vulnérable | CVE OS | Trivy bloquant HIGH/CRITICAL + re-scan quotidien | CI + `scheduled.yml` |
| Image falsifiée | Push manuel dans le registre | Vérification Cosign avant déploiement | `cd.yml` |
| Clickjacking | Iframe tierce | `X-Frame-Options: DENY` + `frame-ancestors 'none'` | nginx |
| Énumération de comptes | Message d'erreur différencié | Message générique unique, testé | `LoginPage.tsx` + test unitaire |
| Évasion de conteneur | Escalade de privilèges | non-root, rootfs RO, `cap_drop ALL`, `no-new-privileges`, seccomp `RuntimeDefault` | Compose + K8s |
| Pivot latéral | Réseau plat | `NetworkPolicy` refus par défaut | `deploy/k8s/networkpolicy.yaml` |

### 5.2 Couverture OWASP Top 10 (périmètre frontend)

| Catégorie | Traitement |
|---|---|
| A01 Contrôle d'accès défaillant | `ProtectedRoute` **assumé comme confort d'UX**, pas comme contrôle : l'autorisation réelle appartient à l'API. Documenté dans le code pour éviter la fausse sécurité. |
| A02 Défaillances cryptographiques | HSTS, `upgrade-insecure-requests`, TLS terminé à l'ingress. Aucun secret dans le bundle (règle Gitleaks dédiée aux variables `VITE_*`). |
| A03 Injection | React échappe ; pas d'`eval`/`new Function` (règle Semgrep) ; CSP sans `unsafe-eval`. |
| A05 Mauvaise configuration | 8 en-têtes de sécurité **testés en E2E** ; ZAP baseline bloquant ; Trivy config sur les manifestes. |
| A06 Composants vulnérables | SCA + scan d'image + Dependabot + re-scan quotidien de l'image en production. |
| A07 Identification défaillante | Message d'erreur générique, bornage des entrées, jeton non persisté. |
| A08 Intégrité logicielle | Digests épinglés, `--ignore-scripts`, SBOM CycloneDX, signature Cosign, attestation SLSA de provenance. |
| A09 Journalisation insuffisante | Logs JSON structurés, traces OTel, alertes sur symptômes, annotations de déploiement. |

### 5.3 Gestion des secrets

Trois règles appliquées :

1. **Aucun secret dans le dépôt.** Gitleaks en pre-commit et sur l'historique
   complet en CI (`fetch-depth: 0`) — un secret retiré du HEAD reste compromis
   s'il vit dans un commit antérieur.
2. **Aucun secret dans le bundle.** Une règle Gitleaks dédiée détecte les
   variables `VITE_*` contenant `SECRET`, `TOKEN`, `PASSWORD` ou `API_KEY` :
   tout ce qui est préfixé `VITE_` finit lisible dans le JavaScript public.
3. **Aucune clé de signature à gérer.** Cosign keyless : l'identité du
   signataire est le workflow GitHub lui-même, attestée par OIDC et inscrite
   publiquement dans le journal de transparence Rekor. Il n'y a pas de clé
   privée à voler, à faire tourner, ni à révoquer.

### 5.4 Politique de dérogation

Une exception de sécurité sans date de fin devient permanente par oubli. Le
fichier `.trivyignore` impose le format
`CVE-XXXX-YYYY # justification — expire le AAAA-MM-JJ — responsable`, et le job
`expired-exceptions` du workflow quotidien **échoue** sur toute ligne sans date
ou dont la date est dépassée. L'oubli devient un échec visible.

---

## 6. Stratégie de tests

### Pyramide appliquée

| Niveau | Outil | Nombre | Ce qui est vérifié |
|---|---|---|---|
| Unitaire | Vitest + Testing Library | **38 tests** | Logique métier du panier (arrondi monétaire, plafonds, suppression), normalisation défensive des réponses API, validation et non-persistance du jeton, purge des logs, rendu et filtres du catalogue, garde de route |
| Composant / intégration | Testing Library | inclus ci-dessus | Interactions réelles via `userEvent`, pas d'appels à des méthodes internes |
| Bout en bout | Playwright | **8 tests** × 2 navigateurs | Parcours complet connexion → panier → validation, **contre le conteneur de production**, plus les en-têtes de sécurité HTTP |

### Décisions de test justifiées

- **Les E2E tournent contre l'image Docker, pas contre `vite dev`.** Le serveur
  de développement ne pose ni CSP, ni cache, ni fallback SPA. Tester le dev
  server, c'est tester un artefact qui ne sera jamais déployé. Cette décision a
  eu un effet concret : elle a révélé que les en-têtes de sécurité
  disparaissaient (voir §9).
- **L'API tierce est interceptée dans les E2E.** Un pipeline ne doit pas échouer
  parce qu'une API publique gratuite est momentanément indisponible. On teste
  *notre* application. La disponibilité réelle de l'API relève du smoke test
  post-déploiement, non bloquant pour la fusion.
- **Seuils de couverture à 85 %** (lignes, fonctions, énoncés) et 80 %
  (branches), **couverture réelle : 93,8 %**. `App.tsx` et `main.tsx` sont
  exclus : composition pure couverte par les E2E ; les compter gonflerait la
  métrique sans rien vérifier de plus.
- **Quality gate Sonar sur le code *nouveau* uniquement.** Imposer un seuil
  global sur une base existante produit des tests écrits pour la métrique. Le
  principe *clean as you code* fait converger la qualité sans bloquer l'équipe.

---

## 7. Stratégie d'observabilité

### Les trois piliers, et ce qu'on en attend

| Pilier | Implémentation | Question à laquelle il répond |
|---|---|---|
| **Métriques** | nginx-prometheus-exporter → Prometheus | « Est-ce que ça va mal, et depuis quand ? » |
| **Logs** | JSON structuré → Promtail → Loki | « Qu'est-ce qui s'est passé exactement ? » |
| **Traces** | OpenTelemetry → collecteur → Tempo | « Où, dans la chaîne d'appels, est le temps perdu ? » |
| **RUM** | `web-vitals` → logs → Loki | « Qu'ont réellement vécu les utilisateurs ? » |

### Corrélation : ce qui fait la différence en incident

Les trois piliers pris séparément produisent trois silos. Ce sont les liens qui
font gagner du temps :

- **Log → trace.** Le champ `trace_id` des logs nginx est extrait par un
  `derivedField` Grafana : un clic depuis une ligne de log ouvre la trace.
- **Trace → log.** `tracesToLogsV2` fait le chemin inverse.
- **Déploiement → incident.** Chaque déploiement pose une annotation Grafana.
  En incident, la première question utile est « qu'est-ce qui a changé ? » —
  elle a une réponse visuelle immédiate.

### Alerting : sur les symptômes, jamais sur les causes

Les règles de `observability/prometheus/alerts.yml` portent sur ce que
l'utilisateur ressent : indisponibilité, taux de 5xx, latence P95, échec de la
sonde externe. Aucune alerte sur le CPU ou la mémoire.

**Pourquoi.** Un pic de CPU sans dégradation de service n'est pas un incident,
c'est du bruit — et le bruit tue l'astreinte. La seule alerte « cause » conservée
est le *burn rate* du budget d'erreur, qui prévient **avant** que le SLO ne soit
violé. Chaque alerte critique porte un lien de runbook : une alerte sans marche à
suivre transfère la charge cognitive à quelqu'un qu'on réveille à 3 h du matin.

### Rétention et coût

| Donnée | Rétention | Justification |
|---|---|---|
| Métriques | 15 jours | Suffisant pour l'analyse de tendance ; l'agrégat long terme relèverait d'un stockage distant. |
| Logs | 14 jours | Les incidents se diagnostiquent dans les heures qui suivent. Au-delà, le coût de stockage dépasse la valeur d'investigation. |
| Traces | 7 jours | Une trace sert au diagnostic à chaud. Passé une semaine, la métrique agrégée suffit et coûte mille fois moins cher. |

---

## 8. Pilotage : SLO et métriques DORA

### SLO

| Indicateur | Objectif | Mesure |
|---|---|---|
| Disponibilité | 99,5 % sur 30 jours | `1 - (5xx / total)` |
| Latence P95 | < 1 s | histogramme nginx |
| LCP p75 (RUM) | < 2,5 s | `web-vitals` via Loki |

Budget d'erreur : 0,5 % sur 30 jours, soit ~3 h 39 d'indisponibilité. Deux
alertes de *burn rate* signalent une consommation anormalement rapide avant
violation.

### DORA

Le job `dora-metrics` calcule mensuellement la fréquence de déploiement et le
taux d'échec des changements à partir de l'API GitHub Actions.

**Pourquoi les mesurer.** Sans elles, « on a amélioré la livraison » reste une
opinion. Les quatre métriques DORA rendent le pipeline lui-même observable, et
transforment un débat d'équipe en constat chiffré.

| Métrique | Cible | Mécanisme qui la sert |
|---|---|---|
| Fréquence de déploiement | quotidienne | pipeline < 25 min, staging automatique |
| Lead time for changes | < 1 h | parallélisation, échec rapide |
| Taux d'échec des changements | < 15 % | 46 tests, 6 outils de sécurité, canari |
| Temps de restauration | < 15 min | retour arrière automatique + `rollout undo` |

---

## 9. Preuves d'exécution

Tout ce qui suit a été **réellement exécuté** sur ce dépôt, pas seulement décrit.

| Contrôle | Résultat obtenu |
|---|---|
| `npm run lint` | 0 erreur, 0 avertissement |
| `npm run typecheck` | 0 erreur |
| `npm run format:check` | conforme sur l'ensemble du dépôt |
| `npm run test:coverage` | **38 tests passés**, couverture **93,8 %** des lignes |
| `npm run build` | build en **1,1 s** — 51 kB gzip (app) + 53 kB gzip (vendor) |
| `docker build` | image construite, rootfs en lecture seule fonctionnel |
| Trivy (image finale) | **0 vulnérabilité HIGH/CRITICAL**, 0 mauvaise configuration, 0 secret |
| Playwright E2E | **8 tests passés** contre le conteneur durci |
| Vérification manuelle des en-têtes | 8 en-têtes de sécurité présents ; `.map` → **403** ; `POST /` → **405** |
| Smoke contre l'API réelle | 20 produits chargés, connexion `mor_2314` réussie, **0 erreur console** |

### Trois défauts réels trouvés et corrigés pendant la construction

Ils illustrent que les contrôles ne sont pas décoratifs.

1. **Les en-têtes de sécurité étaient absents des réponses.**
   Piège classique de nginx : `add_header` n'est pas cumulatif entre niveaux —
   dès qu'une `location` déclare son propre `add_header` (ici un simple
   `Cache-Control`), elle perd **tous** ceux hérités du bloc `server`. La CSP
   disparaissait silencieusement. *Corrigé* par un fichier
   `security-headers.conf` inclus explicitement dans chaque `location`, et
   verrouillé par un test E2E qui inspecte la réponse HTTP réelle.

2. **Le conteneur refusait de démarrer avec un rootfs en lecture seule.**
   L'entrypoint écrivait `config.js` dans la racine web. *Corrigé* en écrivant
   dans `/tmp` (tmpfs) et en servant le fichier via un `alias` nginx. Le
   durcissement a révélé une hypothèse implicite du design.

3. **Vider le champ « quantité » supprimait la ligne du panier.**
   Découvert en écrivant le test unitaire de `CartPage`. *Corrigé* : seuls un 0
   explicite ou le bouton « Retirer » suppriment une ligne. C'est exactement le
   rôle d'un test — révéler un comportement que personne n'avait décidé.

Deux autres frictions d'environnement ont été traitées : `localStorage` masqué
par l'implémentation expérimentale de Node ≥ 22 (shim ajouté au setup de test,
faute de quoi les assertions de sécurité passaient sur du vide et donnaient une
**fausse garantie**), et un conflit de versions Vite entre Vitest 2 et Vite 6
(alignement sur Vitest 3).

---

## 10. Limites actuelles et améliorations futures

### Limites assumées

1. **Le jeton transite par le navigateur.** La Fake Store API renvoie un JWT
   dans le corps de la réponse, ce qui interdit le cookie `httpOnly` +
   `SameSite` qui serait la solution correcte. Le stockage en mémoire réduit la
   fenêtre d'exposition mais ne l'élimine pas. *Correction cible : un BFF qui
   échange le JWT contre un cookie `httpOnly`, et devient le seul à parler à
   l'API.*
2. **`ProtectedRoute` n'est pas un contrôle de sécurité.** Tout code livré au
   navigateur est sous le contrôle de l'utilisateur. L'autorisation appartient à
   l'API — c'est documenté dans le code pour empêcher une fausse confiance.
3. **Aucune protection anti-bot sur le formulaire de connexion.** La limitation
   de débit nginx est par IP, contournable via un pool d'adresses. Une vraie
   défense (rate limit par compte, second facteur) relève du backend.
4. **Le déploiement en production est décrit mais non exécuté** : le sujet ne
   fournit pas de cluster. Les manifestes et le workflow sont complets et
   cohérents, mais n'ont pas tourné contre un vrai `kubectl`. Tout ce qui
   pouvait être vérifié localement l'a été (§9).
5. **DAST limité au *baseline* scan.** Le scan actif de ZAP est destructif et
   inadapté à une PR. Il devrait tourner de nuit contre staging.
6. **Un seul environnement d'observabilité** (Compose local). En production,
   Loki et Tempo demanderaient un stockage objet et un mode distribué.

### Améliorations futures, par ordre de rapport valeur/coût

| Priorité | Amélioration | Gain attendu |
|---|---|---|
| 1 | **BFF pour l'authentification** | Supprime la classe entière « vol de jeton par XSS ». La correction la plus rentable du lot. |
| 2 | **GitOps (Argo CD / Flux)** | L'état du cluster devient déclaratif et réconcilié en continu. Supprime le `kubectl set image` impératif et les secrets kubeconfig dans la CI. |
| 3 | **Politiques d'admission (Kyverno / OPA Gatekeeper)** | Le cluster refuse lui-même une image non signée. Aujourd'hui la vérification Cosign est dans le pipeline : elle protège le chemin nominal, pas un `kubectl apply` manuel. |
| 4 | **Analyse canari automatisée (Flagger)** | Remplace le `sleep 300` + requête ponctuelle par une analyse continue multi-métriques avec retour arrière natif. |
| 5 | **Tests d'accessibilité (axe-core en E2E)** | L'accessibilité est déjà travaillée (libellés, `role="alert"`, `.sr-only`) mais non vérifiée automatiquement — donc sujette à régression. |
| 6 | **Budgets de performance en CI** (Lighthouse CI) | Bloque une PR qui alourdit le bundle au-delà d'un seuil, avant que le RUM ne le révèle en production. |
| 7 | **Chaos engineering léger** | Vérifie que le PDB, les probes et le HPA se comportent réellement comme prévu sous perte de nœud. |
| 8 | **Attestations SLSA niveau 3** | La provenance est déjà générée ; formaliser le niveau 3 fermerait la boucle supply-chain. |

---

## Conclusion

La chaîne livrée va du hook pre-commit au feedback de production : 46 tests
automatisés, six outils de sécurité répartis sur les cinq étages du cycle de
vie, une image sans vulnérabilité HIGH/CRITICAL, signée et vérifiée avant tout
déploiement, un déploiement canari piloté par des données réelles, et une
observabilité corrélée dont les alertes portent sur ce que l'utilisateur
ressent.

Trois défauts réels — deux de sécurité, un fonctionnel — ont été trouvés par ces
contrôles pendant la construction elle-même. C'est le seul argument qui compte
en faveur d'un pipeline : non pas qu'il existe, mais qu'il attrape des choses.

La limite principale reste le stockage du jeton côté navigateur, imposée par
l'API fournie. Elle est identifiée, documentée dans le code, et sa correction —
un BFF — est la première ligne de la feuille de route.
