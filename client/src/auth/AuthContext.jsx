import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, onUnauthorized, onMustChangePassword } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      // 401 (no session) or network error: treat as signed out, not a crash.
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    onUnauthorized(() => setUser(null));
    onMustChangePassword(() => {
      refresh();
    });
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Session may already be gone; either way we are logged out locally.
    }
    setUser(null);
  }, []);

  const value = { user, loading, login, logout, refresh, setUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
