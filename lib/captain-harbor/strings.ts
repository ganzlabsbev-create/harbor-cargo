// lib/captain-harbor/strings.ts
//
// Copy for the Captain Harbor chat widget, kept in its own small dict
// rather than added to lib/i18n.ts. That file's DictKey type is derived
// from `keyof typeof dict.th`, so every UI string on the site already
// depends on its exact shape — bolting ~40 new chat-only keys onto it
// risked colliding with existing keys and touching a file nothing else
// here needs to change. The widget only needs `lang` ("th" | "en") from
// useLang(); the actual copy lives here.

import type { Action, Provider } from "./types";

// Explicit shape for both language dicts (P2 build-fix). Previously `CapDict`
// was derived as `(typeof cap)["th"]`, which — even without `as const` on
// the object — TypeScript can still infer as a literal-string return type
// for methods like `resumedAfterLogin` (built from a ternary of two string
// literals with no return-type annotation). That made `th`'s dict type and
// `en`'s dict type structurally incompatible despite both being "just
// strings" at runtime. Pinning every field to a real `interface` up front
// forces both language objects to widen to plain `string`, so `cap[lang]`
// (a `th | en` union) is always assignable wherever `CapDict` is expected.
export type CapLang = "th" | "en";

interface CapStrings {
  greeting: string;
  greetingWithContext: (label: string) => string;
  helpMenu: string;
  unknownProvider: string;
  providerComingSoon: (name: string) => string;
  providerSelected: (name: string) => string;
  actionCreate: string;
  actionUpdate: string;
  cancel: string;
  backToMenu: string;
  confirmGo: string;
  createGo: string;
  cancelled: string;
  askZipForUpdate: string;
  askZipForCreate: string;
  waitingForFileNudge: string;
  dropZipHere: string;
  needLogin: string;
  loginButton: string;
  receivedZip: (name: string) => string;
  checkingRateLimit: string;
  foundFiles: (n: number) => string;
  askWhichRepo: string;
  noReposFound: string;
  repoNotFound: (name: string) => string;
  foundRepo: (fullName: string) => string;
  askRepoName: string;
  comparing: string;
  previewIntro: string;
  previewBranch: (b: string) => string;
  previewOutro: string;
  createPreviewOutro: (n: number) => string;
  executingUpdate: string;
  executingCreate: string;
  stepUpload: string;
  stepUpdateFiles: string;
  stepRemoveFiles: string;
  stepCommit: string;
  stepCreateRepo: string;
  stepPushFiles: string;
  doneUpdate: string;
  doneCreate: string;
  openRepo: string;
  doAnother: string;
  errorGeneric: string;
  errorTooLarge: string;
  errorNotZip: string;
  resumePrompt: string;
  resumeContinue: string;
  resumeRestart: string;
  composerPlaceholder: string;
  collapsedIdle: string;
  collapsedPending: string;
  typeRepoOther: string;
  sessionExpired: string;
  rateLimited: (seconds: number) => string;
  rateLimitedReady: string;
  resumedAfterLogin: (action: Action) => string;
  resumedContinueVercel: (action: Action) => string;
  needVercelLogin: string;
  connectVercelButton: string;
  askWhichRepoForVercel: string;
  askWhichProject: string;
  noProjectsFound: string;
  projectNotFound: (name: string) => string;
  askProjectName: (suggested: string) => string;
  useSuggestedName: (suggested: string) => string;
  checkingVercel: string;
  previewOutroVercel: (repoLabel: string, branch: string, name: string) => string;
  previewOutroVercelUpdate: (name: string) => string;
  stepCreateVercelProject: string;
  stepDeployVercel: string;
  executingVercelCreate: string;
  executingVercelUpdate: string;
  doneVercelCreate: string;
  doneVercelUpdate: string;
  openDeployment: string;
  errorPermissionDenied: string;
  errorGithubRateLimited: string;
  errorNetworkOffline: string;
  errorNotFoundRemote: string;
  errorConflict: string;
  errorNameTaken: string;
  errorServerRemote: string;
  errorInvalidRepoName: string;
  errorVercelGithubAppMissing: string;
  errorVercelNoGitLink: string;
  errorVercelNoDeployment: string;
  installVercelAppButton: string;

