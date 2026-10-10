// Export and import a shelf as a file: a backup, a way to merge two copies of MailBoox in Moss,
// and the bridge to a future version that needs a new install. Loans and requests can't be
// moved: they're shared records between two people.
import { isSameBook } from "../scanner/review";
import type { Book, BookSource, ContactDetails, LibraryProfile, RoundedPin } from "./types";

export const BACKUP_FORMAT = "mailboox-backup";
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  appVersion: string;
  books: Book[];
  profile: LibraryProfile | null;
  /** Private: only included when the person asks for it. */
  contact: ContactDetails | null;
}

export function makeBackup(
  data: { books: Book[]; profile: LibraryProfile | null; contact: ContactDetails | null },
  appVersion: string,
  now = new Date(),
): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    appVersion,
    books: data.books.map(cleanBook),
    profile: data.profile,
    contact: data.contact,
  };
}

export function backupFileName(now = new Date()): string {
  return `mailboox-shelf-${now.toISOString().slice(0, 10)}.json`;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const SOURCES: BookSource[] = ["Manual", "Scan", "Import"];

function cleanBook(b: Book): Book {
  return {
    title: b.title,
    authors: [...b.authors],
    isbn: b.isbn,
    open_library_key: b.open_library_key,
    cover_url: b.cover_url,
    genre: b.genre,
    blurb: b.blurb,
    source: b.source,
  };
}

function parseBook(raw: unknown): Book | null {
  const b = raw as Record<string, unknown>;
  const title = str(b?.title);
  if (!title) return null;
  const authors = Array.isArray(b.authors) ? b.authors.map(str).filter((a): a is string => !!a) : [];
  return {
    title,
    authors,
    isbn: str(b.isbn),
    open_library_key: str(b.open_library_key),
    cover_url: str(b.cover_url),
    genre: str(b.genre),
    blurb: str(b.blurb),
    source: SOURCES.includes(b.source as BookSource) ? (b.source as BookSource) : "Import",
  };
}

function parsePin(raw: unknown): RoundedPin | null {
  const p = raw as Record<string, unknown>;
  const ok = (n: unknown, max: number) => Number.isInteger(n) && Math.abs(n as number) <= max;
  return p && ok(p.lat_centi, 9000) && ok(p.lng_centi, 18000)
    ? { lat_centi: p.lat_centi as number, lng_centi: p.lng_centi as number }
    : null;
}

/** Read a backup file's text. Throws a message fit to show the person. */
export function parseBackup(text: string): Backup {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That isn't a MailBoox backup file (it isn't JSON).");
  }
  if (raw?.format !== BACKUP_FORMAT) throw new Error("That isn't a MailBoox backup file.");
  if (raw.version !== BACKUP_VERSION)
    throw new Error(`This backup was made by a newer MailBoox (format ${raw.version}). Update MailBoox, then try again.`);
  if (!Array.isArray(raw.books)) throw new Error("This backup has no book list.");
  const books = raw.books.map(parseBook).filter((b): b is Book => !!b);
  const area = parsePin((raw.profile as Record<string, unknown> | null)?.area);
  const c = raw.contact as Record<string, unknown> | null;
  const address = str(c?.address);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: str(raw.exportedAt) ?? "",
    appVersion: str(raw.appVersion) ?? "",
    books,
    profile: area ? { area } : null,
    contact: address ? { address, instructions: str(c?.instructions) ?? "" } : null,
  };
}

export interface ImportPlan {
  toAdd: Book[];
  alreadyOnShelf: number;
  restoreArea: RoundedPin | null;
  restoreContact: ContactDetails | null;
}

/** What importing would do: new books only, and details only where none are set yet. */
export function planImport(
  backup: Backup,
  current: { books: Book[]; profile: LibraryProfile | null; contact: ContactDetails | null },
): ImportPlan {
  const toAdd: Book[] = [];
  let alreadyOnShelf = 0;
  for (const book of backup.books) {
    if ([...current.books, ...toAdd].some((b) => isSameBook(b, book))) alreadyOnShelf++;
    else toAdd.push(book);
  }
  return {
    toAdd,
    alreadyOnShelf,
    restoreArea: current.profile?.area ? null : (backup.profile?.area ?? null),
    restoreContact: current.contact?.address.trim() ? null : backup.contact,
  };
}
