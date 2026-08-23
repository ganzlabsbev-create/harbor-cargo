"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Rocket, Triangle } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import { useLang } from "@/lib/i18n-context";

interface ProjectOption {
  id: string;
  name: string;
  framework: string | null;
  latestUrl: string | null;
}

export default function VercelManagePickerPage() {
  const { t } = useLang();

  const [vercelConnected, setVercelConnected] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Single atomic fetch with no internal stages — a plain indeterminate
  // spinner is the honest representation, not a fake percentage or a
  // "still working... (Ns)" counter.

  useEffect(() => {
    fetch("/api/vercel/status")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error();
        setVercelConnected(Boolean(data.connected));
      })
      .catch(() => setVercelConnected(false));
  }, []);

  useEffect(() => {
    if (vercelConnected !== true) return;
    fetch("/api/vercel/projects")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.detail || data.error || "load_failed");
        setProjects(data.projects);
      })
      .catch((err) => setLoadError(String(err?.message || err)));
  }, [vercelConnected]);

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/tools/vercel" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>
        <h1 className="mb-5 font-display text-xl font-bold tracking-tight text-ink">{t("vercel_select_project_label")}</h1>

        <AuthGate next="/tools/vercel/manage">
        {vercelConnected === false ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-base-border bg-base-surface p-8 text-center shadow-card">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-harbor-blue to-harbor-navy text-white shadow-glow-blue">
              <Rocket size={24} strokeWidth={1.75} />
            </div>
            <p className="font-display text-base font-semibold text-ink">{t("connect_vercel_title")}</p>
            <p className="text-sm text-ink-dim">{t("connect_vercel_desc")}</p>
            <a href="/api/auth/vercel" className="flex items-center gap-2 rounded-xl bg-black px-5 py-3 font-medium text-white">
              {t("connect_vercel_button")}
            </a>
          </div>
        ) : vercelConnected === null || (vercelConnected === true && !projects && !loadError) ? (
          <p className="flex items-center gap-2 text-sm text-ink-dim">
            <Loader2 size={16} className="animate-spin" /> {t("loading_vercel_projects")}
          </p>
        ) : loadError ? (
          <p className="text-sm text-accent-red">{loadError}</p>
        ) : projects && projects.length === 0 ? (
          <p className="text-sm text-ink-dim">{t("no_vercel_projects")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {projects!.map((p) => (
              <Link
                key={p.id}
                href={`/tools/vercel/manage/${p.id}`}
                prefetch
                className="flex items-center gap-3 rounded-xl border border-base-border bg-base-surface px-4 py-3 text-left text-sm text-ink transition active:scale-[0.99]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-base-border bg-base-surface2 text-ink-faint">
                  <Triangle size={14} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  {p.latestUrl && <p className="truncate text-xs text-ink-faint">{p.latestUrl.replace(/^https?:\/\//, "")}</p>}
                </div>
                {p.framework && <span className="shrink-0 text-xs text-ink-faint">{p.framework}</span>}
              </Link>
            ))}
          </div>
        )}
        </AuthGate>
      </div>
    </main>
  );
}
