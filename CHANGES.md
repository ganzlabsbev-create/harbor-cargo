# Harbor Cargo — สรุปการแก้ไข

ไฟล์ในนี้คือไฟล์ที่แก้/เพิ่มเท่านั้น เอาไปวางทับ path เดิมใน repo ได้เลย

## 1) บั๊ก path ซ้ำตอน commit (root cause: resolvePendingMove)
- `app/tools/github/update/page.tsx`
  - `resolvePendingMove()`: ตอน replace ทับไฟล์ `unchanged` — เลิกใส่ไฟล์เดิมลง `selectedDelete`
    (ตัวต้นเหตุของบั๊ก) แทนที่ด้วย `excludedRepoOnly` (ซ่อนแถวไฟล์เดิมออกจากทรี) และย้ายไฟล์ที่ลากมา
    จาก `selectedAdd` → `selectedReplace` (ผ่าน `forcedReplace` เพื่อให้ badge ในทรีขึ้น "Replace" ถูกต้อง)
  - `handleCommit()`: เพิ่ม dedup safety-net ชั้นที่ 2 — path ไหนมีทั้ง delete และ add/replace ให้ตัด
    delete ทิ้งเสมอ (เนื้อหาชนะ) ก่อนยิงไป `/api/commit-diff`
  - เพิ่ม deep-link `?owner=&repo=&branch=` (ดูข้อ 3) + track "recent" ตอนเลือก repo สำเร็จ
- `lib/github.ts`
  - `commitFileChanges()`: dedup เดียวกัน ฝั่ง server เป็นชั้น safety-net สุดท้ายก่อนสร้าง Tree

## 2) Badge "DEMO" บนการ์ด Harbor Preview
- `components/ToolCard.tsx` — เพิ่ม prop `badge?: string`, วางเป็น pill ลอย `absolute -top-2 right-3`
  (เส้นขอบฟ้า พื้นหลังโปร่งใส ตัวหนังสือฟ้า)
- `components/ToolGrid.tsx` — ใส่ `badge: "DEMO"` เฉพาะ entry `/tools/preview`

## 3) ระบบ "ล่าสุด" (Recent tools — GitHub + Vercel)
- `lib/recents.ts` (ใหม่) — เก็บใน `localStorage` เท่านั้น ไม่มีการยิงขึ้น server/DB เลย (ตรงหลัก
  zero data retention ของแอปนี้) cap 5 รายการ, dedupe ด้วย id, ใหม่สุดขึ้นก่อน
- `components/RecentTools.tsx` (ใหม่) — แถวแนวนอน scroll ใต้ ToolGrid บนหน้า home, การ์ดเล็กกว่า
  ToolCard ปกติ, ซ่อนทั้งแถวถ้ายังไม่มี recent
- `app/page.tsx` — เพิ่ม `<RecentTools />` ใต้ `<ToolGrid />`
- `app/tools/github/update/page.tsx` — บันทึก recent ตอนเลือก repo สำเร็จ + รองรับ deep-link
  `?owner=&repo=&branch=` (ข้ามหน้าเลือก repo ไปอัปโหลด zip ทันที) ถ้า repo ใช้ไม่ได้แล้วจะลบ recent
  นั้นทิ้งอัตโนมัติแล้ว fallback กลับไปหน้าเลือก repo ปกติ
- `app/tools/vercel/manage/[projectId]/page.tsx` — บันทึก recent ตอนโหลด project สำเร็จ ถ้า error
  เป็น 404/403 (project ลบ/หมดสิทธิ์) จะลบ recent ทิ้งอัตโนมัติแล้ว redirect กลับ
  `/tools/vercel/manage`
- `lib/i18n.ts` — เพิ่มคีย์ `recent_title` (TH/EN)

## หมายเหตุ
- ไฟล์ที่ลากไฟล์ `unchanged` ไปทับไฟล์ `unchanged` อีกไฟล์ (repo-only rename ทับ repo-only อีกไฟล์)
  ยังไม่มี "Replace" bucket ให้ลงในรอบนี้ — safety-net กันข้อมูลหายได้ แต่ label ในทรีอาจยังไม่ขึ้น
  "Replace" ให้ (ตามที่คุยกันไว้ตอนแรกว่าจะแยกทำทีหลังถ้าต้องการ)
