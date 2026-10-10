use hdk::prelude::*;
use library_integrity::*;

use crate::loans::{open_loan_for, LoanView};
use crate::utils::*;

/// A book as the UI shows it: its latest content, who owns it, and whether it's out.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct BookListing {
    /// The original (create) action hash. Stays the same across edits.
    pub book_hash: ActionHash,
    pub owner: AgentPubKey,
    pub created_at: Timestamp,
    pub book: Book,
    pub open_loan: Option<LoanView>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateBookInput {
    pub book_hash: ActionHash,
    pub updated_book: Book,
}

fn all_books_anchor() -> ExternResult<EntryHash> {
    Path::from("all_books").path_entry_hash()
}

fn commit_book(book: Book) -> ExternResult<ActionHash> {
    let book_hash = create_entry(EntryTypes::Book(book))?;
    create_link(all_books_anchor()?, book_hash.clone(), LinkTypes::AllBooks, ())?;
    create_link(me()?, book_hash.clone(), LinkTypes::OwnerToBooks, ())?;
    Ok(book_hash)
}

fn listing_or_err(book_hash: &ActionHash) -> ExternResult<BookListing> {
    get_book(book_hash.clone())?.ok_or_else(|| guest_error("Book not found"))
}

#[hdk_extern]
pub fn create_book(book: Book) -> ExternResult<BookListing> {
    let book_hash = commit_book(book)?;
    listing_or_err(&book_hash)
}

/// Used by the shelf scanner and CSV import after the user has reviewed the matches.
#[hdk_extern]
pub fn create_books_batch(books: Vec<Book>) -> ExternResult<Vec<BookListing>> {
    let hashes = books.into_iter().map(commit_book).collect::<ExternResult<Vec<_>>>()?;
    hashes.iter().map(listing_or_err).collect()
}

/// The newest version of a book: the latest update linked from the original, or the original.
fn latest_book_record(book_hash: &ActionHash) -> ExternResult<Option<Record>> {
    let latest_update = links(book_hash.clone(), LinkTypes::BookUpdates)?
        .into_iter()
        .max_by_key(|link| link.timestamp);
    match latest_update {
        Some(link) => get(link_target(&link)?, GetOptions::network()),
        None => get(book_hash.clone(), GetOptions::network()),
    }
}

#[hdk_extern]
pub fn update_book(input: UpdateBookInput) -> ExternResult<BookListing> {
    let original = get_record(&input.book_hash)?;
    if original.action().author() != &me()? {
        return Err(guest_error("Only the book's owner can edit it"));
    }
    let previous = latest_book_record(&input.book_hash)?
        .ok_or_else(|| guest_error("Book not found"))?;
    let updated_hash = update_entry(previous.action_address().clone(), &input.updated_book)?;
    create_link(input.book_hash.clone(), updated_hash, LinkTypes::BookUpdates, ())?;
    Ok(BookListing {
        book: input.updated_book,
        ..listing_or_err(&input.book_hash)?
    })
}

#[hdk_extern]
pub fn delete_book(book_hash: ActionHash) -> ExternResult<ActionHash> {
    let original = get_record(&book_hash)?;
    if original.action().author() != &me()? {
        return Err(guest_error("Only the owner can delete this"));
    }
    if open_loan_for(&book_hash)?.is_some() {
        return Err(guest_error("This book is on loan; mark it received before deleting it"));
    }
    delete_links_to(all_books_anchor()?, LinkTypes::AllBooks, &book_hash)?;
    delete_links_to(me()?, LinkTypes::OwnerToBooks, &book_hash)?;
    delete_entry(book_hash)
}

#[hdk_extern]
pub fn get_book(book_hash: ActionHash) -> ExternResult<Option<BookListing>> {
    let Some(Details::Record(details)) = get_details(book_hash.clone(), GetOptions::network())? else {
        return Ok(None);
    };
    if !details.deletes.is_empty() {
        return Ok(None);
    }
    let Some(latest) = latest_book_record(&book_hash)? else {
        return Ok(None);
    };
    let original = details.record.action();
    Ok(Some(BookListing {
        book_hash: book_hash.clone(),
        owner: original.author().clone(),
        created_at: original.timestamp(),
        book: decode_entry::<Book>(&latest)?,
        open_loan: open_loan_for(&book_hash)?,
    }))
}

fn listings_from(links: Vec<Link>) -> ExternResult<Vec<BookListing>> {
    let mut listings = Vec::new();
    for link in links {
        if let Some(listing) = get_book(link_target(&link)?)? {
            listings.push(listing);
        }
    }
    listings.sort_by(|a, b| a.book.title.to_lowercase().cmp(&b.book.title.to_lowercase()));
    Ok(listings)
}

#[hdk_extern]
pub fn get_all_books() -> ExternResult<Vec<BookListing>> {
    listings_from(links(all_books_anchor()?, LinkTypes::AllBooks)?)
}

#[hdk_extern]
pub fn get_books_for_owner(owner: AgentPubKey) -> ExternResult<Vec<BookListing>> {
    listings_from(links(owner, LinkTypes::OwnerToBooks)?)
}

/// Original book hashes owned by this agent, without fetching their contents.
pub fn my_book_hashes() -> ExternResult<Vec<ActionHash>> {
    links(me()?, LinkTypes::OwnerToBooks)?.iter().map(link_target).collect()
}
