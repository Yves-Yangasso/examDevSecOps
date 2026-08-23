#!/bin/sh
# Génère la configuration runtime à partir des variables d'environnement.
#
# Pourquoi : l'image est construite une seule fois puis promue staging -> prod.
# L'artefact déployé en production est bit à bit celui qui a été testé et signé.
# Rebuilder par environnement invaliderait toute la chaîne de confiance.
#
# Le fichier est écrit dans /tmp et non dans la racine web : le conteneur tourne
# avec un système de fichiers racine en LECTURE SEULE (readOnlyRootFilesystem).
# nginx sert ce chemin via un alias.
#
# Règle : n'exposer ici QUE des valeurs publiques. Tout ce qui est écrit dans
# config.js est lisible par n'importe quel visiteur.
set -eu

RUNTIME_DIR=/tmp/shopflow
mkdir -p "$RUNTIME_DIR"

cat > "$RUNTIME_DIR/config.js" <<EOF
window.__APP_CONFIG__ = {
  apiBaseUrl: "${APP_API_BASE_URL:-https://fakestoreapi.com}",
  otelExporterUrl: "${APP_OTEL_EXPORTER_URL:-}",
  environment: "${APP_ENVIRONMENT:-production}",
  appVersion: "${APP_VERSION:-dev}"
};
EOF

echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"info\",\"message\":\"runtime config generee\",\"env\":\"${APP_ENVIRONMENT:-production}\",\"version\":\"${APP_VERSION:-dev}\"}"
