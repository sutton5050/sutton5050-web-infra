import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { UserManager, type User } from 'oidc-client-ts';
import { cognitoConfig } from './cognitoConfig';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  getAccessToken: async () => null,
});

const userManager = new UserManager(cognitoConfig);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    userManager.getUser().then((existingUser) => {
      if (existingUser && !existingUser.expired) {
        setUser(existingUser);
      }
      setIsLoading(false);
    });

    const onUserLoaded = (loadedUser: User) => setUser(loadedUser);
    const onUserUnloaded = () => setUser(null);
    const onSilentRenewError = () => setUser(null);

    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);
    userManager.events.addSilentRenewError(onSilentRenewError);

    return () => {
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
      userManager.events.removeSilentRenewError(onSilentRenewError);
    };
  }, []);

  const login = useCallback(async () => {
    await userManager.signinRedirect();
  }, []);

  const logout = useCallback(async () => {
    await userManager.removeUser();
    setUser(null);
    // Redirect to Cognito logout endpoint
    const logoutUrl = cognitoConfig.metadata?.end_session_endpoint;
    if (logoutUrl) {
      window.location.href = logoutUrl;
    }
  }, []);

  const getAccessToken = useCallback(async () => {
    const currentUser = await userManager.getUser();
    return currentUser?.access_token ?? null;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user && !user.expired,
        isLoading,
        login,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { userManager };
