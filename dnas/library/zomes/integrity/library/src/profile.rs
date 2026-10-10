use hdi::prelude::*;

use crate::helpers::{invalid, must_get_record_author, must_get_typed};
use crate::loan::{BorrowRequest, Loan};

/// A map position rounded to hundredths of a degree (about 1 km). Storing whole
/// hundredths means a precise location can't be published, even by a modified client.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct RoundedPin {
    pub lat_centi: i32,
    pub lng_centi: i32,
}

/// What everyone in the group can see about a member: roughly where they are.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct LibraryProfile {
    pub area: Option<RoundedPin>,
}

/// Exact address and pickup instructions. Stored as a private entry on the
/// member's own chain; only ever shared encrypted to the other party of a loan.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct ContactDetails {
    pub address: String,
    pub instructions: String,
}

/// What a sealed copy of someone's contact details is attached to.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum DetailsContext {
    /// The requester's details, for the book's owner.
    Request(ActionHash),
    /// The owner's details, for the borrower.
    Loan(ActionHash),
}

impl DetailsContext {
    pub fn hash(&self) -> &ActionHash {
        match self {
            DetailsContext::Request(h) | DetailsContext::Loan(h) => h,
        }
    }
}

/// Contact details encrypted to one recipient.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct SealedDetails {
    pub recipient: AgentPubKey,
    pub context: DetailsContext,
    pub sealed: XSalsa20Poly1305EncryptedData,
}

pub fn validate_profile(profile: &LibraryProfile) -> ExternResult<ValidateCallbackResult> {
    if let Some(pin) = &profile.area {
        if !(-9000..=9000).contains(&pin.lat_centi) || !(-18000..=18000).contains(&pin.lng_centi) {
            return invalid("That location is off the map");
        }
    }
    Ok(ValidateCallbackResult::Valid)
}

/// Only the parties of a request or loan can exchange details, and only with each other.
pub fn validate_create_sealed_details(
    author: &AgentPubKey,
    sealed: &SealedDetails,
) -> ExternResult<ValidateCallbackResult> {
    match &sealed.context {
        DetailsContext::Request(request_hash) => {
            let (record, request) = must_get_typed::<BorrowRequest>(request_hash)?;
            if record.action().author() != author {
                return invalid("Only the requester can attach their details to a request");
            }
            if must_get_record_author(&request.book)? != sealed.recipient {
                return invalid("Request details can only be shared with the book's owner");
            }
        }
        DetailsContext::Loan(loan_hash) => {
            let (record, loan) = must_get_typed::<Loan>(loan_hash)?;
            if record.action().author() != author {
                return invalid("Only the book's owner can attach their details to a loan");
            }
            if loan.borrower != sealed.recipient {
                return invalid("Loan details can only be shared with the borrower");
            }
        }
    }
    Ok(ValidateCallbackResult::Valid)
}
