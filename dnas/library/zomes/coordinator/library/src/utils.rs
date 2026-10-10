use hdk::prelude::*;
use library_integrity::LinkTypes;

pub fn links(base: impl Into<AnyLinkableHash>, link_type: LinkTypes) -> ExternResult<Vec<Link>> {
    get_links(LinkQuery::try_new(base, link_type)?, GetStrategy::Network)
}

pub fn link_target(link: &Link) -> ExternResult<ActionHash> {
    link.target
        .clone()
        .into_action_hash()
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Link target isn't an action".into())))
}

/// Delete every link of `link_type` from `base` that points at `target`.
pub fn delete_links_to(
    base: impl Into<AnyLinkableHash>,
    link_type: LinkTypes,
    target: &ActionHash,
) -> ExternResult<()> {
    let target = AnyLinkableHash::from(target.clone());
    for link in links(base, link_type)? {
        if link.target == target {
            delete_link(link.create_link_hash, GetOptions::network())?;
        }
    }
    Ok(())
}

pub fn get_record(hash: &ActionHash) -> ExternResult<Record> {
    get(hash.clone(), GetOptions::network())?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest(format!("Couldn't find record {hash}"))))
}

pub fn decode_entry<T>(record: &Record) -> ExternResult<T>
where
    T: TryFrom<SerializedBytes, Error = SerializedBytesError>,
{
    record
        .entry()
        .to_app_option::<T>()
        .map_err(|e| wasm_error!(e))?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Record has an unexpected entry type".into())))
}

pub fn guest_error(msg: impl Into<String>) -> WasmError {
    wasm_error!(WasmErrorInner::Guest(msg.into()))
}

pub fn me() -> ExternResult<AgentPubKey> {
    Ok(agent_info()?.agent_initial_pubkey)
}
