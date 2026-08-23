import { useMemo, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { useProducts } from '@/hooks/useProducts';
import { useCart } from '@/context/CartContext';

export function CatalogPage() {
  const { products, loading, error } = useProducts();
  const { add } = useCart();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category === 'all' || p.category === category) &&
        (needle === '' || p.title.toLowerCase().includes(needle)),
    );
  }, [products, category, query]);

  if (loading) {
    return (
      <main className="page">
        <p role="status">Chargement du catalogue…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <p className="error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Catalogue</h1>

      <div className="filters">
        <label htmlFor="search">Rechercher</label>
        <input
          id="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom du produit"
        />

        <label htmlFor="category">Catégorie</label>
        <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === 'all' ? 'Toutes' : c}
            </option>
          ))}
        </select>
      </div>

      <p className="count" data-testid="result-count">
        {visible.length} produit{visible.length > 1 ? 's' : ''}
      </p>

      <div className="grid">
        {visible.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={add} />
        ))}
      </div>
    </main>
  );
}
