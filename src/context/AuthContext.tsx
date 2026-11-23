import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getStoredToken, setStoredToken } from '../services/api';
import { isSupabaseBrowserConfigured, supabase } from '../services/supabaseClient';
import type { UserProfile } from '../types/finance';

export interface RegisterResult {
  requiresEmailConfirmation: boolean;
  email: string;
  message?: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    fullName: string;
    email: string;
    password: string;
    monthlyIncomeTarget?: number;
    monthlyBudgetLimit?: number;
  }) => Promise<RegisterResult>;
  forgotPassword: (email: string) => Promise<string>;
  resendConfirmation: (email: string) => Promise<string>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const DEMO_ACCOUNT_EMAIL = 'aarav.sharma@demo.fin';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const exchangeSupabaseSession = useCallback(
    async (accessToken: string, eventType?: 'signup' | 'login') => {
      const { token, user: linkedUser } = await api.exchangeSupabaseToken(accessToken, eventType);
      setStoredToken(token);
      setUser(linkedUser);
    },
    []
  );

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (token) {
      try {
        const { user: fetched } = await api.getMe();
        setUser(fetched);
        setLoading(false);
        return;
      } catch {
        setStoredToken(null);
        setUser(null);
      }
    }

    // If Supabase browser auth is configured, restore any active Supabase session cleanly
    if (isSupabaseBrowserConfigured && supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          await exchangeSupabaseSession(data.session.access_token);
          setLoading(false);
          return;
        }
      } catch {
        setStoredToken(null);
        setUser(null);
      }
    }

    setLoading(false);
  }, [exchangeSupabaseSession]);

  useEffect(() => {
    void refreshUser();

    if (!isSupabaseBrowserConfigured || !supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token && !getStoredToken()) {
        void exchangeSupabaseSession(session.access_token).catch(() => {});
      } else if (event === 'SIGNED_OUT') {
        setStoredToken(null);
        setUser(null);
      }
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, [refreshUser, exchangeSupabaseSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const normalized = email.trim().toLowerCase();

      // Use browser Supabase SDK directly when browser env vars are configured (non-demo accounts)
      if (isSupabaseBrowserConfigured && supabase && normalized !== DEMO_ACCOUNT_EMAIL) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalized,
          password,
        });
        const msg = error?.message || '';
        const isInvalidApiKey =
          msg.toLowerCase().includes('invalid api key') ||
          msg.toLowerCase().includes('no api key found');

        if (!isInvalidApiKey) {
          if (error || !data.session?.access_token) {
            const cleanMsg = msg || 'Invalid email or password.';
            if (cleanMsg.toLowerCase().includes('email not confirmed')) {
              throw new Error(
                'Please confirm your email address using the link Supabase sent before signing in.'
              );
            }
            throw new Error(cleanMsg);
          }
          await exchangeSupabaseSession(data.session.access_token, 'login');
          return;
        }
      }

      // Otherwise authenticate via server-side Supabase Email Auth proxy (or local SQLite fallback)
      const { token, user: loggedIn } = await api.login(normalized, password);
      setStoredToken(token);
      setUser(loggedIn);
    },
    [exchangeSupabaseSession]
  );

  const register = useCallback(
    async (payload: {
      fullName: string;
      email: string;
      password: string;
      monthlyIncomeTarget?: number;
      monthlyBudgetLimit?: number;
    }): Promise<RegisterResult> => {
      const normalized = payload.email.trim().toLowerCase();

      if (isSupabaseBrowserConfigured && supabase && normalized !== DEMO_ACCOUNT_EMAIL) {
        const { data, error } = await supabase.auth.signUp({
          email: normalized,
          password: payload.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: payload.fullName.trim(),
              monthly_income_target: payload.monthlyIncomeTarget ?? 30000,
              monthly_budget_limit: payload.monthlyBudgetLimit ?? 18000,
            },
          },
        });
        const msg = error?.message || '';
        const isInvalidApiKey =
          msg.toLowerCase().includes('invalid api key') ||
          msg.toLowerCase().includes('no api key found');

        if (!isInvalidApiKey) {
          if (error) {
            throw new Error(msg || 'Sign up failed.');
          }
          if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            throw new Error('An account with this email already exists. Please sign in instead.');
          }
          if (!data.session?.access_token) {
            return {
              requiresEmailConfirmation: true,
              email: normalized,
              message:
                'Verification email sent! Please check your inbox and confirm your email address before signing in.',
            };
          }
          await exchangeSupabaseSession(data.session.access_token, 'signup');
          return { requiresEmailConfirmation: false, email: normalized };
        }
      }

      const res = await api.register({
        ...payload,
        email: normalized,
      });

      if (res.requiresEmailConfirmation) {
        return {
          requiresEmailConfirmation: true,
          email: res.email || normalized,
          message:
            res.message ||
            'Verification email sent! Please check your inbox and confirm your email address before signing in.',
        };
      }

      if (!res.token || !res.user) {
        throw new Error('Registration did not return a valid session.');
      }

      setStoredToken(res.token);
      setUser(res.user);
      return { requiresEmailConfirmation: false, email: normalized };
    },
    [exchangeSupabaseSession]
  );

  const forgotPassword = useCallback(async (email: string): Promise<string> => {
    const normalized = email.trim().toLowerCase();
    if (isSupabaseBrowserConfigured && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: window.location.origin,
      });
      if (error) throw new Error(error.message || 'Could not send password reset email.');
      return 'If an account exists for this email, a password reset link has been sent.';
    }
    const res = await api.forgotPassword(normalized);
    return res.message;
  }, []);

  const resendConfirmation = useCallback(async (email: string): Promise<string> => {
    const normalized = email.trim().toLowerCase();
    if (isSupabaseBrowserConfigured && supabase) {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalized,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw new Error(error.message || 'Could not resend verification email.');
      return 'Verification email resent. Please check your inbox and spam folder.';
    }
    const res = await api.resendConfirmation(normalized);
    return res.message;
  }, []);

  const logout = useCallback(() => {
    const runLogout = async () => {
      let sbToken: string | null = null;
      if (isSupabaseBrowserConfigured && supabase) {
        try {
          const { data } = await supabase.auth.getSession();
          sbToken = data.session?.access_token ?? null;
        } catch {
          sbToken = null;
        }
      }

      if (getStoredToken()) {
        try {
          await api.logout(sbToken);
        } catch {
          // Proceed with local sign-out even if network request fails
        }
      }

      if (isSupabaseBrowserConfigured && supabase) {
        try {
          await supabase.auth.signOut();
        } catch {
          // Best-effort browser session clear
        }
      }

      setStoredToken(null);
      setUser(null);
    };

    void runLogout();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        forgotPassword,
        resendConfirmation,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
