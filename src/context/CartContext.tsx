import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { Product } from '@/api/products';

export interface CartLine {
  product: Product;
  quantity: number;
}

type Action =
  | { type: 'add'; product: Product }
  | { type: 'remove'; productId: number }
  | { type: 'setQuantity'; productId: number; quantity: number }
  | { type: 'clear' };

const MAX_QUANTITY = 99;

export function cartReducer(state: CartLine[], action: Action): CartLine[] {
  switch (action.type) {
    case 'add': {
      const existing = state.find((l) => l.product.id === action.product.id);
      if (!existing) return [...state, { product: action.product, quantity: 1 }];
      return state.map((l) =>
        l.product.id === action.product.id
          ? { ...l, quantity: Math.min(l.quantity + 1, MAX_QUANTITY) }
          : l,
      );
    }
    case 'remove':
      return state.filter((l) => l.product.id !== action.productId);
    case 'setQuantity': {
      const quantity = Math.trunc(action.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return state.filter((l) => l.product.id !== action.productId);
      }
      return state.map((l) =>
        l.product.id === action.productId
          ? { ...l, quantity: Math.min(quantity, MAX_QUANTITY) }
          : l,
      );
    }
    case 'clear':
      return [];
  }
}

export function cartTotal(lines: CartLine[]): number {
  const cents = lines.reduce((sum, l) => sum + Math.round(l.product.price * 100) * l.quantity, 0);
  return cents / 100;
}

interface CartState {
  lines: CartLine[];
  itemCount: number;
  total: number;
  add: (product: Product) => void;
  remove: (productId: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, []);

  const add = useCallback((product: Product) => dispatch({ type: 'add', product }), []);
  const remove = useCallback((productId: number) => dispatch({ type: 'remove', productId }), []);
  const setQuantity = useCallback(
    (productId: number, quantity: number) => dispatch({ type: 'setQuantity', productId, quantity }),
    [],
  );
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  const value = useMemo<CartState>(
    () => ({
      lines,
      itemCount: lines.reduce((n, l) => n + l.quantity, 0),
      total: cartTotal(lines),
      add,
      remove,
      setQuantity,
      clear,
    }),
    [lines, add, remove, setQuantity, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé dans un CartProvider.');
  return ctx;
}
