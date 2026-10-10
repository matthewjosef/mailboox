// Runs a scan: each photo is read and its books looked up, independently of the others.
import type { LookupResult } from "./lookup";
import type { Detection, ScanKind } from "./recognition";
import type { ScanResult } from "./review";

export interface PhotoFailure {
  /** 1-based position, as shown to the person. */
  photo: number;
  name: string;
  message: string;
}

interface Deps {
  prepare: (file: File) => Promise<string>;
  recognize: (imageBase64: string, signal?: AbortSignal) => Promise<Detection[]>;
  lookup: (detection: Detection) => Promise<LookupResult>;
  onProgress: (message: string) => void;
  /** Between catalogue lookups, to be gentle with the free catalogues. */
  pause: () => Promise<void>;
  signal?: AbortSignal;
}

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

/** One failing photo doesn't lose the books found in the others. Cancelling stops everything. */
export async function scanPhotos(
  files: File[],
  _kind: ScanKind,
  { prepare, recognize, lookup, onProgress, pause, signal }: Deps,
): Promise<{ results: ScanResult[]; failures: PhotoFailure[] }> {
  const results: ScanResult[] = [];
  const failures: PhotoFailure[] = [];
  for (const [i, file] of files.entries()) {
    checkCancelled(signal);
    onProgress(files.length > 1 ? `Reading photo ${i + 1} of ${files.length}…` : "Reading the photo…");
    let detections: Detection[];
    try {
      detections = await recognize(await prepare(file), signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      failures.push({ photo: i + 1, name: file.name, message: (e as Error).message });
      continue;
    }
    for (const [j, detection] of detections.entries()) {
      checkCancelled(signal);
      onProgress(`Looking up ${detection.title} (${j + 1} of ${detections.length})…`);
      results.push({ detection, lookup: await lookup(detection) });
      await pause();
    }
  }
  return { results, failures };
}
