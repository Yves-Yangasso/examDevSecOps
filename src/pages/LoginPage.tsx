import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ValidationError } from '@/api/auth';
import { log } from '@/observability/logger';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await signIn({ username, password });
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      // Message générique : ne pas révéler si le compte existe (énumération).
      setError(
        err instanceof ValidationError
          ? err.message
          : 'Identifiants invalides ou service indisponible.',
      );
      log('warn', 'login.failed', { username, password });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page page-narrow">
      <h1>Connexion</h1>
      <p className="hint">
        Compte de démonstration Fake Store API : <code>mor_2314</code> / <code>83r5^_</code>
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="username">Nom d&apos;utilisateur</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={64}
          required
        />

        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          maxLength={128}
          required
        />

        {error && (
          <p className="error" role="alert" data-testid="login-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending}>
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
