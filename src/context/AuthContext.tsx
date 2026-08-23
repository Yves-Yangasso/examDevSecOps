import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, type Credentials } from '@/api/auth';
import { hadSession } from '@/api/tokenStore';

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  signIn: (credentials: Credentials) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);

  const signIn = useCallback(async (credentials: Credentials) => {
    await apiLogin(credentials);
    setUsername(credentials.username);
  }, []);

  const signOut = useCallback(() => {
    apiLogout();
    setUsername(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ isAuthenticated: username !== null, username, signIn, signOut }),
    [username, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider.');
  return ctx;
}

/** Exporté pour l'écran de reconnexion : une session a existé dans cet onglet. */
export { hadSession };
