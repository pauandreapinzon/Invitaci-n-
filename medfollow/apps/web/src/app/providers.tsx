'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme, type ThemeMode } from '@/theme';
import { clearSession, getStoredUser, type SessionUser } from '@/lib/api';

interface SessionContextValue {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
  logout: () => void;
  mode: ThemeMode;
  toggleMode: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe usarse dentro de Providers');
  return context;
}

const MODE_KEY = 'medfollow.theme';

export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  // El modo oscuro es una eleccion explicita del usuario, no una inversion
  // automatica del tema claro.
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    setUser(getStoredUser());
    const stored = window.localStorage.getItem(MODE_KEY);
    if (stored === 'dark' || stored === 'light') setMode(stored);
  }, []);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      setUser,
      logout: () => {
        clearSession();
        setUser(null);
        window.location.href = '/login';
      },
      mode,
      toggleMode: () => {
        const next: ThemeMode = mode === 'light' ? 'dark' : 'light';
        setMode(next);
        window.localStorage.setItem(MODE_KEY, next);
      },
    }),
    [user, mode],
  );

  return (
    <SessionContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </SessionContext.Provider>
  );
}
