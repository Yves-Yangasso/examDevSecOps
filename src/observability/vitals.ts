import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { log } from './logger';

/**
 * RUM (Real User Monitoring) : les Core Web Vitals mesurés chez l'utilisateur réel.
 *
 * Pourquoi : un score Lighthouse en CI mesure un laboratoire. Seul le RUM révèle
 * la performance perçue sur le parc réel (réseau mobile, terminaux anciens) et
 * permet d'alerter sur une régression introduite par un déploiement.
 */
function report(metric: Metric): void {
  log('info', 'web-vital', {
    metric: metric.name,
    value: Math.round(metric.value * 1000) / 1000,
    rating: metric.rating,
    navigationType: metric.navigationType,
  });
}

export function initWebVitals(): void {
  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
}
