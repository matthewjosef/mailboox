use hdi::prelude::*;

/// Fetch a valid record and deserialize its app entry as `T`.
pub fn must_get_typed<T>(hash: &ActionHash) -> ExternResult<(Record, T)>
where
    T: TryFrom<SerializedBytes, Error = SerializedBytesError>,
{
    let record = must_get_valid_record(hash.clone())?;
    let entry = record
        .entry()
        .to_app_option::<T>()
        .map_err(|e| wasm_error!(e))?
        .ok_or_else(|| {
            wasm_error!(WasmErrorInner::Guest(format!(
                "Record {hash} doesn't hold the expected entry type"
            )))
        })?;
    Ok((record, entry))
}

pub fn must_get_record_author(hash: &ActionHash) -> ExternResult<AgentPubKey> {
    Ok(must_get_action(hash.clone())?.action().author().clone())
}

pub fn target_action_hash(target: &AnyLinkableHash) -> ExternResult<ActionHash> {
    target.clone().into_action_hash().ok_or_else(|| {
        wasm_error!(WasmErrorInner::Guest("Link target must be an action hash".into()))
    })
}

pub fn base_action_hash(base: &AnyLinkableHash) -> ExternResult<ActionHash> {
    base.clone().into_action_hash().ok_or_else(|| {
        wasm_error!(WasmErrorInner::Guest("Link base must be an action hash".into()))
    })
}

pub fn invalid(msg: &str) -> ExternResult<ValidateCallbackResult> {
    Ok(ValidateCallbackResult::Invalid(msg.to_string()))
}
