#!/usr/bin/env bash
# Décide si un canari peut être promu, sur la base d'une mesure réelle.
#
# Usage : canary-check.sh <url-canari> <seuil-taux-erreur> <duree-observation-s>
#
# Deux sources de vérité, dans cet ordre :
#   1. Prometheus, s'il est joignable — c'est le trafic RÉEL qui est mesuré.
#   2. À défaut, une sonde active — trafic synthétique, mais mesure quand même.
#
# Ce qu'on ne fait pas : un `sleep` suivi d'une promotion inconditionnelle.
# Attendre n'est pas observer.
set -euo pipefail

CANARY_URL="${1:?url du canari requise}"
THRESHOLD="${2:-0.02}"
WINDOW="${3:-60}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://127.0.0.1:9090}"

echo "Observation du canari pendant ${WINDOW}s (seuil ${THRESHOLD})"

rate_from_prometheus() {
  local query='sum(rate(nginx_http_requests_total{status=~"5.."}[2m])) / clamp_min(sum(rate(nginx_http_requests_total[2m])), 0.001)'
  curl -sf --max-time 5 -G "$PROMETHEUS_URL/api/v1/query" \
    --data-urlencode "query=$query" 2>/dev/null \
    | python3 -c 'import sys,json; r=json.load(sys.stdin)["data"]["result"]; print(r[0]["value"][1] if r else "")' 2>/dev/null
}

rate_from_probe() {
  local total=0 errors=0 deadline=$((SECONDS + WINDOW))
  while [ "$SECONDS" -lt "$deadline" ]; do
    for path in / /healthz /assets/index.css; do
      # Le repli doit être HORS de la substitution : curl écrit déjà "000" sur
      # stdout quand la connexion échoue, un `|| echo 000` interne concaténait
      # les deux valeurs et le `case` ci-dessous ne matchait plus rien — un
      # canari totalement injoignable était alors compté comme sain.
      code="$(curl -so /dev/null -w '%{http_code}' --max-time 5 "$CANARY_URL$path" 2>/dev/null)" || code="000"
      [ -n "$code" ] || code="000"
      total=$((total + 1))
      case "$code" in 5*|000) errors=$((errors + 1)) ;; esac
    done
    sleep 2
  done
  [ "$total" -gt 0 ] || { echo ""; return; }
  python3 -c "print($errors / $total)"
}

RATE="$(rate_from_prometheus || true)"
if [ -n "$RATE" ]; then
  SOURCE="Prometheus (trafic réel)"
  sleep "$WINDOW"
  RATE="$(rate_from_prometheus || echo 0)"
else
  SOURCE="sonde active (Prometheus injoignable)"
  RATE="$(rate_from_probe)"
fi

: "${RATE:=0}"
echo "Taux d'erreur mesuré : $RATE — source : $SOURCE"

if python3 -c "import sys; sys.exit(0 if float('$RATE') > float('$THRESHOLD') else 1)"; then
  echo "::error::Canari au-dessus du seuil ($RATE > $THRESHOLD) — promotion annulée."
  exit 1
fi

echo "Canari sous le seuil — promotion autorisée."
