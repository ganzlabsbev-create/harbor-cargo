# Harbor Cargo — รอบแก้ไขที่ 3 (Harbor Preview Phase 2)

## สรุปสิ่งที่เพิ่ม
Harbor Preview รองรับโปรเจกต์ Node/framework (Next.js, Vite, CRA, SvelteKit, Nuxt, Astro,
Gatsby, Remix) แล้ว ผ่าน dev server จริงที่รันในเบราว์เซอร์ (WebContainers) — ไม่ต้องมี
backend/server ของ Harbor เอง ทุกอย่างยังทำงานฝั่ง client เหมือน static preview เดิม

## ไฟล์ที่แก้ / เพิ่ม

- **`lib/dev-server-preview.ts`** (ใหม่) — boot WebContainer, mount ไฟล์โปรเจกต์, ตรวจจับ
  framework/คำสั่ง dev แบบ client-side, รัน `npm install` แล้วรัน dev server จริง คืน URL
  ของ dev server เมื่อพร้อม คืนค่า `null` เมื่อโปรเจกต์ไม่มี `package.json`/คำสั่ง dev ที่รู้จัก
  (ให้ caller fallback ไป static preview แทน ไม่ใช่ error)

- **`components/PreviewFrame.tsx`** — รองรับ 2 โหมด: `html` (srcDoc, static preview เดิม)
  กับ `src` (URL ของ WebContainer dev server) พร้อมคอมเมนต์อธิบายว่าทำไม `allow-same-origin`
  ในโหมด `src` ไม่ได้เพิ่มความเสี่ยง (เป็นคนละ origin จริงอยู่แล้ว)

- **`components/PreviewConsole.tsx`** — ลบทิ้ง (ถูกแทนที่ด้วย `PreviewLog.tsx` แล้ว ไม่มีใคร
  import ใช้อีก การเก็บไว้ทำให้ build พังเพราะ type ของ `ConsoleLine` ที่ widen ใน
  `PreviewFrame.tsx` ไม่ตรงกับ `Record` แคบๆ ของไฟล์นี้อีกต่อไป — เจอตอน deploy รอบแรก แก้แล้ว)

- **`components/PreviewLog.tsx`** (ใหม่) — log viewer รวม ใช้แสดงทั้ง console message จาก
  static preview และ install/dev process output จาก WebContainer (มี strip ANSI escape code
  ออกให้ด้วย เพราะ npm/Vite CLI ส่ง log มาพร้อมสี)

- **`app/tools/preview/page.tsx`** — เปลี่ยนจาก tab แถวนอน (Preview/Files/Console) เป็นเมนู ☰
  แบบเดียวกับหน้า Vercel project dashboard (Preview/Files/Logs) เพื่อไม่ให้รกตอนมี log เยอะ
  ต่อ logic ใหม่: เช็ค `package.json` + ความรองรับของเบราว์เซอร์ก่อน ถ้าเข้าเงื่อนไขลอง
  dev server ก่อน ถ้าไม่ได้ (ไม่รองรับ/error) fallback ไป static preview อัตโนมัติ

- **`next.config.mjs`** — เพิ่ม `Cross-Origin-Opener-Policy: same-origin` และ
  `Cross-Origin-Embedder-Policy: require-corp` เฉพาะ route `/tools/preview/*` (WebContainers
  ต้องพึ่ง `SharedArrayBuffer` ซึ่งต้องมี header พวกนี้ — จำกัดขอบเขตแค่หน้านี้ ไม่กระทบ
  หน้าอื่นที่โหลดรูป avatar ของ GitHub จาก origin อื่น)

- **`package.json`** — เพิ่ม dependency `@webcontainer/api`, bump เวอร์ชันเป็น `0.16.0`

- **`lib/version.ts`** — เพิ่ม changelog entry เวอร์ชัน 0.16.0

- **`lib/i18n.ts`** — เพิ่มคีย์ข้อความใหม่ (ทั้ง th/en) สำหรับสถานะ installing/starting,
  badge โหมด Static/Dev Server, ข้อความ fallback เมื่อเบราว์เซอร์ไม่รองรับ

- **`lib/static-preview.ts`** — แก้คอมเมนต์เดิมที่บอกว่า "Phase 1 เท่านั้น" ให้ตรงกับความจริง
  (ตอนนี้เป็น fallback ของ Phase 2 แล้ว ไม่ใช่ทางเดียวที่มี)

## ข้อจำกัดที่ควรรู้ก่อนใช้จริง
- ต้อง `npm install` (ใส่ dependency ใหม่จริงในเครื่อง Vercel build ไม่ใช่แค่แก้ไฟล์เฉยๆ)
- iOS Safari บางเวอร์ชันไม่รองรับ `SharedArrayBuffer` → จะ fallback ไป static preview เอง
  โดยไม่ error แต่โปรเจกต์ framework จะ preview จริงไม่ได้บนเบราว์เซอร์นั้น
- Angular ไม่อยู่ใน dev-command signature list ตรงๆ (ใช้ memory เยอะใน WebContainer) — จะ
  fallback ไปเดา `npm run dev`/`npm run start` จาก `package.json` แทน
