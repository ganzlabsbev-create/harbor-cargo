"use client";

import Link from "next/link";
import { Rocket, SlidersHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import Header from "@/components/Header";
import { useLang } from "@/lib/i18n-context";

export default function VercelToolChooser() {
  const { t } = useLang();
  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6 md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("vercel_choose_title")}</h1>

        <div className="mt-5 flex flex-col gap-3">
          <Link
            href="/tools/vercel/new"
            className="group flex items-center gap-4 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card active:scale-[0.99]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-harbor-orange to-harbor-orangeDim text-white shadow-glow-orange">
              <Rocket size={22} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-semibold text-ink">{t("vercel_choose_new")}</p>
              <p className="text-sm text-ink-dim">{t("vercel_choose_new_desc")}</p>
            </div>
            <ChevronRight size={18} className="text-ink-faint" />
          </Link>

          <Link
            href="/tools/vercel/manage"
            className="group flex items-center gap-4 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card active:scale-[0.99]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-harbor-blue to-harbor-navy text-white shadow-glow-blue">
              <SlidersHorizontal size={22} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-semibold text-ink">{t("vercel_choose_manage")}</p>
              <p className="text-sm text-ink-dim">{t("vercel_choose_manage_desc")}</p>
            </div>
            <ChevronRight size={18} className="text-ink-faint" />
          </Link>
        </div>
      </div>
    </main>
  );
}
