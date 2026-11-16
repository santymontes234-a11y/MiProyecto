import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { getItem, setItem, StorageKeys } from '@/lib/secure-storage';

interface OnboardingValue {
  loaded: boolean;
  done: boolean;
  complete: () => void;
}

const Ctx = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void getItem(StorageKeys.onboardingDone).then((v) => {
      setDone(v === '1');
      setLoaded(true);
    });
  }, []);

  const complete = useCallback(() => {
    setDone(true);
    void setItem(StorageKeys.onboardingDone, '1');
  }, []);

  const value = useMemo(() => ({ loaded, done, complete }), [loaded, done, complete]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding(): OnboardingValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOnboarding debe usarse dentro de <OnboardingProvider>');
  return ctx;
}
