"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Header from "@/components/Header";
import { useLang } from "@/lib/i18n-context";
import { APP_VERSION } from "@/lib/version";

const DEPENDENCIES: { name: string; license: string }[] = [
  { name: "next", license: "MIT" },
  { name: "react", license: "MIT" },
  { name: "react-dom", license: "MIT" },
  { name: "adm-zip", license: "MIT" },
  { name: "@vercel/postgres", license: "Apache-2.0" },
  { name: "@vercel/blob", license: "Apache-2.0" },
  { name: "lucide-react", license: "ISC" },
  { name: "nanoid", license: "MIT" },
  { name: "jszip", license: "MIT OR GPL-3.0" },
  { name: "sharp (dev/postinstall)", license: "Apache-2.0" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
      <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ink-dim">{children}</div>
    </section>
  );
}

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

        <Section title={th ? "1. ความเป็นเจ้าของ" : "1. Ownership"}>
          {th ? (
            <p>
              HARBOR CARGO พัฒนาโดย <span className="text-ink">GanZ Labs</span> ชื่อ, โลโก้, UI/ดีไซน์
              และซอร์สโค้ดที่ GanZ Labs เขียนขึ้น เป็นทรัพย์สินของ GanZ Labs เว้นแต่จะระบุไว้เป็นอย่างอื่น
            </p>
          ) : (
            <p>
              HARBOR CARGO is developed by <span className="text-ink">GanZ Labs</span>. The name, logo,
              UI/design, and the source code GanZ Labs wrote are GanZ Labs' property unless stated
              otherwise.
            </p>
          )}
        </Section>

        <Section title={th ? "2. สิทธิ์การใช้งานซอฟต์แวร์" : "2. Software license"}>
          {th ? (
            <>
              <p className="font-medium text-ink">Proprietary / สงวนลิขสิทธิ์ทั้งหมด</p>
              <p>
                คุณใช้งานแอปที่โฮสต์ไว้ได้ตามปกติ แต่การใช้งานนี้ไม่ได้ให้สิทธิ์คัดลอก แจกจ่ายซ้ำ
                หรือนำซอร์สโค้ดไปสร้างผลิตภัณฑ์คู่แข่ง การที่แอปเปิดให้ใช้งานสาธารณะ ไม่ได้แปลว่าเป็น
                open source
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-ink">Proprietary / All Rights Reserved.</p>
              <p>
                People may use the hosted app, but that does not grant any right to copy,
                redistribute, or build a competing product from the source code. Public availability
                of the app does not mean it's open source.
              </p>
            </>
          )}
        </Section>

        <Section title={th ? "3. เนื้อหาของผู้ใช้" : "3. User content"}>
          {th ? (
            <p>
              ไฟล์ที่คุณอัปโหลดและ push ขึ้น GitHub ยังคงเป็นทรัพย์สินของคุณเสมอ HARBOR CARGO
              ไม่เรียกร้องความเป็นเจ้าของใดๆ เหนือโปรเจกต์ โค้ด หรือเนื้อหาในไฟล์ ZIP ที่คุณอัปโหลด
            </p>
          ) : (
            <p>
              Files you upload and push to GitHub remain your property. HARBOR CARGO claims no
              ownership over uploaded projects, code, or ZIP contents.
            </p>
          )}
        </Section>

        <Section title={th ? "4. GitHub / บริการภายนอก" : "4. GitHub / third-party services"}>
          {th ? (
            <p>
              HARBOR CARGO เป็นบริการของ GanZ Labs และไม่ได้เป็นส่วนหนึ่งหรือได้รับการรับรองจาก GitHub
              การใช้ GitHub ผ่าน HARBOR CARGO ยังอยู่ภายใต้ Terms of Service ของ GitHub เอง
            </p>
          ) : (
            <p>
              HARBOR CARGO is a GanZ Labs service and is not affiliated with or endorsed by GitHub.
              Using GitHub through HARBOR CARGO is still subject to GitHub's own Terms of Service.
            </p>
          )}
        </Section>

        <Section title={th ? "5. ซอฟต์แวร์ของบุคคลที่สาม" : "5. Third-party software"}>
          <p>
            {th
              ? "แต่ละไลบรารีอยู่ภายใต้สิทธิ์ของตัวเอง:"
              : "Each dependency is used under its own license:"}
          </p>
          <ul className="flex flex-col gap-1">
            {DEPENDENCIES.map((dep) => (
              <li key={dep.name} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-ink-faint" /> {dep.name}
                </span>
                <span className="text-xs text-ink-faint">{dep.license}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={th ? "6. ข้อจำกัดความรับผิดชอบ" : "6. Disclaimer"}>
          {th ? (
            <p>
              HARBOR CARGO ให้บริการตามสภาพที่เป็นอยู่ (as-is) เราไม่การันตีว่าทุกการ push หรืออัปโหลดจะสำเร็จเสมอ
              เพราะความพร้อมใช้งานของ GitHub API เงื่อนไขเครือข่าย สิทธิ์ของ repository และ rate limit
              เป็นสิ่งที่อยู่นอกเหนือการควบคุมของ GanZ Labs
            </p>
          ) : (
            <p>
              HARBOR CARGO is provided as-is. We can't guarantee every push or upload will succeed,
              since GitHub API availability, network conditions, repository permissions, and rate
              limits are outside GanZ Labs' control.
            </p>
          )}
        </Section>

        <Section title={th ? "7. เครื่องหมายการค้า" : "7. Trademark"}>
          {th ? (
            <p>
              ชื่อและโลโก้ HARBOR CARGO ห้ามนำไปใช้ในลักษณะที่สื่อว่าได้รับการรับรองหรือเป็นพันธมิตรกับ
              GanZ Labs โดยไม่ได้รับอนุญาต
            </p>
          ) : (
            <p>
              The HARBOR CARGO name and logo may not be used in a way that implies endorsement by or
              affiliation with GanZ Labs without permission.
            </p>
          )}
        </Section>

        <div className="mt-5 flex flex-col items-center gap-1 text-center">
          <p className="text-xs text-ink-faint">© 2026 GanZ Labs. All rights reserved.</p>
          <p className="text-xs text-ink-faint">HARBOR CARGO v{APP_VERSION}</p>
        </div>

        <p className="mt-4 text-center text-xs text-ink-faint">
          {th
            ? "หน้านี้ไม่ใช่คำแนะนำทางกฎหมายอย่างเป็นทางการ และยังไม่ได้ผ่านการตรวจสอบโดยนักกฎหมาย"
            : "This page is not formal legal advice and has not been reviewed by a lawyer."}
        </p>
      </div>
    </main>
  );
}
