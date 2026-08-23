import { getConfig } from './config';
import { getToken } from './tokenStore';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Client HTTP minimal.
 *
 * Choix : `fetch` natif plutôt qu'axios. Une dépendance de moins dans le graphe =
 * une surface d'attaque supply-chain réduite et un bundle plus léger.
 */
export async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const { auth = false, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const { apiBaseUrl } = getConfig();

  const headers = new Headers(rest.headers);
  headers.set('Accept', 'application/json');
  if (rest.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (auth) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...rest,
      headers,
      signal: controller.signal,
      // Pas de cookies cross-origin : l'API publique n'en utilise pas et cela
      // évite tout risque de CSRF ambiant.
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new ApiError(`Requête ${path} échouée (HTTP ${response.status})`, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(`Délai dépassé sur ${path}`, 408);
    }
    throw new ApiError(`Erreur réseau sur ${path}`, 0);
  } finally {
    clearTimeout(timer);
  }
}
