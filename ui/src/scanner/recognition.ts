// What we ask the local vision model, and how we read its answer.
import { normalizeTitle } from "./matching";

export type ScanKind = "single" | "shelf";

export interface Detection {
  title: string;
  author: string | null;
  /** The model's own 0–1 confidence in its reading. */
  confidence: number;
}

const PROMPTS: Record<ScanKind, string> = {
  shelf: [
    "This photo shows books on a shelf. List every book whose title you can read on its spine or cover.",
    "Spines are often printed sideways: read them in whichever direction makes sense.",
    "For each book give the title exactly as printed (without series numbers or publisher names), the author if visible,",
    "and your confidence from 0 to 1 that you read the title correctly.",
    "Skip spines you can't read rather than guessing. Use an empty string for an author you can't see.",
  ].join(" "),
  single: [
    "This photo shows one book: its front cover or its spine.",
    "Give its title exactly as printed (without series numbers or publisher names), the author if visible,",
    "and your confidence from 0 to 1 that you read the title correctly.",
    "Use an empty string for an author you can't see. If there's no readable book, return an empty list.",
  ].join(" "),
};

// Ollama's `format` takes a JSON schema and constrains the output to it.
const SCHEMA = {
  type: "object",
  properties: {
    books: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          author: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["title", "author", "confidence"],
      },
    },
  },
  required: ["books"],
};

export function buildChatRequest(model: string, imageBase64: string, kind: ScanKind) {
  return {
    model,
    stream: false as const,
    format: SCHEMA,
    options: { temperature: 0 },
    messages: [{ role: "user" as const, content: PROMPTS[kind], images: [imageBase64] }],
  };
}

function extractJson(raw: string): unknown {
  const unfenced = raw.replace(/```(?:json)?/g, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.search(/[[{]/);
    const end = Math.max(unfenced.lastIndexOf("}"), unfenced.lastIndexOf("]"));
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** Turn the model's reply into clean detections, merging repeats. Never throws. */
export function parseDetections(raw: string): Detection[] {
  const parsed = extractJson(raw) as { books?: unknown } | unknown[] | null;
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.books) ? parsed.books : [];
  const byTitle = new Map<string, Detection>();
  for (const item of items as Record<string, unknown>[]) {
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    if (!title) continue;
    const rawAuthor = typeof item.author === "string" ? item.author.trim() : "";
    const author = rawAuthor && !/^(unknown|n\/?a|none)$/i.test(rawAuthor) ? rawAuthor : null;
    const c = typeof item.confidence === "number" && Number.isFinite(item.confidence) ? item.confidence : 0.5;
    const detection = { title, author, confidence: Math.min(1, Math.max(0, c)) };
    const key = normalizeTitle(title);
    const seen = byTitle.get(key);
    if (!seen || detection.confidence > seen.confidence) byTitle.set(key, detection);
  }
  return [...byTitle.values()];
}
