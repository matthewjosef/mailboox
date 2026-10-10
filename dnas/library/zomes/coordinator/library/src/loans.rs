use hdk::prelude::*;
use library_integrity::*;

use crate::requests::{get_incoming_requests, remove_request, RequestView};
use crate::utils::*;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum LoanStatus {
    Active,
    ReturnPending,
    Closed,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum LoanEventKind {
    ReturnNotice,
    ReturnDispute,
    ReturnReceipt,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct LoanView {
    pub loan_hash: ActionHash,
    pub book_hash: ActionHash,
    pub owner: AgentPubKey,
    pub borrower: AgentPubKey,
    pub started_at: Timestamp,
    pub status: LoanStatus,
    pub last_event: Option<LoanEventKind>,
    pub last_event_at: Option<Timestamp>,
    /// The most recent return notice, needed to dispute it.
    pub last_notice: Option<ActionHash>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct MyLoans {
    pub borrowed: Vec<LoanView>,
    pub lent: Vec<LoanView>,
}

/// What needs my attention, for catching up after being offline.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct PendingActions {
    pub incoming_requests: Vec<RequestView>,
    pub returns_to_confirm: Vec<LoanView>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DisputeReturnInput {
    pub loan_hash: ActionHash,
    pub note: Option<String>,
}

impl LoanView {
    fn apply(&mut self, kind: LoanEventKind, at: Timestamp, event_hash: ActionHash) {
        self.status = match kind {
            LoanEventKind::ReturnNotice => {
                self.last_notice = Some(event_hash);
                LoanStatus::ReturnPending
            }
            LoanEventKind::ReturnDispute => LoanStatus::Active,
            LoanEventKind::ReturnReceipt => LoanStatus::Closed,
        };
        self.last_event = Some(kind);
        self.last_event_at = Some(at);
    }
}

fn event_kind(tag: &LinkTag) -> Option<LoanEventKind> {
    match tag.0.as_slice() {
        NOTICE_TAG => Some(LoanEventKind::ReturnNotice),
        DISPUTE_TAG => Some(LoanEventKind::ReturnDispute),
        RECEIPT_TAG => Some(LoanEventKind::ReturnReceipt),
        _ => None,
    }
}

/// Work out a loan's status from its event links. Validation guarantees each
/// tag matches its target and that only the right party wrote each event.
#[hdk_extern]
pub fn get_loan(loan_hash: ActionHash) -> ExternResult<Option<LoanView>> {
    let Some(record) = get(loan_hash.clone(), GetOptions::network())? else {
        return Ok(None);
    };
    let loan: Loan = decode_entry(&record)?;
    let mut view = LoanView {
        loan_hash: loan_hash.clone(),
        book_hash: loan.book,
        owner: record.action().author().clone(),
        borrower: loan.borrower,
        started_at: record.action().timestamp(),
        status: LoanStatus::Active,
        last_event: None,
        last_event_at: None,
        last_notice: None,
    };
    let mut events = links(loan_hash, LinkTypes::LoanToEvents)?;
    events.sort_by_key(|link| link.timestamp);
    for link in events {
        if let Some(kind) = event_kind(&link.tag) {
            view.apply(kind, link.timestamp, link_target(&link)?);
        }
    }
    Ok(Some(view))
}

fn loan_or_err(loan_hash: &ActionHash) -> ExternResult<LoanView> {
    get_loan(loan_hash.clone())?.ok_or_else(|| guest_error("Loan not found"))
}

fn views_from(links: Vec<Link>) -> ExternResult<Vec<LoanView>> {
    let mut views = Vec::new();
    for link in links {
        if let Some(view) = get_loan(link_target(&link)?)? {
            views.push(view);
        }
    }
    views.sort_by_key(|v| std::cmp::Reverse(v.started_at));
    Ok(views)
}

pub fn open_loan_for(book_hash: &ActionHash) -> ExternResult<Option<LoanView>> {
    Ok(views_from(links(book_hash.clone(), LinkTypes::BookToLoans)?)?
        .into_iter()
        .find(|loan| loan.status != LoanStatus::Closed))
}

#[hdk_extern]
pub fn accept_request(request_hash: ActionHash) -> ExternResult<LoanView> {
    let request_record = get_record(&request_hash)?;
    let request: BorrowRequest = decode_entry(&request_record)?;
    if open_loan_for(&request.book)?.is_some() {
        return Err(guest_error("This book is already on loan"));
    }
    let borrower = request_record.action().author().clone();
    let loan_hash = create_entry(EntryTypes::Loan(Loan {
        book: request.book.clone(),
        borrower: borrower.clone(),
        request: request_hash.clone(),
    }))?;
    create_link(request.book.clone(), loan_hash.clone(), LinkTypes::BookToLoans, ())?;
    create_link(borrower.clone(), loan_hash.clone(), LinkTypes::BorrowerToLoans, ())?;
    create_link(me()?, loan_hash.clone(), LinkTypes::OwnerToLoans, ())?;
    remove_request(&request_hash)?;
    Ok(LoanView {
        loan_hash,
        book_hash: request.book,
        owner: me()?,
        borrower,
        started_at: sys_time()?,
        status: LoanStatus::Active,
        last_event: None,
        last_event_at: None,
        last_notice: None,
    })
}

fn record_event(
    mut view: LoanView,
    entry: EntryTypes,
    kind: LoanEventKind,
    tag: &[u8],
) -> ExternResult<LoanView> {
    let event_hash = create_entry(entry)?;
    create_link(view.loan_hash.clone(), event_hash.clone(), LinkTypes::LoanToEvents, tag.to_vec())?;
    view.apply(kind, sys_time()?, event_hash);
    Ok(view)
}

/// Borrower: "I've returned it." Notifies the owner (see signals.rs).
#[hdk_extern]
pub fn mark_returned(loan_hash: ActionHash) -> ExternResult<LoanView> {
    let view = loan_or_err(&loan_hash)?;
    match view.status {
        LoanStatus::Active => {}
        LoanStatus::ReturnPending => return Err(guest_error("You've already marked this book returned")),
        LoanStatus::Closed => return Err(guest_error("This loan is already closed")),
    }
    record_event(
        view,
        EntryTypes::ReturnNotice(ReturnNotice { loan: loan_hash }),
        LoanEventKind::ReturnNotice,
        NOTICE_TAG,
    )
}

/// Owner: "I have it back." Works with or without a return notice.
#[hdk_extern]
pub fn confirm_received(loan_hash: ActionHash) -> ExternResult<LoanView> {
    let view = loan_or_err(&loan_hash)?;
    if view.status == LoanStatus::Closed {
        return Err(guest_error("This loan is already closed"));
    }
    record_event(
        view,
        EntryTypes::ReturnReceipt(ReturnReceipt { loan: loan_hash }),
        LoanEventKind::ReturnReceipt,
        RECEIPT_TAG,
    )
}

/// Owner: "Not received." Reopens the loan and notifies the borrower.
#[hdk_extern]
pub fn dispute_return(input: DisputeReturnInput) -> ExternResult<LoanView> {
    let view = loan_or_err(&input.loan_hash)?;
    let (LoanStatus::ReturnPending, Some(notice)) = (&view.status, view.last_notice.clone()) else {
        return Err(guest_error("There's no return to dispute"));
    };
    record_event(
        view,
        EntryTypes::ReturnDispute(ReturnDispute {
            loan: input.loan_hash,
            notice,
            note: input.note,
        }),
        LoanEventKind::ReturnDispute,
        DISPUTE_TAG,
    )
}

#[hdk_extern]
pub fn get_my_loans() -> ExternResult<MyLoans> {
    Ok(MyLoans {
        borrowed: views_from(links(me()?, LinkTypes::BorrowerToLoans)?)?,
        lent: views_from(links(me()?, LinkTypes::OwnerToLoans)?)?,
    })
}

#[hdk_extern]
pub fn get_pending_actions() -> ExternResult<PendingActions> {
    let returns_to_confirm = views_from(links(me()?, LinkTypes::OwnerToLoans)?)?
        .into_iter()
        .filter(|loan| loan.status == LoanStatus::ReturnPending)
        .collect();
    Ok(PendingActions {
        incoming_requests: get_incoming_requests(())?,
        returns_to_confirm,
    })
}
