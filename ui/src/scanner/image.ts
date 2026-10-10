import type { Pass } from "./passes";
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

/** A photo decoded once (EXIF rotation applied), for rendering several passes from it. */
export async function loadPhoto(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

/** Size of a w×h image after turning it by `degrees`. */
export function rotatedSize(w: number, h: number, degrees: number): { width: number; height: number } {
  const r = (Math.abs(degrees) * Math.PI) / 180;
  const [c, s] = [Math.abs(Math.cos(r)), Math.abs(Math.sin(r))];
  return { width: Math.round(w * c + h * s), height: Math.round(w * s + h * c) };
}

/** Crop a pass out of the photo, turn it, shrink it to the shelf size limit, and encode it. */
export function renderPass(photo: ImageBitmap, pass: Pass): string {
  const sx = pass.rect.x * photo.width;
  const sy = pass.rect.y * photo.height;
  const sw = pass.rect.w * photo.width;
  const sh = pass.rect.h * photo.height;
  const turned = rotatedSize(sw, sh, pass.rotate);
  const scale = Math.min(1, MAX_SIDE.shelf / Math.max(turned.width, turned.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(turned.width * scale);
  canvas.height = Math.round(turned.height * scale);
  const ctx = canvas.getContext("2d")!;
  // White corners where a turned photo doesn't reach, so they don't read as dark shapes.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((pass.rotate * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.drawImage(photo, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
