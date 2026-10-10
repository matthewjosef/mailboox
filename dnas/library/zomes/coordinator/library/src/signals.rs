use hdk::prelude::*;
use library_integrity::*;

use crate::utils::*;

/// Signals the UI receives. Most are sent to the *other* party of a loan via
/// remote signals; `LocalChange` tells this agent's own UI to refresh.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum Signal {
    BorrowRequested {
        request_hash: ActionHash,
        book_hash: ActionHash,
        requester: AgentPubKey,
    },
    RequestAccepted {
        loan_hash: ActionHash,
        book_hash: ActionHash,
    },
    RequestDeclined {
        request_hash: ActionHash,
        book_hash: ActionHash,
    },
    HandoffReady {
        loan_hash: ActionHash,
        book_hash: ActionHash,
        method: HandoffMethod,
        note: Option<String>,
    },
    HandoverConfirmed {
        loan_hash: ActionHash,
        book_hash: ActionHash,
        by: AgentPubKey,
    },
    BookReturned {
        loan_hash: ActionHash,
        book_hash: ActionHash,
        borrower: AgentPubKey,
    },
    ReturnDisputed {
        loan_hash: ActionHash,
        book_hash: ActionHash,
        note: Option<String>,
    },
    ReturnConfirmed {
        loan_hash: ActionHash,
        book_hash: ActionHash,
    },
    LocalChange,
}

#[hdk_extern]
pub fn recv_remote_signal(signal: Signal) -> ExternResult<()> {
    emit_signal(signal)
}

// Signals are sent after commit, so the other party is only told about
// things that actually made it onto the source chain.
#[hdk_extern(infallible)]
pub fn post_commit(committed_actions: Vec<SignedActionHashed>) {
    if let Err(err) = notify(&committed_actions) {
        error!("Error sending library signals: {:?}", err);
    }
    if let Err(err) = emit_signal(Signal::LocalChange) {
        error!("Error emitting local change signal: {:?}", err);
    }
}

fn app_entry(record: &Record) -> ExternResult<Option<EntryTypes>> {
    let Some(EntryType::App(def)) = record.action().entry_type() else {
        return Ok(None);
    };
    let Some(entry) = record.entry().as_option() else {
        return Ok(None);
    };
    EntryTypes::deserialize_from_type(def.zome_index, def.entry_index, entry)
}

fn send(signal: Signal, to: AgentPubKey) -> ExternResult<()> {
    send_remote_signal(signal, vec![to])
}

fn notify(committed: &[SignedActionHashed]) -> ExternResult<()> {
    let mut created = Vec::new();
    let mut deleted = Vec::new();
    for signed in committed {
        match &signed.action().data {
            ActionData::Create(_) => {
                let record = get_record(signed.as_hash())?;
                if let Some(entry) = app_entry(&record)? {
                    created.push((signed.as_hash().clone(), entry));
                }
            }
            ActionData::Delete(delete) => deleted.push(delete.deletes_address.clone()),
            _ => {}
        }
    }
    // Accepting a request deletes it in the same commit; that's not a decline.
    let accepted_in_this_commit = created.iter().any(|(_, e)| matches!(e, EntryTypes::Loan(_)));

    for (hash, entry) in created {
        match entry {
            EntryTypes::BorrowRequest(request) => {
                let owner = get_record(&request.book)?.action().author().clone();
                send(
                    Signal::BorrowRequested {
                        request_hash: hash,
                        book_hash: request.book,
                        requester: me()?,
                    },
                    owner,
                )?;
            }
            EntryTypes::Loan(loan) => send(
                Signal::RequestAccepted {
                    loan_hash: hash,
                    book_hash: loan.book,
                },
                loan.borrower,
            )?,
            EntryTypes::ReturnNotice(notice) => {
                let loan_record = get_record(&notice.loan)?;
                let loan: Loan = decode_entry(&loan_record)?;
                send(
                    Signal::BookReturned {
                        loan_hash: notice.loan,
                        book_hash: loan.book,
                        borrower: me()?,
                    },
                    loan_record.action().author().clone(),
                )?;
            }
            EntryTypes::ReturnDispute(dispute) => {
                let loan: Loan = decode_entry(&get_record(&dispute.loan)?)?;
                send(
                    Signal::ReturnDisputed {
                        loan_hash: dispute.loan,
                        book_hash: loan.book,
                        note: dispute.note,
                    },
                    loan.borrower,
                )?;
            }
            EntryTypes::ReturnReceipt(receipt) => {
                let loan: Loan = decode_entry(&get_record(&receipt.loan)?)?;
                send(
                    Signal::ReturnConfirmed {
                        loan_hash: receipt.loan,
                        book_hash: loan.book,
                    },
                    loan.borrower,
                )?;
            }
            EntryTypes::HandoffNotice(notice) => {
                let loan: Loan = decode_entry(&get_record(&notice.loan)?)?;
                send(
                    Signal::HandoffReady {
                        loan_hash: notice.loan,
                        book_hash: loan.book,
                        method: notice.method,
                        note: notice.note,
                    },
                    loan.borrower,
                )?;
            }
            EntryTypes::PickupConfirmation(confirmation) => {
                let loan_record = get_record(&confirmation.loan)?;
                let loan: Loan = decode_entry(&loan_record)?;
                let owner = loan_record.action().author().clone();
                let other = if owner == me()? { loan.borrower } else { owner };
                send(
                    Signal::HandoverConfirmed {
                        loan_hash: confirmation.loan,
                        book_hash: loan.book,
                        by: me()?,
                    },
                    other,
                )?;
            }
            EntryTypes::Book(_)
            | EntryTypes::Collection(_)
            | EntryTypes::LibraryProfile(_)
            | EntryTypes::ContactDetails(_)
            | EntryTypes::SealedDetails(_) => {}
        }
    }

    if !accepted_in_this_commit {
        for deleted_hash in deleted {
            // A plain `get` no longer returns the record once it's deleted.
            let Some(Details::Record(details)) = get_details(deleted_hash.clone(), GetOptions::network())?
            else {
                continue;
            };
            let record = details.record;
            let requester = record.action().author().clone();
            if let Some(EntryTypes::BorrowRequest(request)) = app_entry(&record)? {
                // The owner removed someone else's request: that's a decline.
                if requester != me()? {
                    send(
                        Signal::RequestDeclined {
                            request_hash: deleted_hash,
                            book_hash: request.book,
                        },
                        requester,
                    )?;
                }
            }
        }
    }
    Ok(())
}
