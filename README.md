# ShopFlow — Frontend e-commerce DevSecOps

Frontend React/TypeScript consommant la [Fake Store API](https://fakestoreapi.com/docs),
livré par une chaîne automatisée, sécurisée, observable et reproductible.

> Projet d'examen — Ingénierie DevSecOps. Le rapport technique complet, avec la
> justification de chaque choix, est dans
> [`docs/RAPPORT-TECHNIQUE.md`](docs/RAPPORT-TECHNIQUE.md).

---

## Sommaire des livrables

| # | Livrable | Emplacement |
|---|---|---|
| 1 | Rapport technique (architecture + stratégie) | [`docs/RAPPORT-TECHNIQUE.md`](docs/RAPPORT-TECHNIQUE.md) |
| 2 | Diagrammes (chaîne de valeur + architecture cible) | [`docs/diagrams/architecture.md`](docs/diagrams/architecture.md) |
| 3 | Code applicatif et configurations | `src/`, `docker/`, `deploy/` |
| 4 | Pipeline CI/CD | [`.github/workflows/`](.github/workflows/) |
| 5 | Tests automatisés | `tests/unit/` (38), `tests/e2e/` (8) |
| 6 | Configurations de sécurité | [`security/`](security/), `.trivyignore`, `sonar-project.properties` |
| 7 | Stratégie d'observabilité | [`observability/`](observability/), §7 du rapport |
| 8 | Limites et améliorations futures | §10 du rapport |

---

## Démarrage rapide

```bash
# Développement local
npm ci
npm run dev                 # http://localhost:5173

# Vérifier comme le fait la CI
./scripts/verify-local.sh   # lint, types, tests, build, image, Trivy, E2E

# Application seule, conteneurisée et durcie
docker build -t shopflow:local .
docker run --rm -p 8080:8080 \
  --read-only --tmpfs /tmp --tmpfs /var/cache/nginx \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -e APP_ENVIRONMENT=local shopflow:local

# Stack complète avec observabilité
export GRAFANA_ADMIN_PASSWORD='...'
docker compose up -d
```

| Service | URL |
|---|---|
| Application (dev conteneurisé) | http://localhost:8080 |
| Grafana | http://localhost:3000 |
| Prometheus | http://localhost:9090 |

### Déploiement par le pipeline

Le workflow `CD` déploie sur un **runner self-hosted local**. Voir
[docs/DEPLOIEMENT-LOCAL.md](docs/DEPLOIEMENT-LOCAL.md).

| Environnement | URL |
|---|---|
| Staging | http://localhost:18081 |
| Canari | http://localhost:18082 |
| Production | http://localhost:18080 |

```bash
./scripts/setup-runner.sh                                   # installe le runner
./scripts/deploy-local.sh staging bao236/examdevsecops:latest 18081 test
```

Registre d'images : [`bao236/examdevsecops`](https://hub.docker.com/r/bao236/examdevsecops).

**Compte de démonstration** (public, documenté par la Fake Store API) :
`mor_2314` / `83r5^_`

---

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification des types puis build de production |
| `npm run lint` | ESLint (`--max-warnings=0`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Tests unitaires |
| `npm run test:coverage` | Tests + seuils de couverture (85 %) |
| `npm run test:e2e` | Tests Playwright |
| `npm run format:check` | Vérification Prettier |

Contre le conteneur plutôt que le serveur de développement :

```bash
E2E_BASE_URL=http://127.0.0.1:8080 npm run test:e2e
```

---

## Structure

```
├── src/                      Application React + TypeScript
│   ├── api/                  Client HTTP, auth, produits, config runtime
│   ├── components/           Header, ProductCard, ProtectedRoute
│   ├── context/              AuthContext, CartContext (reducer testé)
│   ├── hooks/                useProducts
│   ├── observability/        Traces OTel, Core Web Vitals, logs purgés
│   └── pages/                Catalogue, Panier, Connexion
├── tests/
│   ├── unit/                 38 tests Vitest + Testing Library
│   └── e2e/                  8 tests Playwright (conteneur réel)
├── docker/                   nginx durci, en-têtes de sécurité, entrypoint
├── deploy/k8s/               Deployment, Service, PDB, HPA, NetworkPolicy, Ingress
├── observability/            Prometheus, Loki, Promtail, Tempo, OTel, Grafana
├── security/                 Gitleaks, Semgrep, ZAP, politique Trivy
├── scripts/                  verify-local.sh
└── .github/workflows/        ci.yml, cd.yml, scheduled.yml
```

---

## Chaîne CI/CD en un coup d'œil

| Workflow | Déclencheur | Contenu |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | PR et push sur `main` | Qualité → secrets → tests + SAST + SCA → build + SBOM + Trivy + Dockle + Cosign → E2E + DAST → porte de qualité |
| [`cd.yml`](.github/workflows/cd.yml) | CI verte sur `main` | Vérification de signature → staging automatique → validation humaine → canari 10 % piloté par Prometheus → promotion ou retour arrière |
| [`scheduled.yml`](.github/workflows/scheduled.yml) | quotidien 03h17 UTC | Re-scan de l'image en production, contrôle des dérogations expirées, métriques DORA |

**Rien ne se déploie sans signature vérifiée.** Le job `verify-artifact` exige
que la signature Cosign remonte à `ci.yml@refs/heads/main` via OIDC.

---

## Secrets attendus par la CI

Aucun secret n'est requis pour la CI (`GITHUB_TOKEN` suffit ; Cosign est
keyless). Le déploiement en attend quatre :

| Secret | Usage |
|---|---|
| `KUBECONFIG_STAGING` / `KUBECONFIG_PRODUCTION` | accès cluster (base64) |
| `PROMETHEUS_URL` | analyse du canari |
| `GRAFANA_URL` / `GRAFANA_TOKEN` | annotations de déploiement |

---

## État vérifié

| Contrôle | Résultat |
|---|---|
| Tests unitaires | 38 passés — couverture 93,8 % |
| Tests E2E (conteneur durci) | 8 passés |
| Lint / types / format | 0 problème |
| Trivy image finale | 0 HIGH/CRITICAL, 0 misconfig, 0 secret |
| Build de production | 1,1 s — 51 kB + 53 kB gzip |
| Smoke API réelle | 20 produits, connexion OK, 0 erreur console |

Détails et défauts corrigés en cours de route : §9 du
[rapport technique](docs/RAPPORT-TECHNIQUE.md#9-preuves-dexécution).
