import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { getItem, setItem, StorageKeys } from '@/lib/secure-storage';
import { darkColors, elevation, lightColors, radius, spacing, typography, type ColorScheme } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Theme {
  dark: boolean;
  colors: ColorScheme;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  elevation: typeof elevation;
}

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const buildTheme = (dark: boolean): Theme => ({
  dark,
  colors: dark ? darkColors : lightColors,
  spacing,
  radius,
  typography,
  elevation,
});

const ThemeContext = createContext<ThemeContextValue | null>(null);

const isPreference = (v: string | null): v is ThemePreference => v === 'system' || v === 'light' || v === 'dark';

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    void getItem(StorageKeys.themePreference).then((v) => {
      if (isPreference(v)) setPref(v);
    });
  }, []);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPref(pref);
    void setItem(StorageKeys.themePreference, pref);
  }, []);

  const dark = preference === 'system' ? system === 'dark' : preference === 'dark';
  const value = useMemo(() => ({ theme: buildTheme(dark), preference, setPreference }), [dark, preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext debe usarse dentro de <ThemeProvider>');
  return ctx;
}

export const useTheme = (): Theme => useThemeContext().theme;