  // ---- P3: richer home/help/menu copy (interaction-only, no new providers) ----
  homePrompt: string;
  helpAndCommandsLabel: string;
  uploadProjectLabel: string;
  updateRepositoryLabel: string;
  createRepositoryLabel: string;
  viewRepositoriesLabel: string;
  deployProjectLabel: string;
  redeployProjectLabel: string;
  viewProjectsLabel: string;
  viewDeploymentsLabel: string;
  backLabel: string;
  githubMenuPrompt: string;
  vercelMenuPrompt: string;
  helpIntro: string;
  myCapabilitiesLabel: string;
  commandsLabel: string;
  helpGithubText: string;
  helpVercelText: string;
  capabilitiesText: string;
  commandsListText: string;
  fallbackUnrecognized: string;
  askWhichProjectForDeployments: string;
  repositoriesListIntro: (n: number) => string;
  projectsListIntro: (n: number) => string;
  deploymentsListIntro: (name: string) => string;
  deploymentsEmpty: (name: string) => string;

  // ---- P4: surfacing deploy build errors inline instead of "go check
  // Vercel yourself" (see lib/vercel.ts getDeploymentError/getDeploymentStatus) ----
  copyErrorLabel: string;
  copiedLabel: string;
  deploymentErrorIntro: (name: string) => string;
  checkingDeployStatus: string;
  deployStillBuilding: (name: string) => string;
  deployFailedShort: string;
}

