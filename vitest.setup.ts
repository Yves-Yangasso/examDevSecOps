import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Compat Node >= 22 : le `localStorage` expérimental de Node masque celui de
 * jsdom et vaut `undefined` sans l'option --localstorage-file. On installe donc
 * une implémentation mémoire.
 *
 * Ce n'est pas cosmétique : les tests de sécurité vérifient que le jeton
 * n'atterrit JAMAIS dans le web storage. Sans stockage fonctionnel, ces
 * assertions passeraient sur du vide et donneraient une fausse garantie.
 */
function createMemoryStorage(): Storage {
  let data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    clear: () => void (data = new Map()),
  } as Storage;
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (!globalThis[name]) {
    Object.defineProperty(globalThis, name, {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
