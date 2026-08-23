import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider, useCart } from '@/context/CartContext';
import { CartPage } from '@/pages/CartPage';
import type { Product } from '@/api/products';
import { useEffect } from 'react';

const SAC: Product = {
  id: 1,
  title: 'Sac à dos',
  price: 109.95,
  description: '',
  category: 'sacs',
  image: '',
};
const TSHIRT: Product = {
  id: 2,
  title: 'T-shirt',
  price: 22.3,
  description: '',
  category: 'vetements',
  image: '',
};

/** Pré-remplit le panier avant le rendu de la page testée. */
function Seed({ items }: { items: Array<[Product, number]> }) {
  const { add, setQuantity } = useCart();
  useEffect(() => {
    for (const [product, quantity] of items) {
      add(product);
      if (quantity > 1) setQuantity(product.id, quantity);
    }
    // Amorçage unique : les dépendances sont volontairement figées.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderCart(items: Array<[Product, number]> = []) {
  return render(
    <MemoryRouter>
      <CartProvider>
        <Seed items={items} />
        <CartPage />
      </CartProvider>
    </MemoryRouter>,
  );
}

describe('CartPage', () => {
  it('affiche un panier vide', () => {
    renderCart();
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
  });

  it('calcule le total à partir des lignes et des quantités', () => {
    renderCart([
      [SAC, 1],
      [TSHIRT, 2],
    ]);
    // 109,95 + 2 x 22,30 = 154,55
    expect(screen.getByTestId('cart-total')).toHaveTextContent('154,55');
    expect(screen.getByTestId('cart-total')).toHaveTextContent('3 articles');
  });

  it('met à jour le total quand la quantité change', () => {
    renderCart([[TSHIRT, 1]]);

    // fireEvent.change plutôt que user.type : un <input type="number"> ne se
    // sélectionne pas au clavier dans jsdom, et on veut poser une valeur, pas
    // simuler une frappe caractère par caractère.
    fireEvent.change(screen.getByLabelText(/quantité pour t-shirt/i), {
      target: { value: '4' },
    });

    expect(screen.getByTestId('cart-total')).toHaveTextContent('89,20');
  });

  it('supprime une ligne via le bouton Retirer', async () => {
    const user = userEvent.setup();
    renderCart([
      [SAC, 1],
      [TSHIRT, 1],
    ]);

    await user.click(
      screen.getByTestId('cart-line-1').querySelector('button') as HTMLButtonElement,
    );

    expect(screen.queryByTestId('cart-line-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('cart-line-2')).toBeInTheDocument();
  });

  it('vide le panier', async () => {
    const user = userEvent.setup();
    renderCart([[SAC, 1]]);

    await user.click(screen.getByRole('button', { name: /vider le panier/i }));

    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
  });

  it('valide la commande puis vide le panier', async () => {
    const user = userEvent.setup();
    renderCart([[SAC, 2]]);

    await user.click(screen.getByRole('button', { name: /valider la commande/i }));

    expect(screen.getByTestId('order-confirmed')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-line-1')).not.toBeInTheDocument();
  });

  it('ne supprime pas la ligne quand le champ quantité est vidé en cours de saisie', async () => {
    const user = userEvent.setup();
    renderCart([[TSHIRT, 2]]);

    await user.clear(screen.getByLabelText(/quantité pour t-shirt/i));

    expect(screen.getByTestId('cart-line-2')).toBeInTheDocument();
  });

  it('plafonne la quantité saisie à 99', () => {
    renderCart([[TSHIRT, 1]]);

    const input = screen.getByLabelText(/quantité pour t-shirt/i);
    fireEvent.change(input, { target: { value: '150' } });

    expect(input).toHaveValue(99);
  });
});
