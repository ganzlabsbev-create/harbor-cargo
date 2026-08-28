# Harbor Cargo — รอบแก้ไขที่ 4 (GitHub Settings + Download Project)

## สรุปสิ่งที่เพิ่ม

เพิ่ม GitHub Settings และ Download Project เข้าไปใน Harbor Cargo v0.22.0 ตามสเปกที่ระบุ
โดยยึด codebase/architecture เดิมทั้งหมด — ไม่มี GitHub client ใหม่, ไม่มี ZIP dependency ใหม่,
ไม่มี database/backend ใหม่

**ข้อค้นพบสำคัญตอนสำรวจ codebase ก่อนเริ่มแก้ (Phase 1):** Harbor Cargo ไม่มีหน้า
"repository page" แบบ Files/Branches/Deployments tabs ตามที่สเปกสมมติไว้ — ของจริงคือ
เครื่องมืออัปโหลด ZIP ขึ้น GitHub (New / Update) เท่านั้น ดังนั้นจึงผูก entry point ของ
Settings และ Download Project เข้ากับ state "เลือก repo แล้ว" ใน flow Update ที่มีอยู่เดิม
แทนการสร้าง navigation ใหม่ทั้งชุด และตัดหมวด Branches/Actions/Variables/Access ออกจากรอบนี้
เพราะไม่มี API abstraction เดิมให้ reuse (ไม่ทำ fake control ตามกฎในสเปก)

## ไฟล์ที่แก้ / เพิ่ม

- **`lib/github.ts`** — เพิ่ม method เข้า abstraction เดิม (ไม่สร้าง client ใหม่):
  `getRepoSettings`, `updateRepoSettings`, `updateRepoTopics`, `listBranches`,
  `getBranchProtection`, `setRepoArchived`, `renameRepo`, `deleteRepo`, `getBlobContent`
  (ตัวหลังใช้ Git Data API เดียวกับ path การ commit ไฟล์เดิม)

- **`app/api/github/[owner]/[repo]/settings/route.ts`** (ใหม่) — GET/PATCH repository
  settings ผ่าน session cookie เดิม ไม่มี token หลุดไป client

- **`app/api/github/[owner]/[repo]/branches/route.ts`** (ใหม่) — list branches สำหรับ
  default-branch picker และ branch selector ใน Download modal

- **`app/api/github/[owner]/[repo]/danger/route.ts`** (ใหม่) — archive / rename / delete
  repository ทุก action ตรวจ confirm ซ้ำฝั่ง server (ไม่พึ่ง client check)

- **`app/api/github/[owner]/[repo]/download/route.ts`** (ใหม่) — stream progress แบบ
  NDJSON เหมือน `/api/push`, ดึงไฟล์ทีละไฟล์จาก tree, zip ด้วย `adm-zip` (dependency เดิม
  ที่ `lib/zip.ts` ใช้อยู่แล้ว), อัป blob ชั่วคราวผ่าน `@vercel/blob` แล้วให้ client ดาวน์โหลด
  แล้วลบ blob ทิ้งผ่าน `/api/upload/blob-cleanup` เดิม มี cap ทั้งจำนวนไฟล์และขนาดรวม
  กัน browser/function ค้าง

- **`components/DownloadProjectModal.tsx`** (ใหม่) — bottom sheet สไตล์เดียวกับ
  `ConfirmMoveDialog.tsx` มี source/contents/options ตามสเปก, progress bar,
  และ checkbox "Include Git metadata" แบบ disabled พร้อมข้อความ "ยังไม่รองรับ"
  แทนการทำ fake control

- **`app/tools/github/settings/[owner]/[repo]/page.tsx`** (ใหม่) — Settings index
  แบบ navigation card ตามสเปก (ไม่ยัดฟอร์มทุกอย่างรวมหน้าเดียว)

- **`app/tools/github/settings/[owner]/[repo]/repository/page.tsx`** (ใหม่) —
  Repository Settings มี dirty-state bar "Unsaved changes / Discard / Save changes"
  ไม่ยิง API ทุกครั้งที่พิมพ์

- **`app/tools/github/settings/[owner]/[repo]/danger/page.tsx`** (ใหม่) — Danger Zone,
  delete ต้องพิมพ์ชื่อ repo ให้ตรงก่อนกดได้

- **`app/tools/github/update/page.tsx`** — เพิ่มลิงก์ "Settings" และปุ่ม "Download Project"
  เข้าไปใน header ของ state ที่เลือก repo แล้ว (จุดเดียวใน codebase เดิมที่รู้ owner/repo/branch
  อยู่แล้วโดยไม่ต้องสร้างหน้าใหม่)

- **`lib/i18n.ts`** — เพิ่มคีย์ TH/EN ทั้งหมดสำหรับ UI ใหม่ (GitHub Settings, Danger Zone,
  Download Project)

- **`lib/version.ts`** — bump เป็น `0.22.0` พร้อม changelog entry

## ยังไม่รวมในรอบนี้

Branch protection (แก้ไข), Actions, Variables/Secrets, Collaborators/Access — ต้องมี API
abstraction ใหม่ทั้งหมด ยังไม่มีอะไรให้ reuse ในรอบนี้ ถ้าต้องการต่อ ทำเป็นรอบถัดไปได้เลย
