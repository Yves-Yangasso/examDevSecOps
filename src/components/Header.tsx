import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';

export function Header() {
  const { isAuthenticated, username, signOut } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();

  return (
    <header className="header">
      <Link to="/" className="brand">
        ShopFlow
      </Link>
      <nav>
        <Link to="/">Catalogue</Link>
        <Link to="/cart" data-testid="cart-link">
          Panier <span className="badge">{itemCount}</span>
        </Link>
        {isAuthenticated ? (
          <>
            <span className="user">{username}</span>
            <button
              type="button"
              onClick={() => {
                signOut();
                navigate('/login');
              }}
            >
              Déconnexion
            </button>
          </>
        ) : (
          <Link to="/login">Connexion</Link>
        )}
      </nav>
    </header>
  );
}
