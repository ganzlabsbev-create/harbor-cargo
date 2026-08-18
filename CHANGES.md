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

## รอบแก้ไขที่ 4 — bugfix: crossOriginIsolated เป็น false ทั้งที่ browser รองรับ

**อาการ:** เข้าเรื่อง Android Chrome (รองรับ WebContainers ชัวร์ๆ) ก็ยังขึ้น "เบราว์เซอร์นี้รัน
dev server ในตัวไม่ได้" ทุกครั้ง

**สาเหตุ:** `next.config.mjs` ใส่ COOP/COEP header ให้เฉพาะตอนโหลด `/tools/preview` แบบเต็มหน้า
(hard navigation) แต่แอปนี้เดินหน้าด้วย `next/link` ทั้งแอป (client-side transition) — พอกดเข้ามา
จากหน้าแรก เบราว์เซอร์ไม่ได้ขอ document ใหม่ ก็เลยไม่ได้ header พวกนี้ `window.crossOriginIsolated`
เลยเป็น `false` เสมอไม่ว่า browser จะรองรับจริงมั้ย

**แก้:** `app/tools/preview/page.tsx` เพิ่ม `useEffect` เช็คตอน mount ถ้า `crossOriginIsolated`
ยังเป็น false ให้ `window.location.reload()` ครั้งเดียว (มี guard ผ่าน `sessionStorage` กันลูป) —
reload คือ full navigation จริง เลยได้ header ครบ

- ต้อง `npm install` (ใส่ dependency ใหม่จริงในเครื่อง Vercel build ไม่ใช่แค่แก้ไฟล์เฉยๆ)
- iOS Safari บางเวอร์ชันไม่รองรับ `SharedArrayBuffer` → จะ fallback ไป static preview เอง
  โดยไม่ error แต่โปรเจกต์ framework จะ preview จริงไม่ได้บนเบราว์เซอร์นั้น
- Angular ไม่อยู่ใน dev-command signature list ตรงๆ (ใช้ memory เยอะใน WebContainer) — จะ
  fallback ไปเดา `npm run dev`/`npm run start` จาก `package.json` แทน

---

## รอบแก้ไขที่ 5 — Captain Harbor: P2 (Polish)

ทำตาม P2 ทั้ง 4 ข้อจาก spec ที่ระบุไว้ (ข้อ 12-15) — งาน P0/P1 (กู้ state หลัง OAuth,
rate-limit countdown, session-expired handling, race-condition guard, provider อื่น,
persist ข้าม reload, back button, velocity snap, repo filter, error mapping) ทำไปแล้วก่อนหน้านี้
รอบนี้เป็น polish รอบสุดท้ายก่อนใช้งานจริง

## ไฟล์ที่แก้ / เพิ่ม

- **`lib/use-focus-trap.ts`** (ใหม่) — hook เล็กๆ ที่ดัก Tab/Shift+Tab ให้วนอยู่ใน container
  ที่กำหนด ใช้เฉพาะตอนพาแนลเป็น `full` เท่านั้น (ตอน `half` ยังเห็นเนื้อหาหน้าเว็บได้อยู่
  การดัก focus ไว้ตอนนั้นจะแปลกกว่าช่วย)

- **`components/CaptainHarbor.tsx`** — งาน P2 ทั้ง 4 ข้อ:
  - **ข้อ 12 (Accessibility):** พาแนลได้ `role="dialog"` + `aria-modal` ตอนเป็น `full`/`half`,
    ใช้ `useFocusTrap` ดัก Tab ตอน `full`, และ auto-focus ช่อง composer ทันทีที่พาแนลเปิดจาก
    `closed` → `full` (ผ่าน `wasClosedForFocusRef` กันไม่ให้ focus โดนแย่งซ้ำระหว่างที่พาแนล
    เปิดอยู่แล้ว เช่นตอนลากเปลี่ยนระหว่าง full/half)
  - **ข้อ 13 (Analytics):** เพิ่ม custom event ผ่าน `@vercel/analytics` (`track`, ห่อด้วย
    `trackStep()` กัน analytics พังแล้วลาม flow จริง) ที่จุดเปลี่ยน step หลัก:
    `provider_selected`, `file_uploaded`, `confirmed`, `push_success`, `push_failed`
    (แยก error ที่ทำให้ push ล้มเหลวด้วย เช่น `session_expired`/`network`/error code จาก API)
  - **ข้อ 14 (Drag-and-drop ไฟล์):** เพิ่ม `onDragOver`/`onDragLeave`/`onDrop` บนพื้นที่ข้อความ
    แชท ใช้งานได้เฉพาะตอน step เป็น `await_file` เท่านั้น มี overlay บอก "วางไฟล์ ZIP ตรงนี้ได้เลย"
    ตอนกำลังลากไฟล์ผ่านมา
  - **ข้อ 15 (Copy review):** เอาคำว่า "กู" ที่หลงเหลืออยู่ 4 จุด (`askZipForUpdate`,
    `previewOutro`, `createPreviewOutro`, `previewOutroVercelUpdate`) ออก ให้ตรงกับโทนสุภาพ
    กลางๆ ที่ข้อความส่วนใหญ่ในไฟล์ใช้อยู่แล้ว — ตัดสินใจเป็นสุภาพกลางทั้งไฟล์ เพราะเป็น
    tone ส่วนใหญ่ที่ใช้จริงอยู่แล้วก่อนแอปจะเปิดให้คนอื่นใช้งาน

- **`lib/captain-harbor/strings.ts`** — เพิ่ม key `dropZipHere` (th/en) สำหรับ overlay ตอน
  ข้อ 14 และแก้ 4 บรรทัดตามข้อ 15 ด้านบน

- **`lib/version.ts`** — bump เป็น `0.17.0` พร้อม changelog entry

---

### แก้ build error หลัง deploy จริง

Vercel build fail ที่ type-check step: `CapDict` เดิม infer มาจาก `(typeof cap)["th"]` ตอนที่ `cap`
ยังมี `as const` อยู่ — ทำให้ type ของ `CapDict` แคบไปเป็น literal type เฉพาะของ object `th`
เป๊ะๆ (รวมข้อความ string ทุกตัวด้วย) พอเอา `s = cap[lang]` (ที่เป็น union ของ `th | en`) ไปส่งเข้า
`describeError(s: CapDict, ...)` เลย type ไม่ตรงกัน เพราะ `en` มีข้อความคนละตัวกับ `th`

แก้โดยเอา `as const` ออกจาก object `cap` ใน `lib/captain-harbor/strings.ts` — พอไม่มี `as const`
TypeScript จะ widen string/function ทุกตัวเป็น `string`/`(...args) => string` ปกติ ทำให้ shape ของ
`th` กับ `en` ตรงกันแบบ structural แล้ว ไม่กระทบพฤติกรรมตอนรันจริงเลย (ค่าที่ใช้จริงยังเป็นข้อความ
เดิมทุกตัว แค่ type ที่ TypeScript มองกว้างขึ้น)
