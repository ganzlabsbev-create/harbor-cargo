# Harbor Cargo — รอบแก้บั๊ก v0.23.1 (repo picker + false-positive syntax error)

## บั๊กที่ 1 — เลือก repo แล้ว "failed" ทั้ง Code และ Settings

**สาเหตุ:** `/api/repos` คืนค่าเป็น `{ ok: true, repos: [...] }` เสมอ แต่หน้าเลือก repo ของ
GitHub Code (`app/tools/github/code/page.tsx`) และ GitHub Settings
(`app/tools/github/settings/page.tsx`) ที่สร้างไว้ก่อนหน้านี้ไปเช็คแบบผิดว่า response
เป็น array ตรงๆ (`Array.isArray(data)`) ซึ่งไม่จริง เลย throw error string "failed"
ออกมาทุกครั้งไม่ว่า repo ไหน — หน้า Update repo เดิมใช้แพทเทิร์นที่ถูกต้องอยู่แล้ว
(`if (!data.ok) throw ...; setRepos(data.repos)`) แค่ไม่ได้ทำตามแพทเทิร์นเดียวกันตอน
สร้างอีกสองหน้า

**แก้:** ทำให้ทั้งสองหน้าใช้แพทเทิร์นเดียวกับ Update repo

## บั๊กที่ 2 — ทุกไฟล์ขึ้น error 1 จุดเสมอ ไม่ว่าไฟล์จะถูกหรือผิด

**สาเหตุ (ทางเทคนิค):** ไฟล์ที่ไม่ได้อยู่ในรายชื่อภาษาที่รองรับ (JS/TS/JSON/CSS/HTML/
Markdown/Python) จะไม่มี language ผูกกับ editor เลย เมื่อไม่มี language, CodeMirror's
`syntaxTree()` จะคืนค่า placeholder ว่างของ Lezer (`Tree.empty`) — และ node เดียวใน
tree ว่างนี้บังเอิญมี id เป็น 0 ซึ่งตรงกับนิยามของ Lezer เองว่า "node ที่ error" (`isError`
เช็คจาก `id === 0`) ผลคือทุกไฟล์ที่ไม่มี language ผูกจะถูกนับว่า "error 1 จุด" เสมอ ทั้งที่
ไม่มีอะไรผิดเลย เพราะไฟล์นั้นไม่เคยถูก parse จริงๆ ตั้งแต่แรก

**แก้:** เพิ่มการเช็คใน `collectSyntaxDiagnostics()` (`lib/code-lang.ts`) ให้ข้าม tree ว่างนี้
ไปเลย ไม่รายงานอะไรถ้าไม่มีการ parse จริงเกิดขึ้น

## เพิ่มตามที่ขอ — แผง "Problems" ดูรายละเอียด error เต็มๆ

- แตะตัวเลข error ที่ status bar ด้านล่างเอดิเตอร์ → เปิดแผงรายการปัญหาทั้งหมดของไฟล์นั้น
  แต่ละรายการโชว์ **บรรทัด:คอลัมน์แน่นอน** + **ข้อความอธิบาย** (ดึง snippet ข้อความตรงจุดที่
  error มาแสดงด้วย ไม่ใช่แค่ "Syntax error" เฉยๆ)
- แตะรายการไหน → กระโดดไปบรรทัดนั้นในเอดิเตอร์ทันที
- เส้นใต้ error ในโค้ดตอนนี้เป็นเส้นหยักสีแดงจริงๆ (SVG squiggly) แทนเส้นประจางๆ เดิม
  ให้มองเห็นชัดโดยไม่ต้องรู้ล่วงหน้าว่ามันอยู่ตรงไหน

## ไฟล์ที่แก้

- `app/tools/github/settings/page.tsx` — แก้การอ่าน response จาก `/api/repos`
- `app/tools/github/code/page.tsx` — แก้การอ่าน response จาก `/api/repos`
- `lib/code-lang.ts` — เขียน `collectSyntaxDiagnostics()` ใหม่: แก้บั๊ก empty-tree,
  เพิ่มข้อความ error ที่มี snippet, dedupe error node ที่ซ้อนกัน
- `components/code/CodeEditor.tsx` — ใช้ฟังก์ชันกลางแทนการเดิน syntax tree เองซ้ำสองที่,
  เพิ่ม prop `onDiagnostics` ส่ง diagnostics เต็มรูปแบบขึ้นไปให้ parent
- `components/code/ProblemsSheet.tsx` (ใหม่) — แผงแสดงรายการปัญหา
- `app/tools/github/code/[owner]/[repo]/page.tsx` — เชื่อมแผง Problems เข้ากับ status bar
- `lib/code-theme.ts` — เปลี่ยนเส้นใต้ error เป็นเส้นหยักสีแดงจริง
- `lib/i18n.ts` — เพิ่มคีย์ TH/EN สำหรับแผง Problems
- `lib/version.ts` — bump เป็น `0.23.1`
- `package.json` — เพิ่ม `@lezer/common` ให้ตรงกับที่ import ใช้จริงใน `code-lang.ts`
