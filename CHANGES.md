# Harbor Cargo — รอบแก้ไขที่ 2

## 1) กดโลโก้/ชื่อแอปที่ขึ้นซ้ายบน = กลับหน้าโฮมแบบเร็ว
ของเดิมทำแบบนี้อยู่แล้ว (`components/Header.tsx` โลโก้+ชื่อแอปห่อด้วย `<Link href="/">`
ซึ่งเป็น client-side navigation ของ Next.js เร็วอยู่แล้วโดยไม่ต้อง reload หน้า) ไม่มีไฟล์ต้องแก้
เพิ่มเติมสำหรับข้อนี้

## 2) เอาไอคอน logout ออกจาก header
- `components/Header.tsx` — ลบปุ่ม logout (ไอคอน `LogOut`) และ `handleLogout()` ออกจาก header
  เหลือแค่ปุ่มตั้งค่า (⚙️) มุมขวาบนอันเดียว ปุ่ม logout ยังอยู่ครบในหน้า Settings
  (`app/settings/page.tsx` มีปุ่ม logout ของตัวเองอยู่แล้ว พร้อมชื่อบัญชี/avatar) ไม่กระทบการออกจาก
  ระบบเลย แค่เอาทางลัดซ้ำที่ทำให้สับสนออกจาก header
