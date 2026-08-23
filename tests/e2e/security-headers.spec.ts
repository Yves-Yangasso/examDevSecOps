import { test, expect } from './fixtures';

/**
 * Ces tests ne valent que contre le conteneur nginx (E2E_BASE_URL défini en CI).
 * Le serveur de dev Vite ne pose pas ces en-têtes : on les saute alors.
 *
 * Pourquoi les tester : une CSP est une configuration silencieuse. Sans test,
 * une régression de la conf nginx ne se voit qu'en audit de sécurité, des mois
 * plus tard. Ici, elle casse le pipeline.
 */
const runsAgainstContainer = !!process.env.E2E_BASE_URL;

test.describe('En-têtes de sécurité HTTP', () => {
  test.skip(!runsAgainstContainer, 'Nécessite le conteneur nginx (E2E_BASE_URL).');

  test('les en-têtes de durcissement sont présents', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response?.headers() ?? {};

    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    // La bannière serveur ne doit pas divulguer la version de nginx.
    expect(headers['server'] ?? '').not.toMatch(/\d+\.\d+\.\d+/);
  });

  test('lendpoint de santé répond', async ({ request }) => {
    const response = await request.get('/healthz');
    expect(response.status()).toBe(200);
  });

  test('les métriques nginx sont exposées pour Prometheus', async ({ request }) => {
    const response = await request.get('/nginx_status');
    expect([200, 403]).toContain(response.status());
  });
});
