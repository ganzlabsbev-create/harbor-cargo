"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Header from "@/components/Header";
import Logo from "@/components/Logo";
import { useLang } from "@/lib/i18n-context";
import { APP_VERSION } from "@/lib/version";

export default function AboutPage() {
  const { t, lang } = useLang();

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <div className="flex flex-col items-center gap-3 rounded-2xl border border-base-border bg-base-surface p-6 text-center shadow-card">
          <Logo size={56} />
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">HARBOR CARGO</h1>
          <p className="text-xs text-ink-faint">v{APP_VERSION}</p>
        </div>

        <div className="mt-4 rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
          {lang === "th" ? (
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-dim">
              <p>
                HARBOR CARGO เป็นศูนย์รวมเครื่องมือสำหรับส่งโปรเจกต์ของคุณออกไปยังที่ต่างๆ
                เริ่มต้นด้วยเครื่องมือแรก: <span className="text-ink">GitHub Uploader</span>
              </p>
              <p>
                แอปนี้ล็อกอินด้วยบัญชี GitHub ของคุณเองผ่านระบบ OAuth ทางการของ GitHub — เรา
                ไม่มีทางเข้าถึงรหัสผ่านของคุณ และไม่เก็บ token การเข้าถึงไว้ที่เซิร์ฟเวอร์หรือฐานข้อมูลเลย
                (เก็บไว้ในคุกกี้ที่เข้ารหัสในเครื่องคุณเท่านั้น)
              </p>
              <p>
                ไฟล์โปรเจกต์ที่คุณอัปโหลดจะถูกส่งตรงไปยัง repository ของคุณเองบน GitHub เท่านั้น
                ไม่มีการเก็บสำเนาไฟล์ไว้ที่เซิร์ฟเวอร์ของเราหลังจากอัปโหลดเสร็จ
              </p>
              <p>ในอนาคตจะมีเครื่องมือสำหรับปลายทางอื่นๆ เพิ่มเข้ามาในหน้าหลักเรื่อยๆ</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-dim">
              <p>
                HARBOR CARGO is a hub of tools for shipping your projects places. It starts with one
                tool: <span className="text-ink">GitHub Uploader</span>.
              </p>
              <p>
                You sign in with your own GitHub account through GitHub's official OAuth flow — we
                never see your password, and your access token is never stored on our server or
                database (only in an encrypted cookie on your own device).
              </p>
              <p>
                Whatever you upload is pushed straight to your own GitHub repository. No copy of your
                files is kept on our server once the upload finishes.
              </p>
              <p>More tools for other destinations will be added to the home page over time.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
