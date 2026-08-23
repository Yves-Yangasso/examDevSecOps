#!/usr/bin/env bash
# Déploie une image vérifiée sur le Docker local, via un runner self-hosted.
#
# Usage : deploy-local.sh <environnement> <image@digest> <port> [version]
#
# Le script est idempotent et enregistre l'image précédente pour permettre un
# retour arrière : sans cet état, "rollback" ne veut rien dire sur une machine
# où aucun orchestrateur ne conserve d'historique de révisions.
set -euo pipefail

ENVIRONMENT="${1:?environnement requis (staging|production|canary)}"
IMAGE="${2:?image requise, référencée par digest}"
HOST_PORT="${3:?port hôte requis}"
VERSION="${4:-$(date -u +%Y%m%d%H%M%S)}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/deploy/compose/docker-compose.deploy.yml"
STATE_DIR="${SHOPFLOW_STATE_DIR:-$HOME/.shopflow}"
STATE_FILE="$STATE_DIR/$ENVIRONMENT.image"
PROJECT="shopflow-$ENVIRONMENT"

mkdir -p "$STATE_DIR"

# Mémorise l'image actuellement en service AVANT de la remplacer.
# On mémorise l'image ET sa version : restaurer l'image sans sa version
# casserait la corrélation entre les logs/traces émis et le déploiement réel.
PREVIOUS="$(docker inspect --format '{{index .Config.Image}}' "shopflow-$ENVIRONMENT" 2>/dev/null || true)"
if [ -n "$PREVIOUS" ]; then
  PREV_VERSION="$(docker inspect --format '{{index .Config.Labels "shopflow.version"}}' "shopflow-$ENVIRONMENT" 2>/dev/null || echo dev)"
  printf '%s\t%s\n' "$PREVIOUS" "$PREV_VERSION" > "$STATE_FILE"
  echo "Image précédente mémorisée : $PREVIOUS (version $PREV_VERSION)"
fi

echo "Déploiement de $IMAGE sur $ENVIRONMENT (port $HOST_PORT)"

SHOPFLOW_IMAGE="$IMAGE" \
APP_ENVIRONMENT="$ENVIRONMENT" \
APP_VERSION="$VERSION" \
APP_OTEL_EXPORTER_URL="${APP_OTEL_EXPORTER_URL:-}" \
HOST_PORT="$HOST_PORT" \
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --remove-orphans --pull always

# Attente active de la healthcheck : ne jamais déclarer un déploiement réussi
# sur la seule base du retour de `compose up`, qui ne dit rien de l'état réel.
echo -n "Attente de la healthcheck"
for _ in $(seq 1 30); do
  STATUS="$(docker inspect --format '{{.State.Health.Status}}' "shopflow-$ENVIRONMENT" 2>/dev/null || echo starting)"
  if [ "$STATUS" = "healthy" ]; then
    echo " — healthy"
    curl -sf "http://127.0.0.1:$HOST_PORT/healthz" > /dev/null
    echo "Déploiement $ENVIRONMENT terminé : $IMAGE"
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo
echo "::error::Le conteneur $ENVIRONMENT n'est pas devenu healthy en 60 s."
docker logs "shopflow-$ENVIRONMENT" --tail 50 || true
exit 1
