import type { Book } from "./types";

const demo = (title: string, authors: string[], cover: string, genre: string): Book => ({
  title,
  authors,
  isbn: null,
  open_library_key: null,
  cover_url: `covers/${cover}.jpg`,
  genre,
  blurb: null,
  source: "Manual",
});

/** The sample shelf from the original 2018 MailBoox, for trying the app out. */
export const DEMO_BOOKS: Book[] = [
  demo("1984", ["George Orwell"], "1984", "Fiction"),
  demo("Alice's Adventures in Wonderland", ["Lewis Carroll"], "alice", "Fiction"),
  demo("Holy Bible (King James Version)", [], "bible", "Religion"),
  demo("Brave New World", ["Aldous Huxley"], "brave", "Fiction"),
  demo("Frankenstein", ["Mary Shelley"], "frankenstein", "Fiction"),
  demo("Persepolis", ["Marjane Satrapi"], "persepolis", "Graphic novel"),
  demo("Resistance: The Warsaw Ghetto Uprising", ["Israel Gutman"], "resistance", "History"),
  demo("The Perks of Being a Wallflower", ["Stephen Chbosky"], "wallflower", "Fiction"),
];

/** Best available cover image for a book, or null to draw a placeholder. */
export function coverSrc(book: Book): string | null {
  if (book.cover_url) return book.cover_url;
  if (book.isbn) return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(book.isbn)}-M.jpg?default=false`;
  return null;
}
