use hdi::prelude::*;

pub mod book;
pub mod helpers;
pub mod loan;
pub mod profile;

pub use book::*;
pub use loan::*;
pub use profile::*;

use helpers::*;

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    Book(Book),
    Collection(Collection),
    BorrowRequest(BorrowRequest),
    Loan(Loan),
    ReturnNotice(ReturnNotice),
    ReturnDispute(ReturnDispute),
    ReturnReceipt(ReturnReceipt),
    HandoffNotice(HandoffNotice),
    PickupConfirmation(PickupConfirmation),
    LibraryProfile(LibraryProfile),
    #[entry_type(visibility = "private")]
    ContactDetails(ContactDetails),
    SealedDetails(SealedDetails),
}

#[derive(Serialize, Deserialize)]
#[hdk_link_types]
pub enum LinkTypes {
    /// "all_books" path → original book action
    AllBooks,
    /// owner agent → original book action
    OwnerToBooks,
    /// original book action → update action
    BookUpdates,
    /// original book action → borrow request
    BookToRequests,
    /// requester agent → borrow request
    RequesterToRequests,
    /// original book action → loan
    BookToLoans,
    /// borrower agent → loan
    BorrowerToLoans,
    /// owner agent → loan
    OwnerToLoans,
    /// loan → handoff / pickup / return notice / dispute / receipt (tag says which)
    LoanToEvents,
    /// collection → original book action
    CollectionToBooks,
    /// member agent → their latest LibraryProfile
    AgentToProfile,
    /// request or loan → sealed contact details for the other party
    ContextToSealedDetails,
}

// Validation you perform during the genesis process. Nobody else on the network performs it, only you.
// There *is no* access to network calls in this callback
#[hdk_extern]
pub fn genesis_self_check(_data: GenesisSelfCheckData) -> ExternResult<ValidateCallbackResult> {
    Ok(ValidateCallbackResult::Valid)
}

// Validation the network performs when you try to join, you can't perform this validation yourself as you are not a member yet.
// There *is* access to network calls in this function
pub fn validate_agent_joining(
    _agent_pub_key: AgentPubKey,
    _membrane_proof: &Option<MembraneProof>,
) -> ExternResult<ValidateCallbackResult> {
    Ok(ValidateCallbackResult::Valid)
}

// Holochain has already checked signatures, chain ordering, entry hashes and types,
// and that updates/deletes point at an existing Create of the same type.
// See https://docs.rs/hdi/latest/hdi/index.html#data-validation
#[hdk_extern]
pub fn validate(op: Op) -> ExternResult<ValidateCallbackResult> {
    match op.flattened::<EntryTypes, LinkTypes>()? {
        FlatOp::CreateEntry(OpEntry::CreateEntry { app_entry, action }) => {
            validate_create_entry(action.author(), &app_entry)
        }
        FlatOp::CreateEntry(OpEntry::UpdateEntry { app_entry, action }) => {
            validate_update_entry(action.author(), &action.original_action_address, &app_entry)
        }
        FlatOp::Update(OpUpdate::Entry { app_entry, action }) => {
            validate_update_entry(action.author(), &action.original_action_address, &app_entry)
        }
        FlatOp::Delete(OpDelete { action }) => {
            validate_delete_entry(action.author(), &action.deletes_address)
        }
        FlatOp::Link(OpLink::CreateLink { link_type, action }) => validate_create_link(
            link_type,
            action.author(),
            &action.base_address,
            &action.target_address,
            &action.tag,
        ),
        FlatOp::Link(OpLink::DeleteLink {
            link_type,
            original_action,
            action,
        }) => validate_delete_link(link_type, &original_action, action.author()),
        FlatOp::CreateRecord(record) => match record {
            // Complementary validation of the record itself, so `must_get_valid_record`
            // only returns records that passed the entry/link checks above.
            OpRecord::CreateEntry { app_entry, action } => {
                validate_create_entry(action.author(), &app_entry)
            }
            OpRecord::UpdateEntry { app_entry, action } => {
                validate_update_entry(action.author(), &action.original_action_address, &app_entry)
            }
            OpRecord::DeleteEntry { action } => {
                validate_delete_entry(action.author(), &action.deletes_address)
            }
            OpRecord::CreateLink { link_type, action } => validate_create_link(
                link_type,
                action.author(),
                &action.base_address,
                &action.target_address,
                &action.tag,
            ),
            OpRecord::DeleteLink { action } => {
                let original = TypedAction::<CreateLinkData>::try_from_action(
                    must_get_action(action.link_add_address.clone())?.action().clone(),
                )?;
                let Some(link_type) = LinkTypes::from_type(original.zome_index, original.link_type)?
                else {
                    return Ok(ValidateCallbackResult::Valid);
                };
                validate_delete_link(link_type, &original, action.author())
            }
            _ => Ok(ValidateCallbackResult::Valid),
        },
        FlatOp::AgentActivity(OpActivity::CreateAgent { agent, action }) => {
            let prev = action
                .prev_action()
                .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("expected a prior action".into())))?
                .clone();
            let previous_action = must_get_action(prev)?;
            match &previous_action.action().data {
                ActionData::AgentValidationPkg(AgentValidationPkgData { membrane_proof, .. }) => {
                    validate_agent_joining(agent, membrane_proof)
                }
                _ => invalid(
                    "The previous action for a `CreateAgent` action must be an `AgentValidationPkg`",
                ),
            }
        }
        _ => Ok(ValidateCallbackResult::Valid),
    }
}

