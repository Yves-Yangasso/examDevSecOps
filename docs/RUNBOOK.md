# Runbook — ShopFlow Frontend

Chaque alerte critique de `observability/prometheus/alerts.yml` pointe vers une
section de ce document. Une alerte sans marche à suivre transfère la charge
cognitive à la personne qu'on réveille : ce fichier est la contrepartie
obligatoire de chaque `page: "true"`.

---

## Frontend indisponible

**Alerte.** `FrontendIndisponible` — la cible ne répond plus depuis 2 min.
**Impact utilisateur.** Site inaccessible.

1. Confirmer côté externe : `curl -I https://shopflow.example.com/healthz`.
   Si la sonde externe (`SondeExterneEnEchec`) est verte, le problème est côté
   scrape, pas côté service — passer à *Faux positif de scrape*.
2. `kubectl -n shopflow-prod get pods -l app.kubernetes.io/name=shopflow-frontend`
   - `CrashLoopBackOff` → `kubectl logs --previous` : chercher une erreur de
     l'entrypoint (`config.js`, permission) ou de la configuration nginx.
   - `Pending` → `kubectl describe pod` : capacité insuffisante ou
     `topologySpreadConstraints` insatisfaisable.
   - `Running` mais non prêt → readiness en échec, voir `/healthz` dans le pod.
3. Un déploiement récent ? Vérifier l'annotation Grafana. Si oui :
   `kubectl -n shopflow-prod rollout undo deployment/shopflow-frontend`.
4. Sinon, escalader vers l'équipe plateforme (ingress, DNS, certificat).

**Faux positif de scrape.** Vérifier `nginx-exporter` et la `NetworkPolicy` du
namespace `observability`.

---

## Taux d'erreur 5xx élevé

**Alerte.** `TauxErreur5xxEleve` — plus de 2 % de 5xx sur 5 minutes.

1. Grafana → *ShopFlow — Vue d'ensemble* → panneau **Errors**. Le pic
   coïncide-t-il avec une annotation de déploiement ?
2. Si oui → retour arrière immédiat (`rollout undo`), analyse ensuite.
3. Si non, isoler par la répartition des statuts :
   - 502/504 → les pods ne répondent pas : vérifier les probes et les ressources
     (`kubectl top pods`), un OOMKill se voit dans `describe`.
   - 500 → erreur nginx : `{service="shopflow-frontend"} | json | level="error"`
     dans Loki.
4. Un clic sur une ligne de log ouvre la trace Tempo correspondante
   (`derivedField` `trace_id`) : c'est le chemin le plus court vers la cause.

> À noter : les erreurs de la Fake Store API n'apparaissent **pas** dans nos
> 5xx — le navigateur l'appelle directement. Elles se voient dans les logs
> applicatifs (`catalog.failed`) et les traces, pas dans les métriques nginx.

---

## Consommation accélérée du budget d'erreur

**Alerte.** `BudgetErreurConsommeRapidement` (warning, pas de page).

Le service fonctionne mais dégrade le SLO plus vite que le budget ne le permet
(épuisement du budget mensuel en moins de 2 jours au rythme observé).

1. Ne pas traiter comme une panne : ouvrir un ticket, pas une astreinte.
2. Identifier la source : un endpoint, un navigateur, une région ?
3. Si le budget mensuel est déjà consommé à plus de 75 %, **geler les
   déploiements non correctifs** jusqu'à retour sous le seuil.

---

## Latence P95 dégradée

**Alerte.** `LatenceP95Degradee` — P95 > 1 s sur 10 minutes.

1. Distinguer serveur et client :
   - P95 nginx élevé → problème d'infrastructure (CPU, réseau, ingress).
   - P95 nginx normal mais LCP p75 dégradé → problème côté client (poids du
     bundle, images de l'API tierce lentes).
2. Vérifier le panneau **Core Web Vitals** : une régression de LCP après un
   déploiement pointe vers un bundle alourdi.
3. Comparer la taille des assets entre les deux dernières versions.

---

## Nouvelle vulnérabilité détectée sur l'image de production

**Déclencheur.** Ticket ouvert automatiquement par `scheduled.yml`.

1. Lire le rapport Trivy dans l'exécution du workflow.
2. Un correctif existe (`Fixed Version` renseignée) ?
   - Oui → mettre à jour le digest de l'image de base, laisser la CI reconstruire,
     déployer. C'est le chemin normal et il prend ~25 min.
   - Non → évaluer l'exploitabilité **dans notre contexte** (une CVE d'un binaire
     absent du conteneur n'est pas exploitable) et, si dérogation, ajouter dans
     `.trivyignore` au format imposé, **avec date d'expiration et responsable**.
3. Une dérogation sans date fait échouer le job `expired-exceptions` le
   lendemain. C'est voulu.

---

## Le pipeline échoue sur les en-têtes de sécurité

**Symptôme.** `security-headers.spec.ts` échoue en CI.

Presque toujours la même cause : un `add_header` ajouté dans une `location` de
`docker/default.conf` **sans** `include /etc/nginx/security-headers.conf`.
`add_header` n'est pas cumulatif entre niveaux dans nginx : une location qui
déclare le sien perd tous ceux du bloc parent.

Vérification locale :

```bash
docker build -t shopflow:local .
docker run -d --name t -p 8099:8080 shopflow:local
curl -sI http://127.0.0.1:8099/ | grep -i content-security-policy
docker rm -f t
```

---

## Retour arrière d'urgence

```bash
kubectl -n shopflow-prod rollout undo deployment/shopflow-frontend
kubectl -n shopflow-prod rollout status deployment/shopflow-frontend --timeout=120s
```

Vers une version précise :

```bash
kubectl -n shopflow-prod set image deployment/shopflow-frontend \
  frontend=docker.io/bao236/examdevsecops:<SHA>
```

Le déploiement conserve 5 révisions (`revisionHistoryLimit: 5`).

**Après tout retour arrière :** poser une annotation Grafana et ouvrir un
post-mortem. Un retour arrière non tracé se répète.
