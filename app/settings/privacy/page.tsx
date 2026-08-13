"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Header from "@/components/Header";
import { useLang } from "@/lib/i18n-context";
import { APP_VERSION } from "@/lib/version";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
      <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ink-dim">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  const { t, lang } = useLang();
  const th = lang === "th";

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("privacy_title")}</h1>

        <Section title={th ? "1. ข้อมูลที่เราเก็บ" : "1. Data we collect"}>
          {th ? (
            <>
              <p>
                ตอนล็อกอินด้วย GitHub: GitHub user ID, username และ avatar URL ของคุณจะถูกบันทึกไว้
              </p>
              <p>
                ประวัติการ push โปรเจกต์: ชื่อโปรเจกต์, repo URL, framework ที่ตรวจพบ และเวลาที่ push
                จะถูกบันทึกไว้เช่นกัน ข้อมูลเหล่านี้ถูกเก็บไว้จริง — ไม่ใช่ว่า “ไม่มีการเก็บข้อมูลใดๆ”
              </p>
            </>
          ) : (
            <>
              <p>
                On GitHub login: your GitHub user ID, username, and avatar URL are stored.
              </p>
              <p>
                Project push history: project name, repo URL, detected framework, and timestamp are
                also stored. This data genuinely is stored — we're not claiming "nothing is stored."
              </p>
            </>
          )}
        </Section>

        <Section title={th ? "2. GitHub OAuth และ access token ของคุณ" : "2. GitHub OAuth & your access token"}>
          {th ? (
            <p>
              คุณล็อกอินผ่าน GitHub OAuth ทางการ หลังได้ access token มา ระบบจะเข้ารหัสด้วย AES-256-GCM
              แล้วเก็บไว้ในคุกกี้ session แบบ httpOnly บนเครื่องของคุณเองเท่านั้น token{" "}
              <span className="text-ink">ไม่เคยถูกเขียนลงฐานข้อมูลหรือ log</span> ใดๆ ทั้งสิ้น
            </p>
          ) : (
            <p>
              You sign in through GitHub's official OAuth flow. The resulting access token is
              encrypted with AES-256-GCM and stored only in an httpOnly session cookie on your own
              device. The token is{" "}
              <span className="text-ink">never written to the database or any log</span>.
            </p>
          )}
        </Section>

        <Section title={th ? "3. ไฟล์ที่อัปโหลด" : "3. Uploaded files"}>
          {th ? (
            <p>
              ไฟล์ที่คุณอัปโหลดจะถูกแตกไฟล์ไว้ในพื้นที่ชั่วคราวบนเซิร์ฟเวอร์ เฉพาะช่วงเวลาของ request
              นั้นๆ เท่านั้น ใช้เพื่อ push ขึ้น repository ที่คุณเลือก แล้วลบทิ้งทันที ไม่มีการเก็บสำเนา
              เนื้อหาไฟล์ไว้หลังจากนั้น
            </p>
          ) : (
            <p>
              Uploaded files are extracted to temporary server storage only for the duration of a
              single request, used to push to your chosen GitHub repository, then deleted
              immediately. No copy of the file contents is retained afterward.
            </p>
          )}
        </Section>

        <Section title={th ? "4. ฐานข้อมูล" : "4. Database"}>
          {th ? (
            <p>
              เราใช้ Vercel Postgres เก็บเฉพาะข้อมูลบัญชี/ประวัติตามที่ระบุในข้อ 1 เท่านั้น
              ฐานข้อมูลนี้ไม่เคยมี token หรือเนื้อหาไฟล์เก็บอยู่
            </p>
          ) : (
            <p>
              We use Vercel Postgres, used only for the account/history data listed in section 1. It
              never contains tokens or file contents.
            </p>
          )}
        </Section>

        <Section title={th ? "5. คุกกี้ / session" : "5. Cookies / session"}>
          {th ? (
            <p>
              มีคุกกี้ session เพียงตัวเดียว (<code className="text-xs">harbor_session</code>) แบบ
              httpOnly, secure และเข้ารหัส ใช้เพื่อให้คุณอยู่ในสถานะล็อกอินเท่านั้น อายุคุกกี้ 14 วัน
            </p>
          ) : (
            <p>
              There is one httpOnly, secure, encrypted session cookie (
              <code className="text-xs">harbor_session</code>), used only to keep you signed in. It
              lasts 14 days.
            </p>
          )}
        </Section>

        <Section title={th ? "6. การเก็บรักษาข้อมูล" : "6. Data retention"}>
          {th ? (
            <p>
              ข้อมูลบัญชีและประวัติการ push จะถูกเก็บไว้จนกว่าคุณจะขอให้ลบ ปัจจุบันระบบยังไม่มีปุ่มลบข้อมูล
              ในแอปโดยตรง — ถ้าต้องการให้ลบ ให้ติดต่อเราตามข้อ 7 ด้านล่าง
            </p>
          ) : (
            <p>
              Your account row and push history persist until you ask us to delete them. There's no
              in-app delete button built yet — to request deletion, contact us as described in
              section 7 below.
            </p>
          )}
        </Section>

        <Section title={th ? "7. สิทธิ์ของผู้ใช้" : "7. User rights"}>
          {th ? (
            <p>
              หากต้องการให้ลบข้อมูลบัญชีหรือประวัติการ push ของคุณ ติดต่อ GanZ Labs โดยตรงเพื่อยื่นคำขอ
            </p>
          ) : (
            <p>
              To have your account or push-history data removed, contact GanZ Labs directly to
              request it.
            </p>
          )}
        </Section>

        <div className="mt-5 flex flex-col items-center gap-1 text-center">
          <p className="text-xs text-ink-faint">© 2026 GanZ Labs. All rights reserved.</p>
          <p className="text-xs text-ink-faint">HARBOR CARGO v{APP_VERSION}</p>
        </div>
      </div>
    </main>
  );
}
