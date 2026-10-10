import { CellType, type AppClient, type DnaHash } from "@holochain/client";
import { AppletServices, type WAL } from "@theweave/api";

import { LibraryClient, ROLE_NAME } from "../library/libraryClient";

export const BOOK_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#b5532f" d="M6 2h11a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h2V4H6zm4 0v16h7V4h-7z"/></svg>`,
  );

export async function libraryDnaHash(client: AppClient): Promise<DnaHash> {
  const info = await client.appInfo();
  const cell = info?.cell_info[ROLE_NAME]?.find((c) => c.type === CellType.Provisioned);
  if (!cell || cell.type !== CellType.Provisioned) throw new Error("Library cell not found");
  return cell.value.cell_id[0];
}

/** What Moss asks of MailBoox: how to describe a book link, and how to find books in group search. */
export function createAppletServices(): AppletServices {
  const services = new AppletServices();
  services.creatables = {};

  services.getAssetInfo = async (appletClient, wal) => {
    const listing = await new LibraryClient(appletClient).getBook(wal.hrl[1]);
    if (!listing) return undefined;
    return { name: listing.book.title, icon_src: BOOK_ICON };
  };

  services.search = async (appletClient, _appletHash, _weave, filter): Promise<WAL[]> => {
    const q = filter.trim().toLowerCase();
    if (!q) return [];
    const [books, dnaHash] = await Promise.all([
      new LibraryClient(appletClient).getAllBooks(),
      libraryDnaHash(appletClient),
    ]);
    return books
      .filter((b) => b.book.title.toLowerCase().includes(q) || b.book.authors.some((a) => a.toLowerCase().includes(q)))
      .map((b) => ({ hrl: [dnaHash, b.book_hash] }));
  };

  return services;
}
