"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type Country,
  DEFAULT_COUNTRY,
  getCountry,
  formatMoney,
} from "./currency";

/**
 * Currency selection only. Language is NOT held here — it lives in the URL
 * (`/es/pricing`) so every translation is server-rendered and indexable.
 * Currency has no SEO impact, so client state + localStorage is fine.
 */

const COUNTRY_KEY = "rs_country";

interface CurrencyContextValue {
  countryCode: string;
  setCountry: (code: string) => void;
  country: Country;
  /** Format a base-USD amount into the selected country's currency. */
  money: (usd: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [countryCode, setCountryState] = useState<string>(DEFAULT_COUNTRY);

  // Read the saved choice after mount so server and client render the same
  // markup on first paint (no hydration mismatch).
  useEffect(() => {
    const saved = localStorage.getItem(COUNTRY_KEY);
    if (saved) setCountryState(saved);
  }, []);

  const setCountry = (code: string) => {
    setCountryState(code);
    try {
      localStorage.setItem(COUNTRY_KEY, code);
    } catch {}
  };

  const value = useMemo<CurrencyContextValue>(() => {
    const country = getCountry(countryCode);
    return {
      countryCode,
      setCountry,
      country,
      money: (usd: number) => formatMoney(usd, country),
    };
  }, [countryCode]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
