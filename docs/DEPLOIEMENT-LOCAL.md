# Déploiement local via runner self-hosted

Ce document décrit la mise en service du runner GitHub Actions qui exécute le
workflow `CD` sur la machine de développement, et le fonctionnement du
déploiement local.

## 1. Pourquoi un runner self-hosted

Le sujet demande un pipeline CI/CD *fonctionnel*. Sans cluster Kubernetes à
disposition, la partie CD restait descriptive : des manifestes cohérents mais
jamais exécutés. Un runner self-hosted rend le CD réellement exécutable, avec
les mêmes propriétés que la cible : vérification de signature, déploiement par
digest, canari mesuré, retour arrière automatique.

Ce qui est perdu par rapport à Kubernetes : l'orchestration multi-répliques, le
PodDisruptionBudget et le rolling update natif. Ce qui est conservé : toute la
chaîne de confiance de l'artefact, qui est le cœur du sujet.

## 2. Avertissement de sécurité — dépôt public

> Le dépôt est **public**. Un runner self-hosted exécute du code sur votre
> machine. Sur un dépôt public, un workflow déclenché par `pull_request` et
> ciblant ce runner permettrait à **n'importe qui** d'exécuter du code arbitraire
> chez vous, simplement en ouvrant une PR depuis un fork.

Trois verrous cumulés dans ce dépôt :

1. `cd.yml` n'écoute **pas** `pull_request`. Uniquement `workflow_run` (CI verte
   sur `main`) et `workflow_dispatch` (réservé aux comptes ayant le droit
   d'écriture).
2. Une condition explicite refuse tout déclenchement dont le dépôt source n'est
   pas ce dépôt : `github.event.workflow_run.head_repository.full_name ==
   github.repository`. Cela exclut tous les forks.
3. L'environnement `production` exige une validation humaine (*required
   reviewers*).

**Règle à ne jamais enfreindre** : ne faites tourner aucun job `pull_request` sur
ce runner tant que le dépôt est public.

Durcissement complémentaire recommandé dans les réglages du dépôt :
`Settings → Actions → General → Fork pull request workflows` →
« Require approval for all external contributors ».

## 3. Installation

```bash
./scripts/setup-runner.sh
```

Le script détecte la plateforme, télécharge le runner, obtient un jeton
d'enregistrement éphémère (1 h) via l'API GitHub et enregistre le runner avec
les libellés `self-hosted,shopflow-local`.

Le runner est installé dans `~/actions-runner-shopflow`, **hors du dépôt** : il
ne doit pas se trouver dans l'arbre de travail qu'il clone à chaque job.

Démarrage :

```bash
cd ~/actions-runner-shopflow
./run.sh                        # au premier plan
./svc.sh install && ./svc.sh start   # en service macOS
```

Vérification :

```bash
gh api repos/Yves-Yangasso/examDevSecOps/actions/runners --jq '.runners[] | "\(.name) \(.status)"'
```

## 4. Prérequis sur la machine

| Prérequis | Vérification |
|---|---|
| Docker démarré | `docker info` |
| `gh` authentifié | `gh auth status` |
| Ports libres | `18080`, `18081`, `18082` |

Les ports `8080` et `8081` sont volontairement évités : ils sont occupés par
d'autres projets sur la machine hôte. Un runner self-hosted partage la machine
avec le reste de son environnement — un déploiement ne doit jamais entrer en
collision avec ce qui tourne déjà.

## 5. Ce que fait le workflow CD

| Étape | Port | Effet |
|---|---|---|
| `verify-artifact` | — | `docker pull` du tag, résolution en **digest**, vérification Cosign |
| `deploy-staging` | 18081 | Déploiement + smoke test incluant les en-têtes de sécurité |
| `deploy-production` → canari | 18082 | Nouvelle version isolée, observée 60 s |
| `deploy-production` → promotion | 18080 | Bascule après mesure sous le seuil |
| Échec à n'importe quelle étape | — | `rollback-local.sh` restaure image **et** version |

La résolution en digest n'est pas cosmétique : elle ferme la fenêtre entre
« ce qui a été vérifié » et « ce qui est démarré ». Un tag peut être réécrit
entre les deux, un digest non.

## 6. Scripts

| Script | Rôle |
|---|---|
| `scripts/setup-runner.sh` | Installe et enregistre le runner |
| `scripts/deploy-local.sh <env> <image> <port> [version]` | Déploie et attend la healthcheck |
| `scripts/rollback-local.sh <env> <port>` | Restaure la version précédente |
| `scripts/canary-check.sh <url> <seuil> <durée>` | Mesure le taux d'erreur et décide |

Les scripts sont utilisables à la main, hors CI :

```bash
./scripts/deploy-local.sh staging bao236/examdevsecops:latest 18081 test
curl -sI http://127.0.0.1:18081/ | grep -i content-security-policy
./scripts/rollback-local.sh staging 18081
```

## 7. Mesure du canari

`canary-check.sh` interroge Prometheus quand il est joignable — c'est alors le
**trafic réel** qui est mesuré. À défaut, il bascule sur une sonde active :
trafic synthétique, mais mesure quand même.

Ce qu'il ne fait pas : un `sleep` suivi d'une promotion inconditionnelle.
Attendre n'est pas observer.

L'état de sortie est ce qui pilote la promotion :

```bash
# canari sain
./scripts/canary-check.sh http://127.0.0.1:18081 0.02 10   # exit 0
# canari injoignable
./scripts/canary-check.sh http://127.0.0.1:19999 0.02 10   # exit 1
```

## 8. Retrait du runner

```bash
cd ~/actions-runner-shopflow
./svc.sh stop && ./svc.sh uninstall     # si installé en service
./config.sh remove --token "$(gh api -X POST repos/Yves-Yangasso/examDevSecOps/actions/runners/remove-token --jq .token)"
```
