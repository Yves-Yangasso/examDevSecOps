import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '@/context/CartContext';
import { AuthProvider } from '@/context/AuthContext';
import { CatalogPage } from '@/pages/CatalogPage';
import { Header } from '@/components/Header';

const catalogue = [
  { id: 1, title: 'Sac à dos', price: 109.95, description: '', category: 'sacs', image: '' },
  { id: 2, title: 'T-shirt coton', price: 22.3, description: '', category: 'vetements', image: '' },
  {
    id: 3,
    title: 'Veste imperméable',
    price: 55.99,
    description: '',
    category: 'vetements',
    image: '',
  },
];

function stubCatalog(body: unknown = catalogue, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 503, json: async () => body } as Response),
  );
}

function renderCatalog() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <CartProvider>
          <Header />
          <CatalogPage />
        </CartProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('CatalogPage', () => {
  it('affiche les produits récupérés depuis lAPI', async () => {
    stubCatalog();
    renderCatalog();
    expect(await screen.findByTestId('product-1')).toBeInTheDocument();
    expect(screen.getByTestId('result-count')).toHaveTextContent('3 produits');
  });

  it('filtre par catégorie', async () => {
    stubCatalog();
    const user = userEvent.setup();
    renderCatalog();
    await screen.findByTestId('product-1');

    await user.selectOptions(screen.getByLabelText(/catégorie/i), 'vetements');

    expect(screen.getByTestId('result-count')).toHaveTextContent('2 produits');
    expect(screen.queryByTestId('product-1')).not.toBeInTheDocument();
  });

  it('filtre par recherche textuelle', async () => {
    stubCatalog();
    const user = userEvent.setup();
    renderCatalog();
    await screen.findByTestId('product-1');

    await user.type(screen.getByLabelText(/rechercher/i), 'veste');

    expect(screen.getByTestId('result-count')).toHaveTextContent('1 produit');
  });

  it('ajoute un produit au panier et met à jour le compteur den-tête', async () => {
    stubCatalog();
    const user = userEvent.setup();
    renderCatalog();
    await screen.findByTestId('product-1');

    const card = screen.getByTestId('product-1');
    await user.click(card.querySelector('button') as HTMLButtonElement);
    await user.click(card.querySelector('button') as HTMLButtonElement);

    expect(screen.getByTestId('cart-link')).toHaveTextContent('2');
  });

  it('affiche un message derreur si lAPI est indisponible', async () => {
    stubCatalog({}, false);
    renderCatalog();
    expect(await screen.findByRole('alert')).toHaveTextContent(/catalogue indisponible/i);
  });
});
