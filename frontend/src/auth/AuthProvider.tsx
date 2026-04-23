import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

// Simple shared-secret auth: user types a password, we base64-encode with a
// fixed username and send it as `Authorization: Basic …` on every API call.
// Credentials live in sessionStorage — cleared when the tab closes.

const SANDBOX_USERNAME = import.meta.env.VITE_SANDBOX_USERNAME ?? 'sandbox';
const STORAGE_KEY = 'sutton5050.basicAuth';

interface AuthContextType {
  credentials: string | null;
  isAuthenticated: boolean;
  login: (password: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  credentials: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<string | null>(() =>
    sessionStorage.getItem(STORAGE_KEY),
  );

  useEffect(() => {
    if (credentials) {
      sessionStorage.setItem(STORAGE_KEY, credentials);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [credentials]);

  const login = useCallback((password: string) => {
    const encoded = btoa(`${SANDBOX_USERNAME}:${password}`);
    setCredentials(encoded);
  }, []);

  const logout = useCallback(() => {
    setCredentials(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        credentials,
        isAuthenticated: !!credentials,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function getStoredCredentials(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearStoredCredentials() {
  sessionStorage.removeItem(STORAGE_KEY);
}
