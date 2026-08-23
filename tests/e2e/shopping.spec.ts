import { test, expect } from './fixtures';

test.describe('Parcours dachat', () => {
  test('le catalogue saffiche et se filtre', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('product-1')).toBeVisible();
    await expect(page.getByTestId('result-count')).toHaveText('3 produits');

    await page.getByLabel('Catégorie').selectOption('jewelery');
    await expect(page.getByTestId('result-count')).toHaveText('1 produit');
  });

  test('le panier est protégé tant que lutilisateur nest pas connecté', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  });

  test('parcours complet : connexion, ajout au panier, validation', async ({ page }) => {
    await page.goto('/');

    await page
      .getByTestId('product-1')
      .getByRole('button', { name: /ajouter/i })
      .click();
    await page
      .getByTestId('product-2')
      .getByRole('button', { name: /ajouter/i })
      .click();
    await page
      .getByTestId('product-2')
      .getByRole('button', { name: /ajouter/i })
      .click();
    await expect(page.getByTestId('cart-link')).toContainText('3');

    await page.getByRole('link', { name: /connexion/i }).click();
    await page.getByLabel("Nom d'utilisateur").fill('mor_2314');
    await page.getByLabel('Mot de passe').fill('83r5^_');
    await page.getByRole('button', { name: /se connecter/i }).click();

    await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();

    await page.getByTestId('cart-link').click();
    // 109.95 + 2 x 22.30 = 154.55
    await expect(page.getByTestId('cart-total')).toContainText('154,55');

    await page.getByRole('button', { name: /valider la commande/i }).click();
    await expect(page.getByTestId('order-confirmed')).toBeVisible();
  });

  test('des identifiants erronés affichent un message générique', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel("Nom d'utilisateur").fill('inconnu');
    await page.getByLabel('Mot de passe').fill('faux');
    await page.getByRole('button', { name: /se connecter/i }).click();

    await expect(page.getByTestId('login-error')).toContainText(/identifiants invalides/i);
  });

  test('le jeton nest jamais persisté dans localStorage', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel("Nom d'utilisateur").fill('mor_2314');
    await page.getByLabel('Mot de passe').fill('83r5^_');
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();

    const dump = await page.evaluate(() => JSON.stringify(window.localStorage));
    expect(dump).not.toContain('jeton-e2e');
  });
});
