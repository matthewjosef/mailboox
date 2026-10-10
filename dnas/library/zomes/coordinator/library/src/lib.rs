use hdk::prelude::*;

pub mod books;
pub mod loans;
pub mod requests;
pub mod signals;
mod utils;

pub use books::*;
pub use loans::*;
pub use requests::*;
pub use signals::*;

// Called the first time a zome call is made to the cell containing this zome.
// Other agents need to be able to send us signals (borrow requests, returns, ...).
#[hdk_extern]
pub fn init() -> ExternResult<InitCallbackResult> {
    let mut functions = HashSet::new();
    functions.insert((zome_info()?.name, FunctionName::from("recv_remote_signal")));
    create_cap_grant(ZomeCallCapGrant {
        tag: "remote_signals".into(),
        access: CapAccess::Unrestricted,
        functions: GrantedFunctions::Listed(functions),
    })?;
    Ok(InitCallbackResult::Pass)
}
