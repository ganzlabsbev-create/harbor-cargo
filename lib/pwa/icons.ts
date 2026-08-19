// All of this runs in the browser only (canvas + Image) — Harbor PWA never
// sends the source icon anywhere, so there's no server-side image pipeline
// to keep in sync with.

export interface LoadedIcon {
  image: HTMLImageElement;
  width: number;
  height: number;
  isSquare: boolean;
}

const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export function isAcceptedIconFile(file: File): boolean {
  return ACCEPTED_MIME.has(file.type) || /\.(png|jpe?g|webp|svg)$/i.test(file.name);
}

export async function loadIconFromFile(file: File): Promise<{ loaded: LoadedIcon; bytes: Uint8Array; objectUrl: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: file.type || guessMime(file.name) }));

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = objectUrl;
  });

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  return {
    loaded: { image, width, height, isSquare: width > 0 && width === height },
    bytes,
    objectUrl,
  };
}

function guessMime(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "svg") return "image/svg+xml";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/** Resizes (center-crop to square, then scale) an already-loaded image into a PNG of `size`x`size`. */
export async function renderIconPng(image: HTMLImageElement, size: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  const srcSize = Math.min(srcW, srcH);
  const sx = (srcW - srcSize) / 2;
  const sy = (srcH - srcSize) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, srcSize, srcSize, 0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("icon_export_failed");
  return new Uint8Array(await blob.arrayBuffer());
}

/** The sizes Harbor PWA generates: the two manifest requires, plus apple-touch-icon since iOS ignores the manifest for home-screen icons. */
export const ICON_SIZES = [
  { size: 192, fileName: "icon-192.png", purpose: "manifest" as const },
  { size: 512, fileName: "icon-512.png", purpose: "manifest" as const },
  { size: 180, fileName: "apple-touch-icon.png", purpose: "apple" as const },
];
