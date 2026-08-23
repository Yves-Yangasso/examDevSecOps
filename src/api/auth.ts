import { request } from './client';
import { setToken, clearToken } from './tokenStore';

interface LoginResponse {
  token: string;
}

export interface Credentials {
  username: string;
  password: string;
}

/** Erreur de validation côté client, distincte d'une erreur transport. */
export class ValidationError extends Error {}

export function validateCredentials({ username, password }: Credentials): void {
  if (!username.trim()) throw new ValidationError("Le nom d'utilisateur est requis.");
  if (!password) throw new ValidationError('Le mot de passe est requis.');
  if (username.length > 64 || password.length > 128) {
    throw new ValidationError('Identifiants trop longs.');
  }
}

export async function login(credentials: Credentials): Promise<void> {
  validateCredentials(credentials);
  const data = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  if (!data?.token) throw new Error('Réponse dauthentification invalide.');
  setToken(data.token);
}

export function logout(): void {
  clearToken();
}
