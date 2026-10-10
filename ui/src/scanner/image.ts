import type { ScanKind } from "./recognition";

/** Longest side in pixels. Shelves need more detail for small spine text; one book needs less. */
const MAX_SIDE: Record<ScanKind, number> = { single: 1280, shelf: 2048 };

export interface PreparedImage {
  /** JPEG, base64 without the data: prefix, as Ollama expects. */
  base64: string;
  previewUrl: string;
}

/** Fix phone rotation (EXIF) and shrink, so recognition is quicker and nothing huge is held in memory. */
export async function prepareImage(file: Blob, kind: ScanKind): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE[kind] / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), previewUrl: dataUrl };
}
