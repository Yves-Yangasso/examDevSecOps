import type { Product } from '@/api/products';

interface Props {
  product: Product;
  onAdd: (product: Product) => void;
}

const priceFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

export function ProductCard({ product, onAdd }: Props) {
  return (
    <article className="card" data-testid={`product-${product.id}`}>
      {product.image ? (
        <img src={product.image} alt="" loading="lazy" width={160} height={160} />
      ) : (
        <div className="card-image-placeholder" aria-hidden="true" />
      )}
      <h3>{product.title}</h3>
      <p className="category">{product.category}</p>
      <p className="price">{priceFormatter.format(product.price)}</p>
      <button type="button" onClick={() => onAdd(product)}>
        Ajouter au panier
      </button>
    </article>
  );
}

export { priceFormatter };
