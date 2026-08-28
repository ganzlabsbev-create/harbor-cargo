"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import CircleCheckbox from "@/components/CircleCheckbox";
import { useLang } from "@/lib/i18n-context";
import type { RepoSettings } from "@/lib/github";

/**
 * Repository Settings (build spec section 3). Loads the current settings,
 * lets the user edit, and only calls the API once on Save — never per
 * keystroke — surfacing an "Unsaved changes" bar the moment anything
 * differs from what was loaded (spec: dirty state, not live-saving).
 */
export default function RepositorySettingsPage({ params }: { params: { owner: string; repo: string } }) {
  const { t } = useLang();
  const { owner, repo } = params;
  const base = `/tools/github/settings/${owner}/${repo}`;

  const [loaded, setLoaded] = useState<RepoSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[] | null>(null);

  const [description, setDescription] = useState("");
  const [homepage, setHomepage] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [defaultBranch, setDefaultBranch] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [hasIssues, setHasIssues] = useState(true);
  const [hasProjects, setHasProjects] = useState(true);
  const [hasWiki, setHasWiki] = useState(true);
  const [hasDiscussions, setHasDiscussions] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function applyLoaded(s: RepoSettings) {
    setLoaded(s);
    setDescription(s.description || "");
    setHomepage(s.homepage || "");
    setIsPrivate(s.private);
    setDefaultBranch(s.default_branch);
    setTopicsText(s.topics.join(", "));
    setHasIssues(s.has_issues);
    setHasProjects(s.has_projects);
    setHasWiki(s.has_wiki);
    setHasDiscussions(s.has_discussions);
  }

  useEffect(() => {
    fetch(`/api/github/${owner}/${repo}/settings`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.detail || data.error);
        applyLoaded(data.settings);
      })
      .catch((err) => setLoadError(String(err?.message || err)));

    fetch(`/api/github/${owner}/${repo}/branches`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setBranches(data.branches.map((b: any) => b.name));
      })
      .catch(() => {});
  }, [owner, repo]);

  const topics = topicsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const dirty =
    !!loaded &&
    (description !== (loaded.description || "") ||
      homepage !== (loaded.homepage || "") ||
      isPrivate !== loaded.private ||
      defaultBranch !== loaded.default_branch ||
      topicsText !== loaded.topics.join(", ") ||
      hasIssues !== loaded.has_issues ||
      hasProjects !== loaded.has_projects ||
      hasWiki !== loaded.has_wiki ||
      hasDiscussions !== loaded.has_discussions);

  function discard() {
    if (loaded) applyLoaded(loaded);
    setSaveError(null);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/github/${owner}/${repo}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          homepage,
          private: isPrivate,
          default_branch: defaultBranch,
          has_issues: hasIssues,
          has_projects: hasProjects,
          has_wiki: hasWiki,
          has_discussions: hasDiscussions,
          topics,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.detail || data.error);
      applyLoaded(data.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh bg-base-bg pb-28">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href={base} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <AuthGate next={`${base}/repository`}>
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("gh_settings_repository")}</h1>
          <p className="mt-1 text-sm text-ink-faint">{owner}/{repo}</p>

          {loadError ? (
            <p className="mt-6 flex items-center gap-2 rounded-xl border border-accent-red/30 bg-accent-red/10 p-4 text-sm text-accent-red">
              <AlertTriangle size={16} /> {t("gh_settings_load_error")}
            </p>
          ) : !loaded ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-ink-dim">
              <Loader2 size={16} className="animate-spin" /> {t("gh_settings_loading")}
            </div>
          ) : (
            <>
              <Section title={t("gh_settings_general")}>
                <Field label={t("gh_settings_description")}>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink"
                  />
                </Field>
                <Field label={t("gh_settings_homepage")}>
                  <input
                    value={homepage}
                    onChange={(e) => setHomepage(e.target.value)}
                    placeholder="https://"
                    className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
                  />
                </Field>
              </Section>

              <Section title={t("gh_settings_visibility")}>
                <div className="flex flex-col gap-2">
                  <VisRow label={t("gh_settings_public")} active={!isPrivate} onClick={() => setIsPrivate(false)} />
                  <VisRow label={t("gh_settings_private")} active={isPrivate} onClick={() => setIsPrivate(true)} />
                </div>
              </Section>

              <Section title={t("gh_settings_features")}>
                <div className="flex flex-col gap-3">
                  <FeatureRow label={t("gh_settings_feature_issues")} checked={hasIssues} onChange={() => setHasIssues((v) => !v)} />
                  <FeatureRow label={t("gh_settings_feature_discussions")} checked={hasDiscussions} onChange={() => setHasDiscussions((v) => !v)} />
                  <FeatureRow label={t("gh_settings_feature_wiki")} checked={hasWiki} onChange={() => setHasWiki((v) => !v)} />
                  <FeatureRow label={t("gh_settings_feature_projects")} checked={hasProjects} onChange={() => setHasProjects((v) => !v)} />
                </div>
              </Section>

              <Section title={t("gh_settings_topics")}>
                <input
                  value={topicsText}
                  onChange={(e) => setTopicsText(e.target.value)}
                  placeholder={t("gh_settings_topics_placeholder")}
                  className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
                />
                {topics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {topics.map((topic) => (
                      <span key={topic} className="rounded-full bg-base-surface2 px-2.5 py-1 text-xs text-ink-dim">
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </Section>

              <Section title={t("gh_settings_default_branch")}>
                <select
                  value={defaultBranch}
                  onChange={(e) => setDefaultBranch(e.target.value)}
                  className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink"
                >
                  {(branches || [defaultBranch]).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Section>

              {saveError && (
                <p className="mt-4 flex items-center gap-2 rounded-xl border border-accent-red/30 bg-accent-red/10 p-3 text-sm text-accent-red">
                  <AlertTriangle size={16} className="shrink-0" /> {saveError}
                </p>
              )}
              {saved && (
                <p className="mt-4 flex items-center gap-2 text-sm text-accent-green">
                  <CheckCircle2 size={16} /> {t("gh_settings_saved")}
                </p>
              )}
            </>
          )}
        </AuthGate>
      </div>

      {loaded && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-base-border bg-base-surface p-4 shadow-card">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <p className="text-sm font-medium text-harbor-orange">{t("gh_settings_unsaved")}</p>
            <div className="flex gap-2">
              <button onClick={discard} disabled={saving} className="flex items-center gap-1 rounded-lg border border-base-border px-3 py-2 text-sm text-ink-dim">
                <X size={14} /> {t("gh_settings_discard")}
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-harbor-orange px-4 py-2 text-sm font-semibold text-white shadow-glow-orange disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {t("gh_settings_save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <label className="mb-1 block text-xs text-ink-dim">{label}</label>
      {children}
    </div>
  );
}

function VisRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 text-left text-sm text-ink">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
          active ? "border-harbor-orange" : "border-base-border"
        }`}
      >
        {active && <span className="h-2.5 w-2.5 rounded-full bg-harbor-orange" />}
      </span>
      {label}
    </button>
  );
}

function FeatureRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-ink">{label}</p>
      <CircleCheckbox checked={checked} onChange={onChange} color="orange" size={18} aria-label={label} />
    </div>
  );
}
