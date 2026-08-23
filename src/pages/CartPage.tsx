import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import { priceFormatter } from '@/components/ProductCard';
import { log } from '@/observability/logger';

export function CartPage() {
  const { lines, total, itemCount, setQuantity, remove, clear } = useCart();
  const [confirmed, setConfirmed] = useState(false);

  if (lines.length === 0) {
    return (
      <main className="page page-narrow">
        <h1>Panier</h1>
        {confirmed ? (
          <p role="status" data-testid="order-confirmed">
            Commande enregistrée. Merci !
          </p>
        ) : (
          <p data-testid="cart-empty">Votre panier est vide.</p>
        )}
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <h1>Panier</h1>

      <table className="cart-table">
        <thead>
          <tr>
            <th scope="col">Produit</th>
            <th scope="col">Prix</th>
            <th scope="col">Quantité</th>
            <th scope="col">Sous-total</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ product, quantity }) => (
            <tr key={product.id} data-testid={`cart-line-${product.id}`}>
              <td>{product.title}</td>
              <td>{priceFormatter.format(product.price)}</td>
              <td>
                <label className="sr-only" htmlFor={`qty-${product.id}`}>
                  Quantité pour {product.title}
                </label>
                <input
                  id={`qty-${product.id}`}
                  type="number"
                  min={0}
                  max={99}
                  value={quantity}
                  onChange={(e) => {
                    // Un champ vidé au cours de la saisie ne doit pas supprimer
                    // la ligne : seuls un 0 explicite ou le bouton « Retirer »
                    // le font.
                    if (e.target.value === '') return;
                    setQuantity(product.id, Number(e.target.value));
                  }}
                />
              </td>
              <td>{priceFormatter.format(product.price * quantity)}</td>
              <td>
                <button type="button" onClick={() => remove(product.id)}>
                  Retirer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="total" data-testid="cart-total">
        Total ({itemCount} article{itemCount > 1 ? 's' : ''}) : {priceFormatter.format(total)}
      </p>

      <div className="cart-actions">
        <button type="button" onClick={clear}>
          Vider le panier
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            log('info', 'checkout.submitted', { itemCount, total });
            clear();
            setConfirmed(true);
          }}
        >
          Valider la commande
        </button>
      </div>
    </main>
  );
}
