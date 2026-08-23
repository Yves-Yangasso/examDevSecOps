import { useEffect, useState } from 'react';
import { fetchProducts, type Product } from '@/api/products';
import { log } from '@/observability/logger';

interface State {
  products: Product[];
  loading: boolean;
  error: string | null;
}

export function useProducts(): State {
  const [state, setState] = useState<State>({ products: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();

    fetchProducts()
      .then((products) => {
        if (cancelled) return;
        log('info', 'catalog.loaded', {
          count: products.length,
          durationMs: Math.round(performance.now() - started),
        });
        setState({ products, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        log('error', 'catalog.failed', { reason: err.message });
        setState({ products: [], loading: false, error: 'Catalogue indisponible pour le moment.' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
