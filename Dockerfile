# syntax=docker/dockerfile:1.7

###############################################################################
# Images de base épinglées par DIGEST, pas seulement par tag.
#
# Pourquoi : un tag est mutable. `node:22-alpine` ne désigne pas le même
# contenu aujourd'hui et dans trois mois, ce qui rend un build non
# reproductible et ouvre la porte à une substitution d'image en amont.
# Le digest est le seul identifiant qui garantit "le même bit à bit".
# Dependabot met ces digests à jour par PR, donc la mise à jour reste tracée.
###############################################################################
ARG NODE_IMAGE=node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.31-alpine@sha256:f972e5322b9797dc2a6b830030094426437b1ae7032e4644496395336ac6fdac

###############################################################################
# Étage 1 — dépendances
#
# Isolé de l'étage build pour que le cache Docker ne soit invalidé que lorsque
# package*.json change, et non à chaque modification de code source.
###############################################################################
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` (et non `npm install`) : installation déterministe depuis le lockfile.
# Un build reproductible est la condition d'un SBOM et d'une signature qui ont
# du sens. `--ignore-scripts` neutralise les scripts postinstall, vecteur
# classique de compromission supply-chain.
RUN npm ci --ignore-scripts

###############################################################################
# Étage 2 — build
###############################################################################
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /app

ARG APP_VERSION=dev
ARG VITE_API_BASE_URL=https://fakestoreapi.com
ENV VITE_APP_VERSION=${APP_VERSION} \
    VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

###############################################################################
# Étage 3 — runtime
#
# nginx-unprivileged : l'image tourne en UID 101 non-root et écoute sur le port
# 8080 (pas de capability NET_BIND_SERVICE requise). Aucun binaire Node, aucun
# gestionnaire de paquets, aucun code source dans l'image finale — seulement
# des fichiers statiques.
#
# Conséquence directe et mesurée : le scan Trivy de l'image finale ne voit ni
# les CVE de la toolchain Node ni celles des dépendances de développement,
# parce qu'elles ne sont tout simplement pas livrées.
###############################################################################
FROM ${NGINX_IMAGE} AS runtime

# Métadonnées OCI : traçabilité de l'artefact jusqu'au commit qui l'a produit.
ARG APP_VERSION=dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="shopflow-frontend" \
      org.opencontainers.image.description="Frontend e-commerce ShopFlow (Fake Store API)" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="MIT"

USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/default.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY docker/entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh \
 && chown -R 101:101 /usr/share/nginx/html /etc/nginx/conf.d

COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html

# Les sourcemaps servent au débogage via l'outillage d'observabilité, mais ne
# doivent pas être publiées : elles exposent le code source original.
# nginx les refuse déjà (règle `location ~ \.map$`), on les retire aussi de
# l'image pour que le scan de secrets ne les voie même pas.
RUN find /usr/share/nginx/html -name '*.map' -delete

USER 101
EXPOSE 8080

# Healthcheck applicatif : Kubernetes/Compose peuvent retirer une instance
# défaillante du service au lieu de router du trafic vers un conteneur mort.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
