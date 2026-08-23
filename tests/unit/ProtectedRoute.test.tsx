import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { CartPage } from '@/pages/CartPage';

describe('ProtectedRoute', () => {
  it('redirige un visiteur non authentifié vers /login', () => {
    render(
      <MemoryRouter initialEntries={['/cart']}>
        <AuthProvider>
          <CartProvider>
            <Routes>
              <Route path="/login" element={<h1>Connexion</h1>} />
              <Route
                path="/cart"
                element={
                  <ProtectedRoute>
                    <CartPage />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </CartProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /connexion/i })).toBeInTheDocument();
    expect(screen.queryByTestId('cart-empty')).not.toBeInTheDocument();
  });
});
