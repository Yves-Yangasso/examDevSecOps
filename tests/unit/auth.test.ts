import { describe, expect, it, vi, beforeEach } from 'vitest';
import { login, logout, validateCredentials, ValidationError } from '@/api/auth';
import { getToken } from '@/api/tokenStore';

describe('validateCredentials', () => {
  it('rejette un nom dutilisateur vide', () => {
    expect(() => validateCredentials({ username: '   ', password: 'x' })).toThrow(ValidationError);
  });

  it('rejette un mot de passe vide', () => {
    expect(() => validateCredentials({ username: 'mor_2314', password: '' })).toThrow(
      ValidationError,
    );
  });

  it('rejette des entrées anormalement longues', () => {
    expect(() => validateCredentials({ username: 'a'.repeat(65), password: 'x' })).toThrow(
      ValidationError,
    );
    expect(() => validateCredentials({ username: 'a', password: 'x'.repeat(129) })).toThrow(
      ValidationError,
    );
  });

  it('accepte des identifiants valides', () => {
    expect(() => validateCredentials({ username: 'mor_2314', password: '83r5^_' })).not.toThrow();
  });
});

describe('login', () => {
  beforeEach(() => logout());

  it('stocke le jeton en mémoire, jamais dans localStorage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'jwt-de-test' }),
      } as Response),
    );

    await login({ username: 'mor_2314', password: '83r5^_' });

    expect(getToken()).toBe('jwt-de-test');
    expect(JSON.stringify(localStorage)).not.toContain('jwt-de-test');
  });

  it('échoue si la réponse ne contient pas de jeton', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response),
    );
    await expect(login({ username: 'a', password: 'b' })).rejects.toThrow();
    expect(getToken()).toBeNull();
  });

  it('efface le jeton à la déconnexion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'jwt' }),
      } as Response),
    );
    await login({ username: 'a', password: 'b' });
    logout();
    expect(getToken()).toBeNull();
  });
});
