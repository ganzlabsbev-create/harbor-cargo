"use client";

import Link from "next/link";
import { ChevronLeft, Github, FolderPlus, RefreshCcw } from "lucide-react";
import Header from "@/components/Header";
import { useLang } from "@/lib/i18n-context";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-harbor-orange/15 text-xs font-semibold text-harbor-orange">
        {n}
      </span>
      <span className="text-sm leading-relaxed text-ink-dim">{children}</span>
    </li>
  );
}

export default function HelpPage() {
  const { t, lang } = useLang();
  const th = lang === "th";

  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-dim">
          <ChevronLeft size={16} /> {t("back")}
        </Link>

        <h1 className="font-display text-xl font-bold tracking-tight text-ink">{t("how_to_use_title")}</h1>

        <section className="mt-5 rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <FolderPlus size={18} className="text-harbor-orange" />
            <h2 className="font-display text-base font-semibold text-ink">
              {th ? "สร้าง repository ใหม่" : "Create a new repository"}
            </h2>
          </div>
          <ol className="flex flex-col gap-3">
            {th ? (
              <>
                <Step n={1}>ไปที่หน้าหลัก แล้วเลือก GitHub Uploader → สร้าง repository ใหม่</Step>
                <Step n={2}>
                  ลากไฟล์ ZIP มาวาง หรือกด &quot;เลือกไฟล์ ZIP&quot; — หรือจะเลือกไฟล์เดี่ยว/หลายไฟล์แทนก็ได้ ไม่ต้อง zip เอง
                </Step>
                <Step n={3}>ระบบจะวิเคราะห์โปรเจกต์และแสดงโครงสร้างไฟล์ให้ดูก่อน</Step>
                <Step n={4}>ตั้งชื่อ repo ใหม่ เลือก Private หรือ Public แล้วกดยืนยัน</Step>
                <Step n={5}>เสร็จแล้วกดเปิด repository เพื่อดูผลลัพธ์บน GitHub ได้เลย</Step>
              </>
            ) : (
              <>
                <Step n={1}>From the home page, choose GitHub Uploader → Create a new repository</Step>
                <Step n={2}>
                  Drop a ZIP file, or tap &quot;Choose ZIP file&quot; — or pick loose file(s) instead, no need
                  to zip them yourself
                </Step>
                <Step n={3}>The app analyzes your project and shows you the file structure first</Step>
                <Step n={4}>Name the new repo, pick Private or Public, then confirm</Step>
                <Step n={5}>Open the repository link to see it live on GitHub</Step>
              </>
            )}
          </ol>
        </section>

        <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <RefreshCcw size={18} className="text-harbor-blue" />
            <h2 className="font-display text-base font-semibold text-ink">
              {th ? "อัปเดต repository เดิม" : "Update an existing repository"}
            </h2>
          </div>
          <ol className="flex flex-col gap-3">
            {th ? (
              <>
                <Step n={1}>เลือก GitHub Uploader → อัปเดต repository เดิม แล้วเลือก repo จากรายการ</Step>
                <Step n={2}>อัปโหลดไฟล์ (ZIP หรือไฟล์เดี่ยว/หลายไฟล์ก็ได้)</Step>
                <Step n={3}>
                  ระบบจะเทียบไฟล์กับ repo แล้วแสดงเป็นต้นไม้ไฟล์: สีส้ม = แทนที่, สีเขียว = เพิ่มใหม่,
                  สีแดงขีดฆ่า = ลบ — ติ๊ก/ยกเลิกติ๊กไฟล์ที่ต้องการได้เอง
                </Step>
                <Step n={4}>ใส่ข้อความ commit (จะเว้นว่างไว้ก็ได้) แล้วกดยืนยันการเปลี่ยนแปลง</Step>
              </>
            ) : (
              <>
                <Step n={1}>Choose GitHub Uploader → Update an existing repository, then pick a repo</Step>
                <Step n={2}>Upload your files (ZIP or loose file(s), either works)</Step>
                <Step n={3}>
                  The app compares your files against the repo and shows a file tree: orange = replace,
                  green = add, red strikethrough = delete — check/uncheck whichever files you want
                </Step>
                <Step n={4}>Add a commit message (optional) and confirm the changes</Step>
              </>
            )}
          </ol>
        </section>
      </div>
    </main>
  );
}
