"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Header from "@/components/Header";
import { useLang } from "@/lib/i18n-context";

export default function LicensePage() {
  const { t, lang } = useLang();
  const th = lang === "th";

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("license_title")}</h1>

        <div className="mt-5 rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
          {th ? (
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-dim">
              <p>
                HARBOR CARGO เป็นซอฟต์แวร์ภายในของทีมคุณ (GanZ Labs) ไม่ได้เผยแพร่แบบ open source
                สาธารณะ สิทธิ์การใช้งานและแก้ไขซอร์สโค้ดขึ้นอยู่กับข้อตกลงภายในทีมของคุณเอง
              </p>
              <p className="text-xs uppercase tracking-wide text-ink-faint">ไลบรารีที่ใช้ (แต่ละอันมีสิทธิ์ของตัวเอง)</p>
              <ul className="flex flex-col gap-1">
                {["Next.js", "React", "Tailwind CSS", "lucide-react", "adm-zip", "JSZip", "@vercel/postgres", "nanoid", "sharp"].map(
                  (lib) => (
                    <li key={lib} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-ink-faint" /> {lib}
                    </li>
                  )
                )}
              </ul>
              <p>
                โลโก้และเครื่องหมาย HARBOR CARGO เป็นทรัพย์สินของทีมคุณ ห้ามนำไปใช้ในที่อื่นโดยไม่ได้รับอนุญาต
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-dim">
              <p>
                HARBOR CARGO is internal software built for your team (GanZ Labs) — it is not
                published as public open source. Rights to use or modify the source code follow your
                own team's internal agreement.
              </p>
              <p className="text-xs uppercase tracking-wide text-ink-faint">Third-party libraries (each under its own license)</p>
              <ul className="flex flex-col gap-1">
                {["Next.js", "React", "Tailwind CSS", "lucide-react", "adm-zip", "JSZip", "@vercel/postgres", "nanoid", "sharp"].map(
                  (lib) => (
                    <li key={lib} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-ink-faint" /> {lib}
                    </li>
                  )
                )}
              </ul>
              <p>The HARBOR CARGO name and logo belong to your team — please don't reuse them elsewhere without permission.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