export const cap: Record<CapLang, CapStrings> = {
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
    askZipForUpdate: "โอเค พร้อมอัพเดตรีโปให้แล้ว\nส่งไฟล์ ZIP ของโปรเจกต์ที่ต้องการอัพเดตมาได้เลย",
    askZipForCreate: "โอเค จะสร้างรีโปใหม่ให้\nส่งไฟล์ ZIP ของโปรเจกต์มาได้เลย",
    waitingForFileNudge: "ตอนนี้กำลังรอไฟล์ ZIP อยู่นะ กดรูปหนีบกระดาษเพื่อแนบไฟล์ หรือพิมพ์ \"ยกเลิก\" ถ้าเปลี่ยนใจ",
    dropZipHere: "วางไฟล์ ZIP ตรงนี้ได้เลย",
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
    previewOutro: "จะอัพเดตไฟล์เหล่านี้ไปยัง Repository นี้",
    createPreviewOutro: (n: number) => `จะสร้างรีโปใหม่แล้วใส่ไฟล์ ${n} ไฟล์เข้าไป`,
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
    sessionExpired: "เซสชันหมดอายุแล้ว ต้องล็อกอิน GitHub ใหม่ก่อนนะ",
    rateLimited: (seconds: number) => `ส่งไฟล์ถี่ไปหน่อย ลองใหม่อีก ${seconds} วินาที`,
    rateLimitedReady: "ตอนนี้ลองส่งไฟล์ใหม่ได้เลย",
    resumedAfterLogin: (action: Action) =>
      action === "update"
        ? "ล็อกอินเรียบร้อย พร้อมอัพเดตต่อแล้ว ส่งไฟล์มาได้เลย"
        : "ล็อกอินเรียบร้อย พร้อมสร้างรีโปต่อแล้ว ส่งไฟล์มาได้เลย",
    resumedContinueVercel: (action: Action) =>
      action === "update"
        ? "เชื่อมต่อเรียบร้อย พร้อมอัพเดต deploy ต่อแล้ว"
        : "เชื่อมต่อเรียบร้อย พร้อมสร้าง Vercel Project ต่อแล้ว",

    // ---- vercel flow (P1 #6) ----
    needVercelLogin: "ต้องเชื่อมต่อ Vercel ก่อนถึงจะใช้งานได้ (ต่อจาก GitHub ที่ล็อกอินไว้แล้ว)",
    connectVercelButton: "เชื่อมต่อ Vercel",
    askWhichRepoForVercel: "จะ deploy รีโปไหนขึ้น Vercel เลือกจากด้านล่าง หรือพิมพ์ชื่อรีโปมาได้เลย (พิมพ์บางส่วนของชื่อเพื่อกรองก็ได้)",
    askWhichProject: "จะอัพเดต Vercel Project ไหน เลือกจากด้านล่าง หรือพิมพ์ชื่อ project มาได้เลย",
    noProjectsFound: "ไม่เจอ Vercel Project ในบัญชีนี้เลยนะ ลองสร้างใหม่แทนไหม",
    projectNotFound: (name: string) => `ไม่เจอ Project ชื่อ "${name}" ลองพิมพ์ใหม่ หรือเลือกจากปุ่มด้านบน`,
    askProjectName: (suggested: string) =>
      `ตั้งชื่อ Vercel Project ว่าอะไรดี พิมพ์มาได้เลย (หรือกดใช้ชื่อที่แนะนำ: ${suggested})`,
    useSuggestedName: (suggested: string) => `ใช้ "${suggested}"`,
    checkingVercel: "กำลังเชื่อมต่อ Vercel...",
    previewOutroVercel: (repoLabel: string, branch: string, name: string) =>
      `จะ deploy จาก ${repoLabel} (branch: ${branch}) ขึ้นเป็น Vercel Project ชื่อ "${name}"`,
    previewOutroVercelUpdate: (name: string) => `จะสั่ง deploy ล่าสุดจาก Git ให้ Project "${name}"`,
    stepCreateVercelProject: "สร้าง Vercel Project",
    stepDeployVercel: "Deploy จาก Git",
    executingVercelCreate: "กำลังสร้าง Vercel Project...",
    executingVercelUpdate: "กำลัง deploy ล่าสุดจาก Git...",
    doneVercelCreate: "สร้าง Vercel Project สำเร็จแล้ว ⚓",
    doneVercelUpdate: "Deploy สำเร็จแล้ว ⚓",
    openDeployment: "เปิดดู deployment",

    // ---- error copy, mapped from API error codes (P1 #11) ----
    errorPermissionDenied: "GitHub ปฏิเสธคำขอนี้ — HARBOR CARGO อาจไม่มีสิทธิ์เข้าถึง repository นี้แล้ว",
    errorGithubRateLimited: "GitHub จำกัดจำนวนคำขอไว้ชั่วคราว รอสักครู่แล้วลองใหม่นะ",
    errorNetworkOffline: "เชื่อมต่อเครือข่ายไม่ได้ ลองเช็คอินเทอร์เน็ตแล้วลองใหม่อีกที",
    errorNotFoundRemote: "ไม่เจอสิ่งนี้แล้ว หรือไม่มีสิทธิ์เข้าถึงอีกต่อไป",
    errorConflict: "ข้อมูลเปลี่ยนไปแล้วระหว่างที่กำลังทำงานอยู่ ลองใหม่อีกทีนะ",
    errorNameTaken: "มีชื่อนี้ในบัญชีอยู่แล้ว ลองตั้งชื่ออื่นดู",
    errorServerRemote: "ฝั่งเซิร์ฟเวอร์ปลายทางกำลังมีปัญหาอยู่ ลองใหม่อีกสักครู่นะ",
    errorInvalidRepoName: "ชื่อรีโปนี้ใช้ไม่ได้ ลองตั้งชื่ออื่นดู",
    errorVercelGithubAppMissing: "Vercel ยังไม่มีสิทธิ์เข้าถึงรีโปนี้ ต้องติดตั้ง Vercel GitHub App ก่อน",
    errorVercelNoGitLink: "Project นี้ไม่ได้ผูกกับ Git repository เลยไม่มี branch ให้ดึงข้อมูลมา",
    errorVercelNoDeployment: "Project นี้ยังไม่เคย deploy เลย ลอง deploy ใหม่แทน",
    installVercelAppButton: "ติดตั้ง Vercel GitHub App",

    // ---- P3: richer home/help/menu copy ----
    homePrompt: "อยากให้ช่วยเรื่องอะไรดี?",
    helpAndCommandsLabel: "Help & Commands",
    uploadProjectLabel: "Upload project",
    updateRepositoryLabel: "Update repository",
    createRepositoryLabel: "Create repository",
    viewRepositoriesLabel: "View repositories",
    deployProjectLabel: "Deploy project",
    redeployProjectLabel: "Redeploy project",
    viewProjectsLabel: "View projects",
    viewDeploymentsLabel: "View deployments",
    backLabel: "← Back",
    githubMenuPrompt: "อยากทำอะไรกับ GitHub ดี?",
    vercelMenuPrompt: "อยากทำอะไรกับ Vercel ดี?",
    helpIntro: "นี่คือสิ่งที่ Captain Harbor ช่วยได้",
    myCapabilitiesLabel: "My capabilities",
    commandsLabel: "Commands",
    helpGithubText:
      "GitHub ตอนนี้ทำได้:\n• Upload project — เริ่มอัพโหลดโปรเจกต์ (เลือกสร้างหรืออัพเดตต่อได้)\n• Update repository — ส่ง ZIP ไปอัพเดตรีโปที่มีอยู่แล้ว\n• Create repository — สร้างรีโปใหม่จาก ZIP\n• View repositories — ดูรายชื่อรีโปในบัญชีนี้",
    helpVercelText:
      "Vercel ตอนนี้ทำได้:\n• Deploy project — deploy รีโป GitHub ขึ้นเป็น Vercel Project ใหม่\n• Redeploy project — สั่ง deploy ล่าสุดจาก Git ให้ Project ที่มีอยู่\n• View projects — ดูรายชื่อ Vercel Project ในบัญชีนี้\n• View deployments — ดู deployment ล่าสุดของ Project ที่เลือก",
    capabilitiesText:
      "Captain Harbor ช่วยจัดการ GitHub กับ Vercel ของ HARBOR CARGO ได้โดยตรงในแชทนี้ — อัพโหลด/สร้าง/อัพเดตรีโป, deploy/redeploy ขึ้น Vercel, และดูรายการรีโป/โปรเจกต์/deployment พิมพ์ \"help github\" หรือ \"help vercel\" เพื่อดูรายละเอียดแยกตามบริการ",
    commandsListText:
      "คำสั่งที่พิมพ์ได้ตรง ๆ:\nhelp — เปิดเมนู\nhelp github / help vercel — ดูความสามารถของแต่ละบริการ\nwhat can you do — เปิดเมนู\ngithub / vercel — เปิดเมนูของบริการนั้น\nupload, deploy, redeploy, repository, repositories, deployment, deployments — คำสั่งลัด\nback — กลับเมนูก่อนหน้า\ncancel — ยกเลิกงานที่กำลังทำอยู่",
    fallbackUnrecognized: "ตอนนี้ช่วยได้แค่ GitHub กับ Vercel ลองพิมพ์ \"help\" เพื่อดูคำสั่งที่ใช้ได้",
    askWhichProjectForDeployments: "จะดู deployment ของ Project ไหน เลือกจากด้านล่าง หรือพิมพ์ชื่อ project มาได้เลย",
    repositoriesListIntro: (n: number) => `เจอรีโปในบัญชีนี้ ${n} รีโป:`,
    projectsListIntro: (n: number) => `เจอ Vercel Project ในบัญชีนี้ ${n} โปรเจกต์:`,
    deploymentsListIntro: (name: string) => `Deployment ล่าสุดของ "${name}":`,
    deploymentsEmpty: (name: string) => `Project "${name}" ยังไม่เคย deploy เลย`,

    // ---- P4: inline deploy error surfacing ----
    copyErrorLabel: "คัดลอก Error",
    copiedLabel: "คัดลอกแล้ว ✓",
    deploymentErrorIntro: (name: string) => `Deployment ล่าสุดของ "${name}" ล้มเหลว:`,
    checkingDeployStatus: "กำลังตรวจสอบผลลัพธ์ deploy...",
    deployStillBuilding: (name: string) =>
      `"${name}" ยัง build ไม่เสร็จ (ใช้เวลานานกว่าปกติ) เดี๋ยวลองกด "View deployments" ดูอีกทีได้เลย`,
    deployFailedShort: "Deploy ล้มเหลว",
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
    dropZipHere: "Drop the ZIP file here",
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
    sessionExpired: "Your session expired. Please log in with GitHub again.",
    rateLimited: (seconds: number) => `Too many uploads — try again in ${seconds}s.`,
    rateLimitedReady: "You can try uploading again now.",
    resumedAfterLogin: (action: Action) =>
      action === "update"
        ? "Logged in — ready to continue the update. Send the ZIP whenever you're ready."
        : "Logged in — ready to continue creating the repo. Send the ZIP whenever you're ready.",
    resumedContinueVercel: (action: Action) =>
      action === "update"
        ? "Connected — ready to continue the deploy."
        : "Connected — ready to continue creating the Vercel project.",

    // ---- vercel flow (P1 #6) ----
    needVercelLogin: "You need to connect Vercel first (on top of the GitHub login you already have).",
    connectVercelButton: "Connect Vercel",
    askWhichRepoForVercel: "Which repo should deploy to Vercel? Pick below, or type a repo name (typing part of the name filters the list).",
    askWhichProject: "Which Vercel project should this update? Pick below, or type a project name.",
    noProjectsFound: "No Vercel projects found on this account — want to create one instead?",
    projectNotFound: (name: string) => `Couldn't find a project named "${name}". Try again or pick one above.`,
    askProjectName: (suggested: string) => `What should the Vercel project be called? (or tap to use the suggested name: ${suggested})`,
    useSuggestedName: (suggested: string) => `Use "${suggested}"`,
    checkingVercel: "Connecting to Vercel...",
    previewOutroVercel: (repoLabel: string, branch: string, name: string) =>
      `I'll deploy from ${repoLabel} (branch: ${branch}) as a new Vercel project named "${name}".`,
    previewOutroVercelUpdate: (name: string) => `I'll trigger a fresh deploy from Git for project "${name}".`,
    stepCreateVercelProject: "Create Vercel project",
    stepDeployVercel: "Deploy from Git",
    executingVercelCreate: "Creating Vercel project...",
    executingVercelUpdate: "Deploying latest from Git...",
    doneVercelCreate: "Vercel project created successfully. ⚓",
    doneVercelUpdate: "Deployed successfully. ⚓",
    openDeployment: "Open deployment",

    // ---- error copy, mapped from API error codes (P1 #11) ----
    errorPermissionDenied: "GitHub denied this action — HARBOR CARGO may no longer have access to this repository.",
    errorGithubRateLimited: "GitHub's rate limit was reached. Give it a minute and try again.",
    errorNetworkOffline: "Couldn't reach the network. Check your connection and try again.",
    errorNotFoundRemote: "That can't be found anymore, or you no longer have access to it.",
    errorConflict: "Things changed on the other end while this was in progress. Try again.",
    errorNameTaken: "That name is already taken on this account — try another one.",
    errorServerRemote: "The remote service is having issues right now. Try again shortly.",
    errorInvalidRepoName: "That repo name isn't valid — try another one.",
    errorVercelGithubAppMissing: "Vercel doesn't have access to this repo yet — the Vercel GitHub App needs to be installed first.",
    errorVercelNoGitLink: "This project isn't linked to a Git repository, so there's no branch to pull from.",
    errorVercelNoDeployment: "This project has no deployments yet — try deploying it instead.",
    installVercelAppButton: "Install Vercel GitHub App",

    // ---- P3: richer home/help/menu copy ----
    homePrompt: "What can I help you with?",
    helpAndCommandsLabel: "Help & Commands",
    uploadProjectLabel: "Upload project",
    updateRepositoryLabel: "Update repository",
    createRepositoryLabel: "Create repository",
    viewRepositoriesLabel: "View repositories",
    deployProjectLabel: "Deploy project",
    redeployProjectLabel: "Redeploy project",
    viewProjectsLabel: "View projects",
    viewDeploymentsLabel: "View deployments",
    backLabel: "← Back",
    githubMenuPrompt: "What would you like to do?",
    vercelMenuPrompt: "What would you like to do?",
    helpIntro: "Here's what I can help you with.",
    myCapabilitiesLabel: "My capabilities",
    commandsLabel: "Commands",
    helpGithubText:
      "GitHub, right now:\n• Upload project — start an upload (choose create or update next)\n• Update repository — push a ZIP to an existing repo\n• Create repository — create a new repo from a ZIP\n• View repositories — list the repos on this account",
    helpVercelText:
      "Vercel, right now:\n• Deploy project — deploy a GitHub repo as a new Vercel project\n• Redeploy project — trigger a fresh deploy from Git for an existing project\n• View projects — list the Vercel projects on this account\n• View deployments — see the latest deployments for a chosen project",
    capabilitiesText:
      "Captain Harbor manages HARBOR CARGO's GitHub and Vercel directly from this chat — upload/create/update repos, deploy/redeploy to Vercel, and list your repos, projects, and deployments. Type \"help github\" or \"help vercel\" for details on each.",
    commandsListText:
      "Commands you can type directly:\nhelp — open the menu\nhelp github / help vercel — see each service's capabilities\nwhat can you do — open the menu\ngithub / vercel — open that service's menu\nupload, deploy, redeploy, repository, repositories, deployment, deployments — shortcuts\nback — go to the previous menu\ncancel — cancel work in progress",
    fallbackUnrecognized: "I can help with GitHub and Vercel. Try \"help\" to see available commands.",
    askWhichProjectForDeployments: "Which project's deployments do you want to see? Pick below, or type a project name.",
    repositoriesListIntro: (n: number) => `Found ${n} repositories on this account:`,
    projectsListIntro: (n: number) => `Found ${n} Vercel projects on this account:`,
    deploymentsListIntro: (name: string) => `Latest deployments for "${name}":`,
    deploymentsEmpty: (name: string) => `Project "${name}" has no deployments yet.`,

    // ---- P4: inline deploy error surfacing ----
    copyErrorLabel: "Copy error",
    copiedLabel: "Copied ✓",
    deploymentErrorIntro: (name: string) => `The latest deployment for "${name}" failed:`,
    checkingDeployStatus: "Checking deploy status...",
    deployStillBuilding: (name: string) =>
      `"${name}" is still building (taking longer than usual) — try "View deployments" again in a bit.`,
    deployFailedShort: "Deploy failed",
  },
};

