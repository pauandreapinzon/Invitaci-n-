'use client';

import { createTheme, Theme } from '@mui/material/styles';

/**
 * Colores de ESTADO clinico (semaforo), no de serie: siempre se acompanan de
 * icono y etiqueta de texto, de modo que el significado nunca depende del color.
 * Los mismos tres pasos se usan en claro y oscuro (superan 3:1 sobre la
 * superficie oscura); en claro, el amarillo exige etiqueta visible o vista de
 * tabla, que ambas graficas incluyen.
 */
export const RISK_COLORS = {
  GREEN: '#0ca30c',
  YELLOW: '#fab219',
  RED: '#d03b3b',
} as const;

export const RISK_LABELS = {
  GREEN: 'Verde',
  YELLOW: 'Amarillo',
  RED: 'Rojo',
} as const;

export type ThemeMode = 'light' | 'dark';

/** Superficies declaradas de forma explicita por modo (no es una inversion automatica). */
export const SURFACE: Record<ThemeMode, string> = {
  light: '#fcfcfb',
  dark: '#1a1a19',
};

export function buildTheme(mode: ThemeMode): Theme {
  const isDark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: isDark
        ? { main: '#4fa3bd', dark: '#2d7e97', light: '#7bc0d4' }
        : { main: '#14657f', dark: '#0d4a5e', light: '#3d8ba5' },
      background: {
        default: isDark ? '#121211' : '#f3f4f3',
        paper: SURFACE[mode],
      },
      text: {
        primary: isDark ? '#f0efec' : '#0b0b0b',
        secondary: isDark ? '#c3c2b7' : '#52514e',
      },
      success: { main: RISK_COLORS.GREEN },
      warning: { main: RISK_COLORS.YELLOW },
      error: { main: RISK_COLORS.RED },
      divider: isDark ? '#35352f' : '#e3e3e0',
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
      h1: { fontSize: '1.6rem', fontWeight: 600 },
      h2: { fontSize: '1.25rem', fontWeight: 600 },
      h3: { fontSize: '1.05rem', fontWeight: 600 },
      body2: { fontSize: '0.875rem' },
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiTableCell: { styleOverrides: { head: { fontWeight: 600, whiteSpace: 'nowrap' } } },
    },
  });
}
