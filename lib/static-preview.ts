"use client";

import type { ClientFile } from "./client-zip";

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain",
  xml: "application/xml",
  map: "application/json",
};

// Extensions whose *contents* may contain relative references to other
// project files (so worth text-rewriting) as opposed to opaque binary
// assets that just need a blob: URL.
const TEXT_EXTS = new Set(["css", "js", "mjs", "json", "svg", "xml", "txt"]);

// Injected just before </body> of the entry HTML. Forwards console output,
// runtime errors, and network/resource activity to the parent page via
// postMessage, so Harbor's Console and Network panels can show them without
// the iframe needing allow-same-origin (the iframe stays a sandboxed,
// opaque-origin document).
//
// `blobToPath` maps every blob: URL this build registered back to the
// project-relative path it came from, so error messages and network
// entries can show "src/main.js" instead of an opaque "blob:https://...".
// Best-effort only, same spirit as buildStaticPreview() below: fetch/XHR
// wrapping and resource load/error listeners cover the common cases, not
// every possible way a page can move bytes around.
function buildBridgeScript(blobToPath: Record<string, string>, entryPath: string): string {
  return `
<script>(function(){
  var blobMap=${JSON.stringify(blobToPath)};
  var entryPath=${JSON.stringify(entryPath)};
  function friendly(url){ return (url && blobMap[url]) || url || entryPath; }
  function send(type,args){try{parent.postMessage({__harborPreview:true,type:type,args:args},"*");}catch(e){}}
  function sendNetwork(entry){try{parent.postMessage({__harborPreview:true,type:"network",entry:entry},"*");}catch(e){}}

  ["log","warn","error","info"].forEach(function(level){
    var orig=console[level];
    console[level]=function(){
      var args=Array.prototype.slice.call(arguments).map(function(a){
        try{return typeof a==="string"?a:JSON.stringify(a);}catch(e){return String(a);}
      });
      send("console:"+level,args);
      if(orig) orig.apply(console,arguments);
    };
  });

  // Runtime script errors (bubble to window) — kept separate from the
  // capture-phase listener below, which only handles resource load
  // failures (img/link/script tags), since those don't bubble.
  window.addEventListener("error",function(e){
    if(e.target && e.target!==window) return;
    var file=friendly(e.filename);
    var loc=file+":"+(e.lineno||0)+(e.colno?":"+e.colno:"");
    send("console:error",[String(e.message||"Script error")+" ("+loc+")"]);
  });
  window.addEventListener("unhandledrejection",function(e){
    var reason=e.reason&&e.reason.message?e.reason.message:String(e.reason);
    send("console:error",["Unhandled promise rejection: "+reason]);
  });

  // Resource loads: <img>, <script src>, <link href>, etc. Capture phase
  // is required here because 'error' and 'load' on these elements don't
  // bubble up to window on their own.
  var RESOURCE_TAGS={img:1,script:1,link:1,source:1,iframe:1,audio:1,video:1};
  window.addEventListener("error",function(e){
    var t=e.target;
    if(!t||t===window||!t.tagName) return;
    if(!RESOURCE_TAGS[t.tagName.toLowerCase()]) return;
    var url=t.src||t.href||"";
    if(!url) return;
    sendNetwork({url:url,name:friendly(url),ok:false,status:null,kind:"resource"});
  },true);
  window.addEventListener("load",function(e){
    var t=e.target;
    if(!t||t===window||!t.tagName) return;
    if(!RESOURCE_TAGS[t.tagName.toLowerCase()]) return;
    var url=t.src||t.href||"";
    if(!url) return;
    sendNetwork({url:url,name:friendly(url),ok:true,status:200,kind:"resource"});
  },true);

  // fetch()
  var origFetch=window.fetch;
  if(origFetch){
    window.fetch=function(input,init){
      var url=typeof input==="string"?input:(input&&input.url)||"";
      return origFetch.apply(this,arguments).then(function(res){
        sendNetwork({url:url,name:friendly(url),ok:res.ok,status:res.status,kind:"fetch"});
        return res;
      },function(err){
        sendNetwork({url:url,name:friendly(url),ok:false,status:null,kind:"fetch"});
        throw err;
      });
    };
  }

  // XMLHttpRequest
  var OrigXHR=window.XMLHttpRequest;
  if(OrigXHR){
    window.XMLHttpRequest=function(){
      var xhr=new OrigXHR();
      var url="";
      var origOpen=xhr.open;
      xhr.open=function(method,u){
        url=u;
        return origOpen.apply(xhr,arguments);
      };
      xhr.addEventListener("loadend",function(){
        sendNetwork({url:url,name:friendly(url),ok:xhr.status>=200&&xhr.status<400,status:xhr.status||null,kind:"xhr"});
      });
      return xhr;
    };
  }

  send("ready",[]);
})();</script>
`;
}

