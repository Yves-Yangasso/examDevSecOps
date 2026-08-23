import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getConfig } from '@/api/config';

/**
 * Traçage distribué OpenTelemetry.
 *
 * Pourquoi OTel : standard CNCF, indépendant du backend. On peut basculer de
 * Tempo vers Jaeger ou un SaaS sans toucher au code applicatif — pas de
 * verrouillage fournisseur sur la donnée de télémétrie.
 */
export function initTracing(): void {
  const { otelExporterUrl, environment, appVersion } = getConfig();
  // Désactivé si non configuré (dev local, tests) : aucune requête réseau
  // parasite et aucun bruit dans la console.
  if (!otelExporterUrl) return;

  const provider = new WebTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'shopflow-frontend',
      [ATTR_SERVICE_VERSION]: appVersion,
      'deployment.environment.name': environment,
    }),
  });

  // BatchSpanProcessor : les spans partent groupés. Un envoi par span
  // saturerait le réseau du client et dégraderait la métrique qu'on mesure.
  provider.addSpanProcessor(
    new BatchSpanProcessor(new OTLPTraceExporter({ url: otelExporterUrl })),
  );

  provider.register({ contextManager: new ZoneContextManager() });

  registerInstrumentations({
    instrumentations: [
      getWebAutoInstrumentations({
        '@opentelemetry/instrumentation-fetch': {
          // Propage le contexte de trace vers le backend : une trace unique
          // relie le clic utilisateur à la requête serveur.
          propagateTraceHeaderCorsUrls: [/fakestoreapi\.com/],
        },
        '@opentelemetry/instrumentation-xml-http-request': { enabled: false },
      }),
    ],
  });
}
