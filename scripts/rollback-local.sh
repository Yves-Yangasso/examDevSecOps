#!/usr/bin/env bash
# Restaure l'image précédente d'un environnement local.
#
# Le retour arrière est un chemin de code comme un autre : s'il n'est jamais
# exécuté, il ne fonctionne pas le jour où on en a besoin. Il est ici appelé
# automatiquement par le workflow en cas d'échec.
set -euo pipefail

ENVIRONMENT="${1:?environnement requis}"
HOST_PORT="${2:?port hôte requis}"

STATE_DIR="${SHOPFLOW_STATE_DIR:-$HOME/.shopflow}"
STATE_FILE="$STATE_DIR/$ENVIRONMENT.image"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -s "$STATE_FILE" ]; then
  echo "::warning::Aucune image précédente enregistrée pour $ENVIRONMENT — rien à restaurer."
  exit 0
fi

IFS=$'\t' read -r PREVIOUS PREV_VERSION < "$STATE_FILE"
: "${PREV_VERSION:=dev}"
echo "::warning::Retour arrière de $ENVIRONMENT vers $PREVIOUS (version $PREV_VERSION)"
exec "$ROOT/scripts/deploy-local.sh" "$ENVIRONMENT" "$PREVIOUS" "$HOST_PORT" "$PREV_VERSION"
