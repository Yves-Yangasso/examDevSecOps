import { test as base, type Page } from '@playwright/test';

export const PRODUCTS = [
  {
    id: 1,
    title: 'Sac à dos Fjallraven',
    price: 109.95,
    description: 'Sac à dos pour ordinateur portable',
    category: "men's clothing",
    image: 'https://fakestoreapi.com/img/81fPKd-2AYL._AC_SL1500_.jpg',
  },
  {
    id: 2,
    title: 'T-shirt slim fit',
    price: 22.3,
    description: 'Coupe ajustée',
    category: "men's clothing",
    image: 'https://fakestoreapi.com/img/71-3HjGNDUL._AC_SY879._SX._UX._SY._UY_.jpg',
  },
  {
    id: 3,
    title: 'Bracelet en or blanc',
    price: 695,
    description: 'Bijou',
    category: 'jewelery',
    image: 'https://fakestoreapi.com/img/71pWzhdJNwL._AC_UL640_QL65_ML3_.jpg',
  },
];

/**
 * Les E2E interceptent l'API tierce.
 *
 * Pourquoi : un pipeline ne doit pas échouer parce qu'une API publique gratuite
 * est momentanément indisponible. On teste NOTRE application, pas la disponibilité
 * de fakestoreapi.com. Un job "smoke" séparé, non bloquant, vérifie l'intégration
 * réelle après déploiement.
 */
export async function stubApi(page: Page): Promise<void> {
  await page.route('**/products/categories', (route) =>
    route.fulfill({ json: ["men's clothing", 'jewelery'] }),
  );
  await page.route('**/products', (route) => route.fulfill({ json: PRODUCTS }));
  await page.route('**/auth/login', async (route) => {
    const body = route.request().postDataJSON() as { username?: string; password?: string };
    if (body?.username === 'mor_2314' && body?.password === '83r5^_') {
      await route.fulfill({ json: { token: 'jeton-e2e' } });
    } else {
      await route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    }
  });
  // Les images distantes ralentissent les E2E sans rien apporter au test.
  await page.route('**/img/**', (route) => route.abort());
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await stubApi(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
