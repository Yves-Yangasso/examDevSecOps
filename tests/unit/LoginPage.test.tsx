import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { LoginPage } from '@/pages/LoginPage';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <CartProvider>
          <LoginPage />
        </CartProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  it('affiche un message générique en cas déchec dauthentification', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/nom d'utilisateur/i), 'mauvais');
    await user.type(screen.getByLabelText(/mot de passe/i), 'mauvais');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    const error = await screen.findByTestId('login-error');
    // Le message ne doit pas révéler si le compte existe (anti-énumération).
    expect(error).toHaveTextContent(/identifiants invalides ou service indisponible/i);
    expect(error.textContent).not.toMatch(/utilisateur inconnu|mot de passe incorrect/i);
  });

  it('valide côté client avant tout appel réseau', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/mot de passe/i), 'secret');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByTestId('login-error')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('utilise un champ de type password (pas de saisie en clair)', () => {
    renderLogin();
    expect(screen.getByLabelText(/mot de passe/i)).toHaveAttribute('type', 'password');
  });
});
