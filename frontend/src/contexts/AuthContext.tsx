'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api } from '@/lib/api';

export interface User {
  id: number;
  name: string;
  email: string;
  whatsapp?: string;
  avatar?: string | null;
  google_id?: string | null;
  has_password?: boolean;
  role: 'buyer' | 'creator' | 'admin';
  email_verified_at: string | null;
  is_blocked?: boolean;
  reminder_emails?: boolean;
}

export interface RegisterPayload {
  name: string;
  email: string;
  whatsapp: string;
  password: string;
  password_confirmation: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginWithGoogle: (credential: string) => Promise<User>;
  register: (data: RegisterPayload) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const TOKEN_KEY = 'amania_token';

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

/**
 * Autentikasi memakai Bearer token Sanctum yang disimpan di localStorage.
 * Tidak memakai cookie session / CSRF, sehingga tidak ada request ke
 * /sanctum/csrf-cookie dan tidak ada error 419.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Tanpa token tidak perlu memanggil /auth/me (menghindari 401 di console).
    if (typeof window === 'undefined' || !localStorage.getItem(TOKEN_KEY)) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
    } catch {
      // Token kedaluwarsa/dicabut — bersihkan agar tidak dicoba terus.
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Muat sesi awal. Semua setState terjadi di callback promise (bukan sinkron di effect).
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem(TOKEN_KEY);
    const load: Promise<User | null> = token
      ? api
          .get('/auth/me')
          .then((d) => d.user as User)
          .catch(() => {
            localStorage.removeItem(TOKEN_KEY);
            return null;
          })
      : Promise.resolve(null);

    load.then((u) => {
      if (!active) return;
      setUser(u);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const acceptSession = useCallback((res: { token?: string; user?: User }) => {
    if (!res.token || !res.user) {
      throw new Error('Respons login tidak valid. Silakan coba lagi.');
    }
    localStorage.setItem(TOKEN_KEY, res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => acceptSession(await api.post('/auth/login', { email, password })),
    [acceptSession]
  );

  const loginWithGoogle = useCallback(
    async (credential: string) => acceptSession(await api.post('/auth/google', { credential })),
    [acceptSession]
  );

  const register = useCallback(
    async (data: RegisterPayload) => acceptSession(await api.post('/auth/register', data)),
    [acceptSession]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // Abaikan — token mungkin sudah tidak berlaku.
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, loginWithGoogle, register, logout, refresh }),
    [user, loading, login, loginWithGoogle, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