export type CapDict = CapStrings;

/**
 * Maps an API error code (from `data.error`, see /api/push, /api/diff,
 * /api/vercel/*) to a specific, actionable message — instead of the
 * catch-all `errorGeneric`. `networkFailed` should be true when the fetch
 * itself threw (offline, DNS, CORS) rather than returning a JSON error
 * body, since that's a different problem with a different fix.
 */
export function describeError(s: CapDict, code?: string | null, networkFailed?: boolean): string {
  if (networkFailed) return s.errorNetworkOffline;
  switch (code) {
    case "github_auth_expired":
      return s.sessionExpired;
    case "github_rate_limited":
      return s.errorGithubRateLimited;
    case "github_forbidden":
      return s.errorPermissionDenied;
    case "github_not_found":
      return s.errorNotFoundRemote;
    case "github_conflict":
      return s.errorConflict;
    case "github_name_taken":
      return s.errorNameTaken;
    case "github_server_error":
      return s.errorServerRemote;
    case "invalid_zip":
      return s.errorNotZip;
    case "file_too_large":
      return s.errorTooLarge;
    case "invalid_repo_name":
      return s.errorInvalidRepoName;
    case "vercel_not_connected":
      return s.needVercelLogin;
    case "github_app_not_installed":
      return s.errorVercelGithubAppMissing;
    case "no_git_link":
      return s.errorVercelNoGitLink;
    case "no_deployment":
      return s.errorVercelNoDeployment;
    default:
      return s.errorGeneric;
  }
}

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

