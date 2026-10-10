use hdk::prelude::*;
use library_integrity::*;

use crate::books::my_book_hashes;
use crate::profile::seal_my_details_for;
use crate::utils::*;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct RequestView {
    pub request_hash: ActionHash,
    pub book_hash: ActionHash,
    pub requester: AgentPubKey,
    pub created_at: Timestamp,
}

#[hdk_extern]
pub fn request_borrow(book_hash: ActionHash) -> ExternResult<RequestView> {
    if get_my_requests(())?.iter().any(|r| r.book_hash == book_hash) {
        return Err(guest_error("You've already asked to borrow this book"));
    }
    let request_hash = create_entry(EntryTypes::BorrowRequest(BorrowRequest {
        book: book_hash.clone(),
    }))?;
    create_link(book_hash.clone(), request_hash.clone(), LinkTypes::BookToRequests, ())?;
    create_link(me()?, request_hash.clone(), LinkTypes::RequesterToRequests, ())?;
    // The owner gets the requester's exact details, encrypted to them alone.
    let owner = get_record(&book_hash)?.action().author().clone();
    seal_my_details_for(&owner, DetailsContext::Request(request_hash.clone()))?;
    Ok(RequestView {
        request_hash,
        book_hash,
        requester: me()?,
        created_at: sys_time()?,
    })
}

/// Requests for one book. The link author is the requester (enforced by validation),
/// so this doesn't need to fetch each request.
#[hdk_extern]
pub fn get_requests_for_book(book_hash: ActionHash) -> ExternResult<Vec<RequestView>> {
    links(book_hash.clone(), LinkTypes::BookToRequests)?
        .iter()
        .map(|link| {
            Ok(RequestView {
                request_hash: link_target(link)?,
                book_hash: book_hash.clone(),
                requester: link.author.clone(),
                created_at: link.timestamp,
            })
        })
        .collect()
}

/// Requests other people have made for my books.
#[hdk_extern]
pub fn get_incoming_requests() -> ExternResult<Vec<RequestView>> {
    let mut requests = Vec::new();
    for book_hash in my_book_hashes()? {
        requests.extend(get_requests_for_book(book_hash)?);
    }
    requests.sort_by_key(|r| r.created_at);
    Ok(requests)
}

/// Requests I've made that are still waiting for an answer.
#[hdk_extern]
pub fn get_my_requests() -> ExternResult<Vec<RequestView>> {
    let mut requests = Vec::new();
    for link in links(me()?, LinkTypes::RequesterToRequests)? {
        let request_hash = link_target(&link)?;
        let Some(record) = get(request_hash.clone(), GetOptions::network())? else {
            continue;
        };
        let request: BorrowRequest = decode_entry(&record)?;
        requests.push(RequestView {
            request_hash,
            book_hash: request.book,
            requester: link.author.clone(),
            created_at: link.timestamp,
        });
    }
    Ok(requests)
}

/// Remove a request and both of its links. Validation allows this for the
/// requester (withdrawing) and for the book's owner (declining or accepting).
pub fn remove_request(request_hash: &ActionHash) -> ExternResult<BorrowRequest> {
    let record = get_record(request_hash)?;
    let request: BorrowRequest = decode_entry(&record)?;
    delete_links_to(request.book.clone(), LinkTypes::BookToRequests, request_hash)?;
    delete_links_to(record.action().author().clone(), LinkTypes::RequesterToRequests, request_hash)?;
    delete_entry(request_hash.clone())?;
    Ok(request)
}

#[hdk_extern]
pub fn cancel_request(request_hash: ActionHash) -> ExternResult<()> {
    remove_request(&request_hash)?;
    Ok(())
}

#[hdk_extern]
pub fn decline_request(request_hash: ActionHash) -> ExternResult<()> {
    remove_request(&request_hash)?;
    Ok(())
}
