import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, scheduleProactiveRefresh, cancelProactiveRefresh } from '../lib/api';

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  totpEnabled: boolean;
  forcePasswordChange: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isFounder: boolean;
  canGenerateInvites: boolean;
  emailVerified: boolean;
}

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organization?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  inviteCode?: string;
  captchaId: string;
  captchaAnswer: string;
  termsAcceptedAt: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ requires2FA?: boolean; tempToken?: string }>;
  verify2FA: (tempToken: string, code: string, trustDevice?: boolean) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await api.auth.me();
      setUser(user);
      scheduleProactiveRefresh();
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Try to load user from cookie-based session
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const deviceToken = localStorage.getItem('xpia_device_token') || undefined;
    const result = await api.auth.login(email, password, deviceToken);
    if (!result.requires2FA) {
      // Cookies were set by the server — fetch user
      try {
        const { user } = await api.auth.me();
        setUser(user);
        scheduleProactiveRefresh();
      } catch {
        throw new Error('Login succeeded but session could not be established. Please try again.');
      }
    }
    return { requires2FA: result.requires2FA, tempToken: result.tempToken };
  };

  const verify2FA = async (tempToken: string, code: string, trustDevice?: boolean) => {
    const result = await api.auth.verify2FA(tempToken, code, trustDevice);
    if (result.deviceToken) {
      localStorage.setItem('xpia_device_token', result.deviceToken);
    }
    // Cookies were set by the server — fetch user
    await refreshUser();
  };

  const register = async (input: RegisterInput) => {
    await api.auth.register(input);
    // Cookies were set by the server — fetch user
    await refreshUser();
  };

  const logout = async () => {
    cancelProactiveRefresh();
    try {
      await api.auth.logout();
    } catch {
      // Best-effort
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verify2FA, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
