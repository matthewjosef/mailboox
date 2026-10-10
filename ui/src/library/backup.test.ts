import { describe, expect, it } from "vitest";

import { backupFileName, makeBackup, parseBackup, planImport } from "./backup";
import { emptyBook, type Book } from "./types";

const dune: Book = { ...emptyBook("Scan"), title: "Dune", authors: ["Frank Herbert"], isbn: "9780441013593" };
const emma: Book = { ...emptyBook(), title: "Emma", authors: ["Jane Austen"] };
const pin = { lat_centi: 4071, lng_centi: -7401 };
const contact = { address: "12 Maple St", instructions: "Green mailbox" };
const now = new Date("2026-10-10T12:00:00Z");

describe("backups", () => {
  it("round-trips books, location and (when chosen) contact details", () => {
    const backup = makeBackup({ books: [dune, emma], profile: { area: pin }, contact }, "0.1.5", now);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed).toEqual(backup);
    expect(backupFileName(now)).toBe("mailboox-shelf-2026-10-10.json");
  });

  it("explains files it can't read", () => {
    expect(() => parseBackup("not json")).toThrow(/isn't a MailBoox backup/);
    expect(() => parseBackup(JSON.stringify({ format: "other" }))).toThrow(/isn't a MailBoox backup/);
    expect(() => parseBackup(JSON.stringify({ format: "mailboox-backup", version: 2, books: [] }))).toThrow(/newer MailBoox/);
  });

  it("drops entries without a title and tidies the rest", () => {
    const text = JSON.stringify({
      format: "mailboox-backup",
      version: 1,
      books: [{ title: "  " }, { title: " Emma ", authors: ["Jane Austen", 7, ""], source: "Weird" }],
      profile: { area: { lat_centi: 99999, lng_centi: 0 } },
      contact: { address: "" },
    });
    const parsed = parseBackup(text);
    expect(parsed.books).toEqual([{ ...emptyBook("Import"), title: "Emma", authors: ["Jane Austen"] }]);
    expect(parsed.profile).toBeNull();
    expect(parsed.contact).toBeNull();
  });
});

describe("planImport", () => {
  const backup = makeBackup({ books: [dune, emma, { ...emma }], profile: { area: pin }, contact }, "0.1.5", now);

  it("skips books already on the shelf (and repeats in the file)", () => {
    const plan = planImport(backup, { books: [{ ...dune, title: "DUNE" }], profile: null, contact: null });
    expect(plan.toAdd).toEqual([emma]);
    expect(plan.alreadyOnShelf).toBe(2);
  });

  it("restores location and address only where none is set", () => {
    expect(planImport(backup, { books: [], profile: null, contact: null })).toMatchObject({ restoreArea: pin, restoreContact: contact });
    const set = planImport(backup, { books: [], profile: { area: { lat_centi: 1, lng_centi: 1 } }, contact: { address: "Elsewhere", instructions: "" } });
    expect(set.restoreArea).toBeNull();
    expect(set.restoreContact).toBeNull();
  });
});
