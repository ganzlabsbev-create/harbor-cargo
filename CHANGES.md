# Harbor Cargo — รอบแก้ไขที่ 5 (GitHub Code — โค้ดเอดิเตอร์ในตัว)

## สรุปสิ่งที่เพิ่ม

เพิ่มเครื่องมือใหม่ **GitHub Code** (v0.23.0) — เอดิเตอร์แก้โค้ดในรีโปแบบเต็มรูปแบบ อยู่ใน
หน้าเครื่องมือ GitHub เป็นการ์ดของตัวเอง (ต่อจาก New repository / Update repository / Settings)
ไม่ปนกับ flow อัปโหลด/อัปเดตเดิม ตามที่ขอ

โครงสร้างพื้นฐาน (repo tree, blob content, commit) reuse จาก `lib/github.ts` เดิมทั้งหมด
(`getRepoTree`, `getBlobContent`, `commitFileChanges`) — ไม่มี GitHub client ใหม่

## dependency ใหม่ (จำเป็นจริง ไม่มีให้ reuse)

CodeMirror 6 (`@codemirror/*`) สำหรับ syntax highlighting + error checking แบบเรียลไทม์ —
เช็คแล้วโปรเจกต์ไม่มี code editor library อยู่เดิม จำเป็นต้องเพิ่ม เลือก CodeMirror แทน Monaco
เพราะเบากว่าและรองรับ touch/มือถือดีกว่า ธีมเขียนขึ้นเองจาก token สีเดิมของ Harbor
(`lib/code-theme.ts`) ไม่ใช้ธีมสำเร็จรูป

## ฟีเจอร์หลักตามที่ขอ

1. **ไฟล์ต้นไม้ + กดแก้ + กดอัปเดต** — `components/code/RepoFileTree.tsx` แสดง tree จริง
   กดไฟล์เปิดในเอดิเตอร์ แก้แล้วกด "Commit" อัปเดตขึ้น GitHub ทันที (ผ่านหน้ารีวิว diff
   ก่อน 1 แตะ เพื่อความปลอดภัย เหมือนแพทเทิร์น Danger Zone เดิม) แถวในทรีทำใหญ่ขึ้น
   (สูง ~46px) ให้กดง่ายบนมือถือ แต่ไม่ใหญ่จนเปลืองพื้นที่จอ

2. **ค้นหาไฟล์แบบพิมพ์ทีละโฟลเดอร์** — `lib/fuzzy-match.ts` fuzzy filter ฝั่ง client
   พิมพ์ `โฟลเดอร์/โฟลเดอร์/ไฟล์` แล้วลิสต์ผลลัพธ์กรองสดทุกตัวอักษรที่พิมพ์ ไม่ต้อง match
   ตรงตัวทั้งหมด (พิมพ์ `cmp/hdr` เจอ `components/Header.tsx` ได้)

3. **ตรวจ error ระหว่างเขียน** — ใช้ syntax tree ที่ CodeMirror ของแต่ละภาษาสร้างอยู่แล้ว
   เดินหา error node เอง (ไม่เพิ่ม parser ใหม่) ครอบคลุม JS/TS/JSX/TSX, JSON (เช็ค key
   parse ด้วย), CSS, HTML, Markdown, Python — เป็นการเช็ค **syntax** ไม่ใช่ type-check
   เชิงความหมาย (เช่น TS type error) ซึ่งต้องรัน TypeScript compiler ในเบราว์เซอร์ ของหนักกว่านี้
   มาก ยังไม่รวมในรอบนี้

4. **ค้นหาโค้ดในทุกไฟล์ (ไม่ใช่แค่ชื่อไฟล์)** — สองโหมดตามที่คุยกันไว้:
   - **แบบเร็ว**: ใช้ GitHub Code Search API (`/search/code`) ของจริง ค้นเฉพาะ default
     branch อาจหน่วงหลังพุชใหม่ๆ
   - **แบบละเอียด**: ดึงเนื้อหาไฟล์ข้อความทุกไฟล์มาครั้งเดียว (มี progress + cap ขนาด/จำนวน
     ไฟล์แบบเดียวกับ Download Project) แล้วค้นสดในเบราว์เซอร์ทุกตัวอักษรที่พิมพ์ ค้นได้ทุก branch

## ของเสริมที่ทำเพิ่มให้ (ตามที่คุยไว้ก่อนเริ่ม)

- Command-style: แยกแท็บ ไฟล์ / แก้ไข / ค้นหา ชัดเจน ไม่ต้องสลับโหมด
- แก้ได้หลายไฟล์สะสมไว้ก่อน แล้ว commit รวมทีเดียวได้ (ปุ่ม "Commit (N)" บนสุด) หรือจะ
  save ทีละไฟล์ก็ได้ (ปุ่ม "บันทึกไฟล์นี้" ในเอดิเตอร์)