fn validate_create_entry(author: &AgentPubKey, entry: &EntryTypes) -> ExternResult<ValidateCallbackResult> {
    match entry {
        EntryTypes::Book(book) => validate_book(book),
        EntryTypes::Collection(collection) => validate_collection(collection),
        EntryTypes::BorrowRequest(request) => validate_create_borrow_request(author, request),
        EntryTypes::Loan(loan) => validate_create_loan(author, loan),
        EntryTypes::ReturnNotice(notice) => validate_create_return_notice(author, notice),
        EntryTypes::ReturnDispute(dispute) => validate_create_return_dispute(author, dispute),
        EntryTypes::ReturnReceipt(receipt) => validate_create_return_receipt(author, receipt),
        EntryTypes::HandoffNotice(notice) => validate_create_handoff_notice(author, notice),
        EntryTypes::PickupConfirmation(c) => validate_create_pickup_confirmation(author, c),
        EntryTypes::LibraryProfile(profile) => validate_profile(profile),
        EntryTypes::ContactDetails(_) => Ok(ValidateCallbackResult::Valid),
        EntryTypes::SealedDetails(sealed) => validate_create_sealed_details(author, sealed),
    }
}

fn validate_update_entry(
    author: &AgentPubKey,
    original_action: &ActionHash,
    entry: &EntryTypes,
) -> ExternResult<ValidateCallbackResult> {
    match entry {
        EntryTypes::Book(book) => {
            if &must_get_record_author(original_action)? != author {
                return invalid("Only the book's owner can edit it");
            }
            validate_book(book)
        }
        EntryTypes::Collection(collection) => {
            if &must_get_record_author(original_action)? != author {
                return invalid("Only the collection's owner can edit it");
            }
            validate_collection(collection)
        }
        EntryTypes::LibraryProfile(profile) => {
            if &must_get_record_author(original_action)? != author {
                return invalid("Only the member can edit their profile");
            }
            validate_profile(profile)
        }
        // Requests, loans and their events are a permanent record.
        _ => invalid("This kind of entry can't be edited"),
    }
}

fn validate_delete_entry(author: &AgentPubKey, deletes: &ActionHash) -> ExternResult<ValidateCallbackResult> {
    let record = must_get_valid_record(deletes.clone())?;
    let original_author = record.action().author();
    let Some(EntryType::App(def)) = record.action().entry_type() else {
        return Ok(ValidateCallbackResult::Valid);
    };
    let entry = record
        .entry()
        .as_option()
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Deleted record has no entry".into())))?;
    let Some(original) = EntryTypes::deserialize_from_type(def.zome_index, def.entry_index, entry)? else {
        return Ok(ValidateCallbackResult::Valid);
    };
    match original {
        EntryTypes::Book(_) | EntryTypes::Collection(_) | EntryTypes::LibraryProfile(_) => {
            if original_author != author {
                return invalid("Only the owner can delete this");
            }
            Ok(ValidateCallbackResult::Valid)
        }
        // The requester can withdraw a request; the book's owner can decline it.
        EntryTypes::BorrowRequest(request) => {
            if original_author == author || &must_get_record_author(&request.book)? == author {
                Ok(ValidateCallbackResult::Valid)
            } else {
                invalid("Only the requester or the book's owner can remove a borrow request")
            }
        }
        _ => invalid("Loans and their history can't be deleted"),
    }
}

