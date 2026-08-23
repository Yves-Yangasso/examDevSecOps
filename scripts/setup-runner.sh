#!/usr/bin/env bash
# Installe et enregistre un runner GitHub Actions self-hosted sur cette machine.
#
# Usage : ./scripts/setup-runner.sh
#
# AVERTISSEMENT DE SÉCURITÉ
# Ce dépôt est public. Un runner self-hosted exécute du code sur VOTRE machine.
# La protection ne vient pas du runner mais des workflows : seul cd.yml cible
# ce runner, et il n'écoute que `workflow_run` sur main et `workflow_dispatch`.
# Ne faites JAMAIS tourner un job `pull_request` sur ce runner tant que le
# dépôt est public — une PR de fork pourrait exécuter n'importe quoi ici.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-Yves-Yangasso/examDevSecOps}"
RUNNER_VERSION="${RUNNER_VERSION:-2.336.0}"
LABELS="${RUNNER_LABELS:-self-hosted,shopflow-local}"
NAME="${RUNNER_NAME:-$(hostname -s)-shopflow}"
# Hors du dépôt : le runner ne doit pas se retrouver dans l'arbre de travail
# qu'il va lui-même cloner à chaque job.
DIR="${RUNNER_DIR:-$HOME/actions-runner-shopflow}"

case "$(uname -s)/$(uname -m)" in
  Darwin/arm64) PKG="actions-runner-osx-arm64-${RUNNER_VERSION}.tar.gz" ;;
  Darwin/x86_64) PKG="actions-runner-osx-x64-${RUNNER_VERSION}.tar.gz" ;;
  Linux/x86_64) PKG="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" ;;
  Linux/aarch64) PKG="actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" ;;
  *) echo "Plateforme non gérée : $(uname -s)/$(uname -m)"; exit 1 ;;
esac

command -v gh > /dev/null || { echo "gh CLI requis : brew install gh"; exit 1; }
command -v docker > /dev/null || { echo "Docker requis et démarré."; exit 1; }
docker info > /dev/null 2>&1 || { echo "Docker ne répond pas — démarrez Docker Desktop."; exit 1; }

if [ -f "$DIR/.runner" ]; then
  echo "Runner déjà configuré dans $DIR."
  echo "Pour le reconfigurer : (cd $DIR && ./config.sh remove) puis relancer ce script."
  exit 0
fi

mkdir -p "$DIR"
cd "$DIR"

if [ ! -f "./config.sh" ]; then
  echo "Téléchargement du runner ${RUNNER_VERSION}..."
  curl -fsSL -o runner.tar.gz \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${PKG}"
  tar xzf runner.tar.gz
  rm runner.tar.gz
fi

# Jeton d'enregistrement à durée de vie courte (1 h), obtenu via l'API.
# On ne stocke jamais ce jeton : il est consommé immédiatement.
echo "Obtention d'un jeton d'enregistrement pour $REPO..."
TOKEN="$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)"

./config.sh \
  --url "https://github.com/$REPO" \
  --token "$TOKEN" \
  --name "$NAME" \
  --labels "$LABELS" \
  --work _work \
  --unattended \
  --replace

echo
echo "Runner configuré : $NAME  [$LABELS]"
echo
echo "Démarrage :"
echo "  au premier plan  : (cd $DIR && ./run.sh)"
if [ "$(uname -s)" = "Darwin" ]; then
  echo "  en service       : (cd $DIR && ./svc.sh install && ./svc.sh start)"
fi
echo
echo "Vérification : gh api repos/$REPO/actions/runners --jq '.runners[].name'"
