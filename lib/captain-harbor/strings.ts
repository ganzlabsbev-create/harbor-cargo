// lib/captain-harbor/strings.ts
//
// Copy for the Captain Harbor chat widget, kept in its own small dict
// rather than added to lib/i18n.ts. That file's DictKey type is derived
// from `keyof typeof dict.th`, so every UI string on the site already
// depends on its exact shape — bolting ~40 new chat-only keys onto it
// risked colliding with existing keys and touching a file nothing else
// here needs to change. The widget only needs `lang` ("th" | "en") from
// useLang(); the actual copy lives here.

import type { Provider } from "./types";

export const cap = {
  th: {
    greeting: "⚓ Captain Harbor พร้อมแล้ว\nพิมพ์ชื่อบริการที่อยากใช้งาน เช่น \"github\" หรือพิมพ์ \"help\" เพื่อดูเมนู",
    greetingWithContext: (label: string) =>
      `⚓ Captain Harbor พร้อมแล้ว\nเห็นว่าอยู่ในหน้า ${label} อยู่ จะให้จัดการตัวนี้เลยไหม หรือพิมพ์ "help" ดูเมนูอื่น`,
    helpMenu: "เลือกบริการด้านล่างได้เลย",
    unknownProvider: "ไม่แน่ใจว่าต้องการใช้บริการไหน\nเลือกบริการด้านล่างได้เลย",
    providerComingSoon: (name: string) => `${name} ยังไม่พร้อมใช้งานตอนนี้ เลือกอันอื่นก่อนได้ไหม`,
    providerSelected: (name: string) => `${name} selected.\nอยากทำอะไรดี?`,
    actionCreate: "สร้างรีโป",
    actionUpdate: "อัพเดตรีโป",
    cancel: "ยกเลิก",
    backToMenu: "กลับเมนู",
    confirmGo: "อัพเดตเลย",
    createGo: "สร้างเลย",
    cancelled: "ยกเลิกแล้วนะ พิมพ์ชื่อบริการใหม่ได้เลยถ้าจะเริ่มอีกรอบ",
    askZipForUpdate: "โอเค กูพร้อมอัพเดตรีโปให้แล้ว\nส่งไฟล์ ZIP ของโปรเจกต์ที่ต้องการอัพเดตมาได้เลย",
    askZipForCreate: "โอเค จะสร้างรีโปใหม่ให้\nส่งไฟล์ ZIP ของโปรเจกต์มาได้เลย",
    waitingForFileNudge: "ตอนนี้กำลังรอไฟล์ ZIP อยู่นะ กดรูปหนีบกระดาษเพื่อแนบไฟล์ หรือพิมพ์ \"ยกเลิก\" ถ้าเปลี่ยนใจ",
    needLogin: "ต้องล็อกอิน GitHub ก่อนถึงจะใช้งานได้",
    loginButton: "ล็อกอิน GitHub",
    receivedZip: (name: string) => `ได้รับ ${name} แล้ว\nกำลังตรวจสอบไฟล์...`,
    checkingRateLimit: "กำลังเชื่อมต่อ GitHub...",
    foundFiles: (n: number) => `พบไฟล์ ${n} ไฟล์`,
    askWhichRepo: "จะอัพเดตรีโปไหน เลือกจากด้านล่าง หรือพิมพ์ชื่อรีโปมาได้เลย",
    noReposFound: "ไม่เจอรีโปในบัญชีนี้เลยนะ ลองพิมพ์ชื่อรีโปที่ต้องการดู",
    repoNotFound: (name: string) => `ไม่เจอรีโปชื่อ "${name}" ในบัญชีนี้ ลองพิมพ์ใหม่ หรือเลือกจากปุ่มด้านบน`,
    foundRepo: (fullName: string) => `เจอ Repository แล้ว\n${fullName}\nกำลังเปรียบเทียบไฟล์...`,
    askRepoName: "ตั้งชื่อรีโปใหม่ว่าอะไรดี พิมพ์มาได้เลย",
    comparing: "กำลังเปรียบเทียบไฟล์...",
    previewIntro: "ตรวจเสร็จแล้ว",
    previewBranch: (b: string) => `Branch: ${b}`,
    previewOutro: "กูจะอัพเดตไฟล์เหล่านี้ไปยัง Repository นี้",
    createPreviewOutro: (n: number) => `กูจะสร้างรีโปใหม่แล้วใส่ไฟล์ ${n} ไฟล์เข้าไป`,
    executingUpdate: "กำลังอัพเดต...",
    executingCreate: "กำลังสร้างรีโป...",
    stepUpload: "อัพโหลดไฟล์",
    stepUpdateFiles: "อัพเดตไฟล์",
    stepRemoveFiles: "ลบไฟล์ที่เลือก",
    stepCommit: "Commit สำเร็จ",
    stepCreateRepo: "สร้าง Repository",
    stepPushFiles: "อัพโหลดไฟล์เข้ารีโป",
    doneUpdate: "Cargo delivered successfully. ⚓",
    doneCreate: "สร้างรีโปสำเร็จแล้ว ⚓",
    openRepo: "เปิดดูรีโป",
    doAnother: "ทำรายการใหม่",
    errorGeneric: "มีปัญหาเกิดขึ้นระหว่างทำงาน ลองใหม่อีกทีได้ไหม",
    errorTooLarge: "ไฟล์ใหญ่เกินไป ลองไฟล์อื่นดู",
    errorNotZip: "อ่านไฟล์นี้เป็น ZIP ไม่ได้ ลองไฟล์อื่นดู",
    resumePrompt: "ยังมีงานค้างอยู่นะ จะทำต่อไหม หรือจะเริ่มเรื่องใหม่",
    resumeContinue: "ทำต่อ",
    resumeRestart: "เริ่มใหม่",
    composerPlaceholder: "พิมพ์ข้อความ...",
    collapsedIdle: "แตะเพื่อคุยกับ Captain Harbor",
    collapsedPending: "มีงานค้างรอ confirm อยู่",
    typeRepoOther: "พิมพ์ชื่ออื่น",
  },
  en: {
    greeting: "⚓ Captain Harbor is ready.\nType a service name, e.g. \"github\", or type \"help\" for the menu.",
    greetingWithContext: (label: string) =>
      `⚓ Captain Harbor is ready.\nLooks like you're on the ${label} page — want me to work with that? Or type "help" for other options.`,
    helpMenu: "Pick a service below.",
    unknownProvider: "Not sure which service you mean.\nPick one below.",
    providerComingSoon: (name: string) => `${name} isn't ready yet — pick another one for now.`,
    providerSelected: (name: string) => `${name} selected.\nWhat would you like to do?`,
    actionCreate: "Create repo",
    actionUpdate: "Update repo",
    cancel: "Cancel",
    backToMenu: "Back to menu",
    confirmGo: "Update now",
    createGo: "Create now",
    cancelled: "Cancelled. Type a service name to start again.",
    askZipForUpdate: "Ready to update a repo.\nSend the ZIP of the project you want to update.",
    askZipForCreate: "Ready to create a new repo.\nSend the ZIP of the project.",
    waitingForFileNudge: "Still waiting on a ZIP — tap the paperclip to attach one, or type \"cancel\" to stop.",
    needLogin: "You need to log in with GitHub first.",
    loginButton: "Log in with GitHub",
    receivedZip: (name: string) => `Got ${name}.\nChecking the file...`,
    checkingRateLimit: "Connecting to GitHub...",
    foundFiles: (n: number) => `Found ${n} files.`,
    askWhichRepo: "Which repo should this go to? Pick below, or type a repo name.",
    noReposFound: "No repos found on this account — try typing one.",
    repoNotFound: (name: string) => `Couldn't find a repo named "${name}". Try again or pick one above.`,
    foundRepo: (fullName: string) => `Found the repository.\n${fullName}\nComparing files...`,
    askRepoName: "What should the new repo be called?",
    comparing: "Comparing files...",
    previewIntro: "Check complete.",
    previewBranch: (b: string) => `Branch: ${b}`,
    previewOutro: "I'll push these changes to this repository.",
    createPreviewOutro: (n: number) => `I'll create a new repo with ${n} files in it.`,
    executingUpdate: "Updating...",
    executingCreate: "Creating repo...",
    stepUpload: "Upload files",
    stepUpdateFiles: "Update files",
    stepRemoveFiles: "Remove selected files",
    stepCommit: "Commit succeeded",
    stepCreateRepo: "Create repository",
    stepPushFiles: "Push files to repo",
    doneUpdate: "Cargo delivered successfully. ⚓",
    doneCreate: "Repo created successfully. ⚓",
    openRepo: "Open repo",
    doAnother: "Start another",
    errorGeneric: "Something went wrong. Want to try again?",
    errorTooLarge: "That file is too large — try a smaller one.",
    errorNotZip: "Couldn't read that as a ZIP — try another file.",
    resumePrompt: "There's unfinished work here. Continue, or start over?",
    resumeContinue: "Continue",
    resumeRestart: "Start over",
    composerPlaceholder: "Type a message...",
    collapsedIdle: "Tap to talk to Captain Harbor",
    collapsedPending: "Work pending confirmation",
    typeRepoOther: "Type another",
  },
} as const;

export type CapLang = keyof typeof cap;

export const PROVIDER_LABEL: Record<Provider, string> = {
  github: "GitHub",
  vercel: "Vercel",
  netlify: "Netlify",
  cloudflare: "Cloudflare",
};

/** case-insensitive provider name -> Provider, plus a couple of common aliases. */
const PROVIDER_ALIASES: Record<string, Provider> = {
  github: "github",
  gh: "github",
  vercel: "vercel",
  netlify: "netlify",
  cloudflare: "cloudflare",
  cf: "cloudflare",
};

export function parseProvider(input: string): Provider | null {
  const key = input.trim().toLowerCase();
  return PROVIDER_ALIASES[key] ?? null;
}

const GLOBAL_CANCEL_WORDS = ["ยกเลิก", "cancel", "เปลี่ยนใจ", "เริ่มใหม่", "stop"];
const GLOBAL_HELP_WORDS = ["help", "?", "เมนู", "menu"];

export function isCancelWord(input: string): boolean {
  return GLOBAL_CANCEL_WORDS.includes(input.trim().toLowerCase());
}

export function isHelpWord(input: string): boolean {
  return GLOBAL_HELP_WORDS.includes(input.trim().toLowerCase());
}
