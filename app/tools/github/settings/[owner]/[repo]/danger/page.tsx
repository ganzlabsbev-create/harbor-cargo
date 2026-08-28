"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, AlertTriangle, Archive } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import { useLang } from "@/lib/i18n-context";

/**
 * Danger Zone (build spec section 8). Every destructive action here
 * requires an explicit, deliberate confirmation — never a single click
 * (spec: no one-click destructive buttons) — and Delete additionally
 * requires typing the exact repository name, re-checked server-side too.
 */
export default function DangerZonePage({ params }: { params: { owner: string; repo: string } }) {
  const { t } = useLang();
  const router = useRouter();
  const { owner, repo } = params;
  const base = `/tools/github/settings/${owner}/${repo}`;

  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);

  const [deleteName, setDeleteName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function doArchive() {
    setArchiving(true);
    setArchiveError(null);
    try {
      const res = await fetch(`/api/github/${owner}/${repo}/danger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      setArchived(true);
      setArchiveConfirm(false);
    } catch (err: any) {
      setArchiveError(String(err?.message || err));
    } finally {
      setArchiving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/github/${owner}/${repo}/danger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", confirmName: deleteName }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      router.push("/tools/github/update");
    } catch (err: any) {
      setDeleteError(String(err?.message || err));
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href={base} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <AuthGate next={`${base}/danger`}>
          <h1 className="font-display text-xl font-bold tracking-tight text-accent-red">{t("gh_settings_danger_zone")}</h1>
          <p className="mt-1 text-sm text-ink-faint">{owner}/{repo}</p>

          <section className="mt-5 rounded-2xl border border-accent-red/30 bg-base-surface p-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-red/10 text-accent-red">
                <Archive size={18} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t("gh_danger_archive_title")}</p>
                <p className="text-xs text-ink-faint">{t("gh_danger_archive_desc")}</p>
              </div>
            </div>

            {archived ? (
              <p className="mt-3 text-sm text-accent-green">{t("gh_danger_archived_done")}</p>
            ) : archiveConfirm ? (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-sm text-ink-dim">{t("gh_danger_archive_confirm")}</p>
                <div className="flex gap-2">
                  <button onClick={() => setArchiveConfirm(false)} className="flex-1 rounded-lg border border-base-border px-3 py-2 text-sm text-ink-dim">
                    {t("cancel")}
                  </button>
                  <button
                    onClick={doArchive}
                    disabled={archiving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent-red px-3 py-2 text-sm font-semibold text-white"
                  >
                    {archiving && <Loader2 size={14} className="animate-spin" />}
                    {t("gh_danger_archive_button")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setArchiveConfirm(true)}
                className="mt-3 rounded-lg border border-accent-red/40 px-3 py-2 text-sm font-medium text-accent-red"
              >
                {t("gh_danger_archive_button")}
              </button>
            )}
            {archiveError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-accent-red">
                <AlertTriangle size={13} /> {archiveError}
              </p>
            )}
          </section>

          <section className="mt-4 rounded-2xl border border-accent-red/30 bg-base-surface p-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-red/10 text-accent-red">
                <AlertTriangle size={18} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t("gh_danger_delete_title")}</p>
                <p className="text-xs text-ink-faint">{t("gh_danger_delete_desc")}</p>
              </div>
            </div>

            <p className="mt-3 text-sm text-ink-dim">
              {t("gh_danger_delete_type_prompt")} <span className="font-mono font-semibold text-ink">{repo}</span> {t("gh_danger_delete_type_prompt_suffix")}
            </p>
            <input
              value={deleteName}
              onChange={(e) => setDeleteName(e.target.value)}
              placeholder={repo}
              className="mt-2 w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
            />
            <button
              onClick={doDelete}
              disabled={deleteName !== repo || deleting}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent-red px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {deleting && <Loader2 size={14} className="animate-spin" />}
              {t("gh_danger_delete_button")}
            </button>
            {deleteError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-accent-red">
                <AlertTriangle size={13} /> {deleteError}
              </p>
            )}
          </section>
        </AuthGate>
      </div>
    </main>
  );
}
