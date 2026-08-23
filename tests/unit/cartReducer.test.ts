import { describe, expect, it } from 'vitest';
import { cartReducer, cartTotal, type CartLine } from '@/context/CartContext';
import type { Product } from '@/api/products';

const product = (id: number, price: number): Product => ({
  id,
  title: `Produit ${id}`,
  price,
  description: '',
  category: 'test',
  image: '',
});

describe('cartReducer', () => {
  it('ajoute un produit absent avec une quantité de 1', () => {
    const state = cartReducer([], { type: 'add', product: product(1, 10) });
    expect(state).toHaveLength(1);
    expect(state[0]?.quantity).toBe(1);
  });

  it('incrémente la quantité si le produit est déjà présent', () => {
    const p = product(1, 10);
    const state = cartReducer(cartReducer([], { type: 'add', product: p }), {
      type: 'add',
      product: p,
    });
    expect(state).toHaveLength(1);
    expect(state[0]?.quantity).toBe(2);
  });

  it('plafonne la quantité à 99', () => {
    const lines: CartLine[] = [{ product: product(1, 10), quantity: 99 }];
    const state = cartReducer(lines, { type: 'add', product: product(1, 10) });
    expect(state[0]?.quantity).toBe(99);
  });

  it('retire la ligne quand la quantité passe à 0 ou moins', () => {
    const lines: CartLine[] = [{ product: product(1, 10), quantity: 3 }];
    expect(cartReducer(lines, { type: 'setQuantity', productId: 1, quantity: 0 })).toHaveLength(0);
    expect(cartReducer(lines, { type: 'setQuantity', productId: 1, quantity: -5 })).toHaveLength(0);
  });

  it('ignore une quantité non finie', () => {
    const lines: CartLine[] = [{ product: product(1, 10), quantity: 3 }];
    expect(cartReducer(lines, { type: 'setQuantity', productId: 1, quantity: NaN })).toHaveLength(
      0,
    );
  });

  it('supprime une ligne et vide le panier', () => {
    const lines: CartLine[] = [
      { product: product(1, 10), quantity: 1 },
      { product: product(2, 20), quantity: 1 },
    ];
    expect(cartReducer(lines, { type: 'remove', productId: 1 })).toHaveLength(1);
    expect(cartReducer(lines, { type: 'clear' })).toHaveLength(0);
  });
});

describe('cartTotal', () => {
  it('calcule le total sans erreur de virgule flottante', () => {
    const lines: CartLine[] = [
      { product: product(1, 0.1), quantity: 3 },
      { product: product(2, 0.2), quantity: 1 },
    ];
    // 0.1*3 + 0.2 vaut 0.5000000000000001 en arithmétique flottante naïve.
    expect(cartTotal(lines)).toBe(0.5);
  });

  it('renvoie 0 pour un panier vide', () => {
    expect(cartTotal([])).toBe(0);
  });
});
