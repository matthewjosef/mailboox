// Talks to Ollama on this computer. Photos never leave the device.
import type { Layout } from "./passes";
import { buildChatRequest, parseDetections, parseLayout, type Detection, type PromptKind } from "./recognition";

export const OLLAMA_URL = "http://localhost:11434";

export type OllamaStatus =
  /** Not installed, not running, or not allowing Moss Tools (OLLAMA_ORIGINS). The browser can't tell which. */
  | { state: "unreachable" }
  | { state: "noVisionModel" }
  | { state: "ready"; visionModels: string[] };

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: Fetch = (url, init) => fetch(url, init);

export async function checkOllama(fetchFn: Fetch = defaultFetch): Promise<OllamaStatus> {
  try {
    const version = await fetchFn(`${OLLAMA_URL}/api/version`, { signal: AbortSignal.timeout(3000) });
    if (!version.ok) return { state: "unreachable" };
    const tags = (await (await fetchFn(`${OLLAMA_URL}/api/tags`)).json()) as { models?: { name: string }[] };
    const names = (tags.models ?? []).map((m) => m.name);
    const visionModels: string[] = [];
    for (const name of names) {
      const res = await fetchFn(`${OLLAMA_URL}/api/show`, { method: "POST", body: JSON.stringify({ model: name }) });
      const info = (await res.json()) as { capabilities?: string[] };
      if (info.capabilities?.includes("vision")) visionModels.push(name);
    }
    return visionModels.length ? { state: "ready", visionModels } : { state: "noVisionModel" };
  } catch {
    return { state: "unreachable" };
  }
}

/** Ask the model what books it can read in one image. */
export async function read(
  model: string,
  imageBase64: string,
  kind: PromptKind,
  { fetchFn = defaultFetch, signal }: { fetchFn?: Fetch; signal?: AbortSignal } = {},
): Promise<{ detections: Detection[]; layout: Layout | null }> {
  const res = await fetchFn(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    body: JSON.stringify(buildChatRequest(model, imageBase64, kind)),
    signal,
  });
  const data = (await res.json()) as { message?: { content?: string }; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `Ollama returned ${res.status}`);
  const content = data.message?.content ?? "";
  return { detections: parseDetections(content), layout: parseLayout(content) };
}

export async function recognize(
  model: string,
  imageBase64: string,
  kind: PromptKind,
  options: { fetchFn?: Fetch; signal?: AbortSignal } = {},
): Promise<Detection[]> {
  return (await read(model, imageBase64, kind, options)).detections;
}
