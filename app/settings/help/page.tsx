"use client";

import Link from "next/link";
import { ChevronLeft, Github, FolderPlus, RefreshCcw, Rocket, SlidersHorizontal } from "lucide-react";
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
                  สีแดงขีดฆ่า = ลบ — ติ๊ก/ยกเลิกติ๊กไฟล์ที่ต้องการได้เอง กดค้างที่ไอคอนจุดสามจุด
                  ด้านซ้ายของไฟล์แล้วลากไปวางบนโฟลเดอร์อื่นเพื่อย้ายไฟล์ได้ (ไฟล์ที่ทำเครื่องหมายลบไว้จะลากไม่ได้)
                </Step>
                <Step n={4}>ใส่ข้อความ commit (จะเว้นว่างไว้ก็ได้) แล้วกดยืนยันการเปลี่ยนแปลง</Step>
              </>
            ) : (
              <>
                <Step n={1}>Choose GitHub Uploader → Update an existing repository, then pick a repo</Step>
                <Step n={2}>Upload your files (ZIP or loose file(s), either works)</Step>
                <Step n={3}>
                  The app compares your files against the repo and shows a file tree: orange = replace,
                  green = add, red strikethrough = delete — check/uncheck whichever files you want.
                  Press and drag the grip icon next to a file onto a folder to move it there
                  (files marked for deletion can&apos;t be dragged)
                </Step>
                <Step n={4}>Add a commit message (optional) and confirm the changes</Step>
              </>
            )}
          </ol>
        </section>

        <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <Rocket size={18} className="text-harbor-orange" />
            <h2 className="font-display text-base font-semibold text-ink">
              {th ? "Deploy โปรเจกต์ใหม่ขึ้น Vercel" : "Deploy a new project to Vercel"}
            </h2>
          </div>
          <ol className="flex flex-col gap-3">
            {th ? (
              <>
                <Step n={1}>ไปที่หน้าหลัก แล้วเลือก Vercel → Deploy โปรเจกต์ใหม่</Step>
                <Step n={2}>เชื่อมต่อบัญชี Vercel (ครั้งแรกเท่านั้น) แล้วเลือก repo บน GitHub ที่ต้องการ deploy</Step>
                <Step n={3}>
                  ตั้งชื่อโปรเจกต์ ปรับ framework/build settings ถ้าต้องการ และเพิ่ม environment
                  variables ได้ตั้งแต่ตอนนี้เลย
                </Step>
                <Step n={4}>กดยืนยันเพื่อสร้างโปรเจกต์และเริ่ม deploy รอบแรก</Step>
              </>
            ) : (
              <>
                <Step n={1}>From the home page, choose Vercel → Deploy a new project</Step>
                <Step n={2}>Connect your Vercel account (first time only), then pick the GitHub repo to deploy</Step>
                <Step n={3}>
                  Name the project, adjust framework/build settings if needed, and add environment
                  variables right away if you already know them
                </Step>
                <Step n={4}>Confirm to create the project and kick off the first deployment</Step>
              </>
            )}
          </ol>
        </section>

        <section className="mt-4 rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-harbor-blue" />
            <h2 className="font-display text-base font-semibold text-ink">
              {th ? "จัดการโปรเจกต์ Vercel ที่มีอยู่" : "Manage an existing Vercel project"}
            </h2>
          </div>
          <ol className="flex flex-col gap-3">
            {th ? (
              <>
                <Step n={1}>ไปที่หน้าหลัก แล้วเลือก Vercel → จัดการโปรเจกต์ แล้วเลือกโปรเจกต์จากรายการ</Step>
                <Step n={2}>
                  แตะไอคอนเมนู (☰) มุมขวาบนเพื่อสลับไปมาระหว่างภาพรวม, Environment Variables,
                  โดเมน, Build &amp; Dev Settings, Git และ Deployments
                </Step>
                <Step n={3}>
                  แก้ไข environment variables หรือโดเมนได้ทันที — เพิ่ม/ลบ/แก้ค่าแล้วกดบันทึกเป็นรายตัว
                </Step>
                <Step n={4}>
                  ในหน้า Deployments กด &quot;Redeploy&quot; เพื่อ deploy ใหม่จากซอร์สเดิม
                  หรือ &quot;Promote to Production&quot; เพื่อดัน deployment ที่มีอยู่ขึ้น production ทันที
                  โดยไม่ต้อง build ใหม่
                </Step>
                <Step n={5}>
                  หากต้องการลบโปรเจกต์ ไปที่ Danger Zone แล้วพิมพ์ชื่อโปรเจกต์เพื่อยืนยัน — การลบไม่สามารถย้อนกลับได้
                </Step>
              </>
            ) : (
              <>
                <Step n={1}>From the home page, choose Vercel → Manage a project, then pick one from the list</Step>
                <Step n={2}>
                  Tap the menu icon (☰) in the top right to switch between Overview, Environment
                  Variables, Domains, Build &amp; Dev Settings, Git, and Deployments
                </Step>
                <Step n={3}>
                  Edit environment variables or domains right away — add, remove, or update a value
                  and save it individually
                </Step>
                <Step n={4}>
                  On the Deployments page, tap &quot;Redeploy&quot; to rebuild from the same source, or
                  &quot;Promote to Production&quot; to push an existing deployment live without rebuilding
                </Step>
                <Step n={5}>
                  To delete a project, go to Danger Zone and type the project name to confirm — this
                  can&apos;t be undone
                </Step>
              </>
            )}
          </ol>
        </section>
      </div>
    </main>
  );
}