fn validate_create_link(
    link_type: LinkTypes,
    author: &AgentPubKey,
    base: &AnyLinkableHash,
    target: &AnyLinkableHash,
    tag: &LinkTag,
) -> ExternResult<ValidateCallbackResult> {
    let author_hash = AnyLinkableHash::from(author.clone());
    match link_type {
        LinkTypes::AllBooks => {
            let (record, _) = must_get_typed::<Book>(&target_action_hash(target)?)?;
            if record.action().author() != author {
                return invalid("You can only list your own books");
            }
        }
        LinkTypes::OwnerToBooks => {
            if base != &author_hash {
                return invalid("Owner links must start from your own agent key");
            }
            let (record, _) = must_get_typed::<Book>(&target_action_hash(target)?)?;
            if record.action().author() != author {
                return invalid("You can only link your own books");
            }
        }
        LinkTypes::BookUpdates => {
            if &must_get_record_author(&base_action_hash(base)?)? != author
                || &must_get_record_author(&target_action_hash(target)?)? != author
            {
                return invalid("Only the book's owner can link its updates");
            }
        }
        LinkTypes::BookToRequests | LinkTypes::RequesterToRequests => {
            let (record, request) = must_get_typed::<BorrowRequest>(&target_action_hash(target)?)?;
            if record.action().author() != author {
                return invalid("Only the requester can link a borrow request");
            }
            let expected_base = match link_type {
                LinkTypes::BookToRequests => AnyLinkableHash::from(request.book),
                _ => author_hash,
            };
            if base != &expected_base {
                return invalid("Borrow request link has the wrong base");
            }
        }
        LinkTypes::BookToLoans | LinkTypes::BorrowerToLoans | LinkTypes::OwnerToLoans => {
            let (record, loan) = must_get_typed::<Loan>(&target_action_hash(target)?)?;
            if record.action().author() != author {
                return invalid("Only the book's owner can link a loan");
            }
            let expected_base = match link_type {
                LinkTypes::BookToLoans => AnyLinkableHash::from(loan.book),
                LinkTypes::BorrowerToLoans => AnyLinkableHash::from(loan.borrower),
                _ => author_hash,
            };
            if base != &expected_base {
                return invalid("Loan link has the wrong base");
            }
        }
        LinkTypes::LoanToEvents => {
            let loan_hash = base_action_hash(base)?;
            let event_hash = target_action_hash(target)?;
            let event_loan = match tag.0.as_slice() {
                NOTICE_TAG => must_get_typed::<ReturnNotice>(&event_hash)?.1.loan,
                DISPUTE_TAG => must_get_typed::<ReturnDispute>(&event_hash)?.1.loan,
                RECEIPT_TAG => must_get_typed::<ReturnReceipt>(&event_hash)?.1.loan,
                HANDOFF_TAG => must_get_typed::<HandoffNotice>(&event_hash)?.1.loan,
                PICKUP_TAG => must_get_typed::<PickupConfirmation>(&event_hash)?.1.loan,
                _ => return invalid("Unknown loan event tag"),
            };
            if event_loan != loan_hash {
                return invalid("The event belongs to a different loan");
            }
            if &must_get_record_author(&event_hash)? != author {
                return invalid("Only the event's author can link it");
            }
        }
        LinkTypes::CollectionToBooks => {
            let (record, _) = must_get_typed::<Collection>(&base_action_hash(base)?)?;
            if record.action().author() != author {
                return invalid("Only the collection's owner can add books to it");
            }
        }
        LinkTypes::AgentToProfile => {
            if base != &author_hash {
                return invalid("You can only link your own profile");
            }
            let (record, _) = must_get_typed::<LibraryProfile>(&target_action_hash(target)?)?;
            if record.action().author() != author {
                return invalid("You can only link your own profile");
            }
        }
        LinkTypes::ContextToSealedDetails => {
            let (record, sealed) = must_get_typed::<SealedDetails>(&target_action_hash(target)?)?;
            if record.action().author() != author {
                return invalid("Only the sender can link their sealed details");
            }
            if base != &AnyLinkableHash::from(sealed.context.hash().clone()) {
                return invalid("Sealed details link has the wrong base");
            }
        }
    }
    Ok(ValidateCallbackResult::Valid)
}

fn validate_delete_link(
    link_type: LinkTypes,
    original: &TypedAction<CreateLinkData>,
    author: &AgentPubKey,
) -> ExternResult<ValidateCallbackResult> {
    let link_author = original.author();
    match link_type {
        LinkTypes::AllBooks
        | LinkTypes::OwnerToBooks
        | LinkTypes::BookUpdates
        | LinkTypes::CollectionToBooks
        | LinkTypes::AgentToProfile
        | LinkTypes::ContextToSealedDetails => {
            if link_author != author {
                return invalid("Only the link's author can remove it");
            }
        }
        LinkTypes::BookToRequests | LinkTypes::RequesterToRequests => {
            let (_, request) = must_get_typed::<BorrowRequest>(&target_action_hash(&original.target_address)?)?;
            if link_author != author && &must_get_record_author(&request.book)? != author {
                return invalid("Only the requester or the book's owner can remove a borrow request");
            }
        }
        LinkTypes::BookToLoans
        | LinkTypes::BorrowerToLoans
        | LinkTypes::OwnerToLoans
        | LinkTypes::LoanToEvents => {
            return invalid("Loans and their history can't be removed");
        }
    }
    Ok(ValidateCallbackResult::Valid)
}
