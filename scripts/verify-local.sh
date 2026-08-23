#!/usr/bin/env bash
# Reproduit localement la porte de qualité de la CI.
#
# Pourquoi : un pipeline qu'on ne peut pas rejouer sur son poste crée des
# allers-retours de 15 minutes par tentative. Ici, le même verdict en local.
set -euo pipefail

step() { printf '\n\033[1;34m▸ %s\033[0m\n' "$1"; }

step "Installation"
npm ci --ignore-scripts

step "Lint"
npm run lint

step "Types"
npm run typecheck

step "Tests unitaires + couverture"
npm run test:coverage

step "Build"
npm run build

step "Image conteneur"
docker build -t shopflow:local .

step "Scan de vulnérabilités"
if command -v trivy >/dev/null 2>&1; then
  trivy image --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed=false shopflow:local
else
  echo "trivy absent — installer avec : brew install trivy"
fi

step "Tests E2E sur le conteneur"
docker rm -f shopflow-local >/dev/null 2>&1 || true
docker run -d --name shopflow-local -p 8080:8080 shopflow:local >/dev/null
trap 'docker rm -f shopflow-local >/dev/null 2>&1 || true' EXIT
timeout 60 bash -c 'until curl -sf http://127.0.0.1:8080/healthz >/dev/null; do sleep 2; done'
E2E_BASE_URL=http://127.0.0.1:8080 npm run test:e2e

printf '\n\033[1;32m✓ Porte de qualité franchie localement.\033[0m\n'