// ---- P3: simple, deterministic command/intent matching for the richer
// composer (section 6 of the brief) — no NLP model, just small word lists,
// same spirit as isCancelWord/isHelpWord above. ----

const BACK_WORDS = ["back", "← back", "ย้อนกลับ", "กลับ", "กลับเมนู"];

export function isBackWord(input: string): boolean {
  return BACK_WORDS.includes(input.trim().toLowerCase());
}

const CAPABILITIES_PHRASES = [
  "what can you do",
  "what can you help with",
  "what do you do",
  "what are you able to do",
  "ทำอะไรได้บ้าง",
  "ช่วยอะไรได้บ้าง",
  "มีความสามารถอะไรบ้าง",
];

/** Loose "what can you do"-style match (section 5) — exact match or a
 *  substring hit, since real messages are often "hey, what can you do?" */
export function isCapabilitiesWord(input: string): boolean {
  const v = input.trim().toLowerCase();
  if (!v) return false;
  return CAPABILITIES_PHRASES.some((p) => v === p || v.includes(p));
}

/** "help github" / "github help" -> "github", same for vercel. Bare "help"
 *  is handled separately by isHelpWord (opens the root Help & Commands menu). */
export function parseHelpTarget(input: string): Provider | null {
  const v = input.trim().toLowerCase();
  if (v === "help github" || v === "github help") return "github";
  if (v === "help vercel" || v === "vercel help") return "vercel";
  return null;
}

/** Section 6's "related words" — upload/deploy/redeploy/repository(-ies)/
 *  deployment(s) — mapped to the matching menu action's internal token. */
const NATURAL_COMMAND_WORDS: Record<string, string> = {
  upload: "__gh_upload__",
  repository: "__gh_view_repos__",
  repositories: "__gh_view_repos__",
  deploy: "__vc_deploy__",
  redeploy: "__vc_redeploy__",
  deployment: "__vc_view_deployments__",
  deployments: "__vc_view_deployments__",
};

export function matchNaturalCommand(input: string): string | null {
  return NATURAL_COMMAND_WORDS[input.trim().toLowerCase()] ?? null;
}
