// What we ask the local vision model, and how we read its answer.
import { normalizeTitle } from "./matching";
import type { Layout } from "./passes";

export type ScanKind = "single" | "shelf";
/** What one image shows: a whole shelf, one book, or a close-up or turned copy of part of a shelf. */
export type PromptKind = ScanKind | "part";

export interface Detection {
  title: string;
  author: string | null;
  /** The model's own 0–1 confidence in its reading. */
  confidence: number;
}

const PROMPTS: Record<PromptKind, string> = {
  shelf: [
    "This photo shows books: on a shelf, in stacks, or both. List every book whose title you can read on its spine or cover.",
    "Books may stand upright (spine text usually runs sideways, top to bottom), lie flat in a stack (spine text runs left to right),",
    "or lean at an angle (spine text runs diagonally): read each spine in whichever direction makes sense.",
    "For each book give the title exactly as printed (without series numbers or publisher names), the author if visible,",
    "and your confidence from 0 to 1 that you read the title correctly.",
    "Skip spines you can't read rather than guessing. Use an empty string for an author you can't see.",
    "For each book also say whether it stands upright, lies flat, or leans.",
    "Then describe the layout: whether any books stand upright, lie flat, or lean, and for leaning books about how many degrees",
    "they tilt from vertical (positive if their tops lean right, negative if left, 0 if none lean).",
  ].join(" "),
  part: [
    "This image is a close-up or turned copy of part of a photo of books, so some spines may be cut off at the edges",
    "and some text may be upright, sideways or diagonal. List every book whose title you can read, reading each spine in",
    "whichever direction makes sense. For each book give the title exactly as printed (without series numbers or publisher",
    "names), the author if visible, and your confidence from 0 to 1 that you read the title correctly.",
    "Skip spines that are cut off or unreadable rather than guessing. Use an empty string for an author you can't see.",
  ].join(" "),
  single: [
    "This photo shows one book: its front cover or its spine.",
    "Give its title exactly as printed (without series numbers or publisher names), the author if visible,",
    "and your confidence from 0 to 1 that you read the title correctly.",
    "Use an empty string for an author you can't see. If there's no readable book, return an empty list.",
  ].join(" "),
};

// Ollama's `format` takes a JSON schema and constrains the output to it.
const BOOKS_SCHEMA = {
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

/** The first look at a whole shelf also reports the layout, which decides the follow-up passes. */
const SHELF_SCHEMA = {
  ...BOOKS_SCHEMA,
  properties: {
    books: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...BOOKS_SCHEMA.properties.books.items.properties,
          // Asked per book because the model judges one spine more reliably than the whole photo.
          orientation: { type: "string", enum: ["upright", "flat", "leaning"] },
        },
        required: ["title", "author", "confidence", "orientation"],
      },
    },
    layout: {
      type: "object",
      properties: {
        upright: { type: "boolean" },
        flat: { type: "boolean" },
        leaning: { type: "boolean" },
        leanDegrees: { type: "number" },
      },
      required: ["upright", "flat", "leaning", "leanDegrees"],
    },
  },
  required: ["books", "layout"],
};

/**
 * A shelf photo costs ~2,600 tokens before the model writes anything. With Ollama's default
 * 4,096-token context, a full shelf overflows mid-answer and qwen2.5vl crashes with
 * GGML_ASSERT(a->ne[2] * 4 == b->ne[0]); a context smaller than the image drops the image silently.
 */
// Image (≤ ~2,700 tokens at our 2,048 px limit) + the answer cap, with headroom; more costs RAM on smaller laptops.
export const CONTEXT_TOKENS = 12288;
/** Enough for ~150 books of JSON; stops a runaway answer. */
export const MAX_ANSWER_TOKENS = 6000;

export function buildChatRequest(model: string, imageBase64: string, kind: PromptKind) {
  return {
    model,
    stream: false as const,
    format: kind === "shelf" ? SHELF_SCHEMA : BOOKS_SCHEMA,
    options: { temperature: 0, num_ctx: CONTEXT_TOKENS, num_predict: MAX_ANSWER_TOKENS },
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

/** The layout from a whole-shelf reply, or null if the model gave none. Never throws. */
export function parseLayout(raw: string): Layout | null {
  const parsed = extractJson(raw) as { layout?: Record<string, unknown>; books?: unknown } | null;
  if (!parsed || Array.isArray(parsed)) return null;
  const l = parsed.layout && typeof parsed.layout === "object" ? parsed.layout : null;
  const orientations = new Set(
    (Array.isArray(parsed.books) ? parsed.books : []).map((b) => (b as Record<string, unknown>)?.orientation),
  );
  if (!l && !orientations.size) return null;
  const deg = typeof l?.leanDegrees === "number" && Number.isFinite(l.leanDegrees) ? l.leanDegrees : null;
  const leaning = l?.leaning === true || orientations.has("leaning") || (deg !== null && Math.abs(deg) >= 10);
  return {
    upright: l?.upright === true || orientations.has("upright"),
    flat: l?.flat === true || orientations.has("flat"),
    leaning,
    leanDegrees: leaning && deg ? deg : null,
  };
}