export interface BuiltPreview {
  /** Full HTML document, ready to assign to an iframe's srcDoc. */
  html: string;
  entryPath: string;
  /** blob: URLs created along the way — call revokePreview() when done with them. */
  objectUrls: string[];
}

/**
 * Builds a previewable document from extracted project files, or returns
 * null if there's no HTML entry point to preview. Handles static HTML/CSS/JS
 * projects — Node/framework projects go through lib/dev-server-preview.ts
 * (Phase 2) instead, which falls back to this for anything it can't run.
 *
 * Best-effort only: relative references are matched by exact path or plain
 * basename inside quotes/parens (covers typical <link href>, <script src>,
 * <img src>, CSS url(...), and simple JS string literals). Dynamically
 * constructed paths, bundler-style imports, and module resolution are out
 * of scope here — that's what Phase 2 (WebContainers) is for.
 */
export function buildStaticPreview(files: ClientFile[]): BuiltPreview | null {
  const htmlFiles = files.filter((f) => f.ext === "html" || f.ext === "htm");
  if (htmlFiles.length === 0) return null;

  const entry =
    htmlFiles.find((f) => f.path === "index.html") ||
    htmlFiles.find((f) => !f.path.includes("/")) ||
    htmlFiles[0];

  const objectUrls: string[] = [];
  const urlByPath = new Map<string, string>();
  const urlByBasename = new Map<string, string>();
  const decoder = new TextDecoder();

  function registerBlob(path: string, blob: Blob): string {
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    urlByPath.set(path, url);
    const base = path.split("/").pop() || path;
    urlByBasename.set(base, url);
    return url;
  }

  // TS's DOM lib types Blob's constructor to require an ArrayBufferView backed
  // by a plain ArrayBuffer, but Uint8Array (e.g. from JSZip) is typed against
  // the wider ArrayBufferLike (which also covers SharedArrayBuffer), so it
  // isn't assignable as-is. .slice() copies just the view's own bytes into a
  // fresh, plain ArrayBuffer, which satisfies the stricter type and is safe
  // regardless of whether the source view had a byteOffset into a larger buffer.
  function toBlobPart(bytes: Uint8Array): ArrayBuffer {
    return bytes.slice().buffer as ArrayBuffer;
  }

  function rewriteRefs(text: string): string {
    return text.replace(/(["'(])(\.{0,2}\/?[\w\-./]+\.\w+)(["')])/g, (whole, open, ref, close) => {
      const clean = ref.replace(/^\.\//, "").replace(/^\//, "");
      const url = urlByPath.get(clean) || urlByBasename.get(clean.split("/").pop() || "");
      return url ? open + url + close : whole;
    });
  }

  const otherFiles = files.filter((f) => f !== entry && f.ext !== "html" && f.ext !== "htm");
  const binaryFiles = otherFiles.filter((f) => !TEXT_EXTS.has(f.ext));
  const textFiles = otherFiles.filter((f) => TEXT_EXTS.has(f.ext));

  // Binary assets (images/fonts/etc.) get their final URL right away.
  for (const f of binaryFiles) {
    registerBlob(f.path, new Blob([toBlobPart(f.bytes)], { type: MIME[f.ext] || "application/octet-stream" }));
  }

  // Text assets: register a first-pass URL (raw bytes) so other files can
  // resolve a reference to them by path, then rewrite each one's own
  // internal references against the full map and swap in the final URL.
  const rawText = new Map<string, string>();
  for (const f of textFiles) {
    const text = decoder.decode(f.bytes);
    rawText.set(f.path, text);
    registerBlob(f.path, new Blob([text], { type: MIME[f.ext] || "text/plain" }));
  }
  for (const f of textFiles) {
    const rewritten = rewriteRefs(rawText.get(f.path) as string);
    const url = URL.createObjectURL(new Blob([rewritten], { type: MIME[f.ext] || "text/plain" }));
    objectUrls.push(url);
    urlByPath.set(f.path, url);
    urlByBasename.set(f.path.split("/").pop() || f.path, url);
  }

  const blobToPath: Record<string, string> = {};
  for (const [path, url] of urlByPath) blobToPath[url] = path;

  const bridgeScript = buildBridgeScript(blobToPath, entry.path);
  let entryHtml = rewriteRefs(decoder.decode(entry.bytes));
  entryHtml = /<\/body>/i.test(entryHtml)
    ? entryHtml.replace(/<\/body>/i, `${bridgeScript}</body>`)
    : entryHtml + bridgeScript;

  return { html: entryHtml, entryPath: entry.path, objectUrls };
}

export function revokePreview(preview: BuiltPreview | null) {
  if (!preview) return;
  preview.objectUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });
}
