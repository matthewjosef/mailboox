use hdi::prelude::*;

use crate::book::Book;
use crate::helpers::{must_get_typed, must_get_record_author};

/// Written by someone who wants to borrow a book.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct BorrowRequest {
    /// The original (create) action hash of the book.
    pub book: ActionHash,
}

/// Written by the book's owner when they accept a borrow request.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Loan {
    pub book: ActionHash,
    pub borrower: AgentPubKey,
    pub request: ActionHash,
}

/// Written by the borrower: "I've returned the book."
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct ReturnNotice {
    pub loan: ActionHash,
}

/// Written by the owner when a return notice doesn't match reality: "Not received."
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct ReturnDispute {
    pub loan: ActionHash,
    pub notice: ActionHash,
    pub note: Option<String>,
}

/// Written by the owner when they have the book back. Closes the loan.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct ReturnReceipt {
    pub loan: ActionHash,
}

/// Link tags on `LoanToEvents`, so a loan's status can be read from its links
/// without fetching every event. Validation checks the tag matches the target.
pub const NOTICE_TAG: &[u8] = b"notice";
pub const DISPUTE_TAG: &[u8] = b"dispute";
pub const RECEIPT_TAG: &[u8] = b"receipt";

pub fn validate_create_borrow_request(
    author: &AgentPubKey,
    request: &BorrowRequest,
) -> ExternResult<ValidateCallbackResult> {
    let (book_record, _book) = must_get_typed::<Book>(&request.book)?;
    if book_record.action().author() == author {
        return Ok(ValidateCallbackResult::Invalid(
            "You can't ask to borrow your own book".into(),
        ));
    }
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_create_loan(author: &AgentPubKey, loan: &Loan) -> ExternResult<ValidateCallbackResult> {
    let (book_record, _book) = must_get_typed::<Book>(&loan.book)?;
    if book_record.action().author() != author {
        return Ok(ValidateCallbackResult::Invalid(
            "Only the book's owner can lend it out".into(),
        ));
    }
    let (request_record, request) = must_get_typed::<BorrowRequest>(&loan.request)?;
    if request.book != loan.book {
        return Ok(ValidateCallbackResult::Invalid(
            "The borrow request is for a different book".into(),
        ));
    }
    if request_record.action().author() != &loan.borrower {
        return Ok(ValidateCallbackResult::Invalid(
            "The borrower must be the person who asked to borrow the book".into(),
        ));
    }
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_create_return_notice(
    author: &AgentPubKey,
    notice: &ReturnNotice,
) -> ExternResult<ValidateCallbackResult> {
    let (_, loan) = must_get_typed::<Loan>(&notice.loan)?;
    if &loan.borrower != author {
        return Ok(ValidateCallbackResult::Invalid(
            "Only the borrower can mark a book as returned".into(),
        ));
    }
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_create_return_dispute(
    author: &AgentPubKey,
    dispute: &ReturnDispute,
) -> ExternResult<ValidateCallbackResult> {
    if &must_get_record_author(&dispute.loan)? != author {
        return Ok(ValidateCallbackResult::Invalid(
            "Only the book's owner can dispute a return".into(),
        ));
    }
    let (_, notice) = must_get_typed::<ReturnNotice>(&dispute.notice)?;
    if notice.loan != dispute.loan {
        return Ok(ValidateCallbackResult::Invalid(
            "The return notice belongs to a different loan".into(),
        ));
    }
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_create_return_receipt(
    author: &AgentPubKey,
    receipt: &ReturnReceipt,
) -> ExternResult<ValidateCallbackResult> {
    if &must_get_record_author(&receipt.loan)? != author {
        return Ok(ValidateCallbackResult::Invalid(
            "Only the book's owner can confirm they got it back".into(),
        ));
    }
    Ok(ValidateCallbackResult::Valid)
}
