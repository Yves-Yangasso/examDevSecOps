/**
 * Configuration runtime.
 *
 * Les valeurs sont injectées au *build* par Vite (import.meta.env) mais peuvent être
 * surchargées au *runtime* par le fichier /config.js servi par nginx et généré au
 * démarrage du conteneur (voir docker/entrypoint.sh).
 *
 * Pourquoi : une même image immuable doit pouvoir être promue de staging vers prod
 * sans rebuild (principe "build once, deploy many"). Rebuilder par environnement
 * casserait la traçabilité entre l'artefact testé et l'artefact déployé.
 */
export interface RuntimeConfig {
  apiBaseUrl: string;
  otelExporterUrl: string;
  environment: string;
  appVersion: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<RuntimeConfig>;
  }
}

const fallback: RuntimeConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'https://fakestoreapi.com',
  otelExporterUrl: import.meta.env.VITE_OTEL_EXPORTER_URL ?? '',
  environment: import.meta.env.VITE_ENVIRONMENT ?? 'local',
  appVersion: import.meta.env.VITE_APP_VERSION ?? 'dev',
};

export function getConfig(): RuntimeConfig {
  return { ...fallback, ...(window.__APP_CONFIG__ ?? {}) };
}