- รีวิว diff แบบ real diff (add/remove ต่อบรรทัด) ก่อน commit ทุกครั้ง — `lib/line-diff.ts`
  (เขียนเอง ไม่เพิ่ม dependency)
- สลับ branch ได้ในตัว (ล็อกไว้ระหว่างมีการแก้ไขค้าง กันสับสน)
- New file / Rename / Delete จากเมนูในทรี
- Draft กันหาย — พิมพ์ค้างไว้แล้วหลุดหน้า/รีเฟรช เนื้อหายังอยู่ (`lib/code-draft-store.ts`,
  localStorage ฝั่ง browser จริง ไม่ใช่ Artifact)
- แจ้งไฟล์ binary/ใหญ่เกินก่อนเปิด แทนที่จะเปิดแล้วพัง
- Conflict check ก่อน commit — ถ้าไฟล์ถูกแก้จากที่อื่นระหว่างที่กำลังแก้อยู่ จะไม่ยอม push
  ทับเงียบๆ แต่แจ้งชัดเจนว่าไฟล์ไหนชนกันบ้าง

## ไฟล์ที่แก้ / เพิ่ม

**lib**
- `lib/github.ts` — เพิ่ม `getFileContent`, `searchCode` (reuse `gh()` เดิม)
- `lib/fuzzy-match.ts` (ใหม่), `lib/line-diff.ts` (ใหม่), `lib/code-lang.ts` (ใหม่),
  `lib/code-theme.ts` (ใหม่), `lib/code-draft-store.ts` (ใหม่), `lib/code-changes.ts` (ใหม่)
- `lib/i18n.ts` — เพิ่มคีย์ TH/EN ทั้งหมดสำหรับ GitHub Code, เปลี่ยนชื่อการ์ด GitHub บนหน้า
  home จาก "GitHub Uploader" เป็น "GitHub" เฉยๆ (ไม่มีคำว่าอัปโหลดในชื่อ)
- `lib/version.ts` — bump เป็น `0.23.0`

**API routes ใหม่** (`app/api/github/[owner]/[repo]/code/`)
- `file/route.ts` — อ่านเนื้อหาไฟล์ + sha
- `commit/route.ts` — commit endpoint เดียวรองรับทั้ง save ไฟล์เดียว/หลายไฟล์/new/rename/delete
  พร้อมเช็ค conflict ก่อน push จริง
- `search/route.ts` — ค้นหาแบบเร็ว (GitHub Search API)
- `corpus/route.ts` — stream เนื้อหาไฟล์ทั้งหมดสำหรับค้นหาแบบละเอียด
- `tree/route.ts` — list path ทั้งหมดของ branch (ใช้ตั้ง tree/fuzzy search/corpus)

**Components ใหม่** (`components/code/`)
- `RepoFileTree.tsx`, `CodeEditor.tsx`, `CodeSearchPanel.tsx`, `CommitReviewSheet.tsx`,
  `PathPromptSheet.tsx`, `DeleteFileConfirmSheet.tsx`

**Pages ใหม่**
- `app/tools/github/code/page.tsx` — เลือก repo
- `app/tools/github/code/[owner]/[repo]/page.tsx` — หน้าเครื่องมือหลัก (ไฟล์/แก้ไข/ค้นหา)

**แก้ไข**
- `app/tools/github/page.tsx` — เพิ่มการ์ด "GitHub Code" การ์ดที่ 4
- `package.json` — เพิ่ม dependency ชุด CodeMirror 6

## ยังไม่รวมในรอบนี้ / ข้อจำกัดที่รู้อยู่แล้ว

- ตรวจ error เป็น syntax-level เท่านั้น ไม่ใช่ semantic/type-check เต็มรูปแบบ (ต้องรัน
  TypeScript compiler ในเบราว์เซอร์ ของหนักขึ้นเยอะ)
- ค้นหาแบบละเอียดมี cap ขนาด/จำนวนไฟล์เหมือน Download Project (รีโปใหญ่มากจะได้ผลบางส่วน
  พร้อมแจ้งเตือนชัดเจน)
- ยังไม่ทดสอบกับ `npm install` จริง (ไม่มี network ในสภาพแวดล้อมนี้) — ตรวจแค่ syntax/type
  แบบแยกไฟล์ผ่าน `tsc --noEmit` แล้ว ไม่พบปัญหา แต่แนะนำให้รัน `next build` เต็มรูปแบบอีกที
  ก่อน deploy จริง
