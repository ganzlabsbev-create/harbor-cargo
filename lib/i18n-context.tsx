"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { dict, Lang, DictKey } from "./i18n";

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey) => string;
}

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("th");

  useEffect(() => {
    const saved = window.localStorage.getItem("harbor_lang") as Lang | null;
    if (saved === "th" || saved === "en") setLangState(saved);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    window.localStorage.setItem("harbor_lang", l);
  }

  function t(key: DictKey) {
    return dict[lang][key];
  }

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}
