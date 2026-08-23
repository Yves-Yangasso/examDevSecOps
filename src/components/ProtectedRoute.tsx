import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';

/**
 * Garde de route côté client.
 *
 * Attention : c'est du confort d'UX, pas un contrôle de sécurité. L'autorisation
 * réelle est et reste la responsabilité de l'API. Tout code livré au navigateur
 * est par définition sous le contrôle de l'utilisateur.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
