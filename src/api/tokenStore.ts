/**
 * Stockage du jeton d'authentification.
 *
 * Décision de sécurité : le jeton vit en mémoire (variable de module) et n'est
 * PAS persisté dans localStorage.
 *
 * Pourquoi : localStorage est lisible par tout script exécuté sur l'origine, donc
 * un XSS unique suffit à exfiltrer le jeton de façon persistante. En mémoire, la
 * fenêtre d'exposition se limite à la session de l'onglet.
 *
 * Limite assumée (documentée dans le rapport) : la Fake Store API renvoie un JWT
 * dans le corps de la réponse, ce qui interdit le cookie httpOnly + SameSite qui
 * serait la solution correcte. La cible est un BFF qui pose ce cookie.
 */
let token: string | null = null;

/** Marqueur non sensible permettant de restaurer l'état UI après un refresh. */
const SESSION_FLAG = 'shopflow.session';

export function setToken(value: string): void {
  token = value;
  sessionStorage.setItem(SESSION_FLAG, '1');
}

export function getToken(): string | null {
  return token;
}

export function clearToken(): void {
  token = null;
  sessionStorage.removeItem(SESSION_FLAG);
}

export function hadSession(): boolean {
  return sessionStorage.getItem(SESSION_FLAG) === '1';
}
