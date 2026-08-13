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
            <>
              <p>
                ไฟล์ ZIP ที่คุณอัปโหลดจะถูกส่งขึ้น Vercel Blob storage ชั่วคราวก่อน (ที่อยู่ไฟล์เป็นสุ่ม
                คาดเดาไม่ได้) เพื่อให้รองรับไฟล์ขนาดใหญ่ จากนั้นระบบจะดึงมาแตกไฟล์ในพื้นที่ชั่วคราวบน
                เซิร์ฟเวอร์เพื่อวิเคราะห์และ push ขึ้น repository ที่คุณเลือก
              </p>
              <p>
                เมื่อ push เสร็จ (ไม่ว่าจะสำเร็จหรือไม่) ไฟล์จะถูกลบออกจาก Blob storage และพื้นที่ชั่วคราว
                ทันที หากคุณอัปโหลดแล้วไม่กด push/commit เลย (เช่นปิดแท็บไปกลางทาง) ไฟล์จะถูกลบเช่นกันเมื่อ
                คุณออกจากหน้านั้น ไม่มีการเก็บสำเนาเนื้อหาไฟล์ไว้ถาวร
              </p>
            </>
          ) : (
            <>
              <p>
                Uploaded ZIPs are first sent to Vercel Blob storage temporarily (at an
                unguessable, randomly-generated path) to support larger files. The server then
                fetches it from there to extract, analyze, and push to your chosen GitHub
                repository.
              </p>
              <p>
                Once the push is done (whether it succeeds or fails), the file is deleted from
                Blob storage and temporary server storage immediately. If you upload but never
                push/commit (e.g. you close the tab partway through), it's also deleted when you
                leave that page. No copy of the file contents is kept permanently.
              </p>
            </>
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
