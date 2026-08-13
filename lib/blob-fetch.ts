/**
 * Fetches a Vercel Blob's content into memory. Used by the routes that need
 * to read the uploaded ZIP now that it lives in Blob storage instead of
 * arriving directly in the request body — see components/UploadZone.tsx.
 */
export async function fetchBlobBuffer(blobUrl: string): Promise<Buffer> {
  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error(`blob_fetch_failed_${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
