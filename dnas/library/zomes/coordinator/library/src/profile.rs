use hdk::prelude::*;
use library_integrity::*;

use crate::utils::*;

/// Publish (or move) my approximate area. Keeps a single profile link per member.
#[hdk_extern]
pub fn set_my_profile(profile: LibraryProfile) -> ExternResult<()> {
    let profile_hash = create_entry(EntryTypes::LibraryProfile(profile))?;
    for link in links(me()?, LinkTypes::AgentToProfile)? {
        delete_link(link.create_link_hash, GetOptions::network())?;
    }
    create_link(me()?, profile_hash, LinkTypes::AgentToProfile, ())?;
    Ok(())
}

#[hdk_extern]
pub fn get_profile(agent: AgentPubKey) -> ExternResult<Option<LibraryProfile>> {
    let latest = links(agent, LinkTypes::AgentToProfile)?
        .into_iter()
        .max_by_key(|link| link.timestamp);
    let Some(link) = latest else {
        return Ok(None);
    };
    let Some(record) = get(link_target(&link)?, GetOptions::network())? else {
        return Ok(None);
    };
    Ok(Some(decode_entry(&record)?))
}

/// Save my exact address and pickup instructions as a private entry on my own chain.
#[hdk_extern]
pub fn set_my_contact_details(details: ContactDetails) -> ExternResult<()> {
    create_entry(EntryTypes::ContactDetails(details))?;
    Ok(())
}

#[hdk_extern]
pub fn get_my_contact_details() -> ExternResult<Option<ContactDetails>> {
    let filter = ChainQueryFilter::new()
        .entry_type(UnitEntryTypes::ContactDetails.try_into()?)
        .include_entries(true);
    match query(filter)?.last() {
        Some(record) => Ok(Some(decode_entry(record)?)),
        None => Ok(None),
    }
}

/// Encrypt my contact details to `recipient` and attach them to a request or loan.
/// Does nothing if I haven't saved any details yet.
pub fn seal_my_details_for(recipient: &AgentPubKey, context: DetailsContext) -> ExternResult<()> {
    let Some(details) = get_my_contact_details(())? else {
        return Ok(());
    };
    let bytes = SerializedBytes::try_from(details).map_err(|e| wasm_error!(e))?;
    let sealed = ed_25519_x_salsa20_poly1305_encrypt(
        me()?,
        recipient.clone(),
        XSalsa20Poly1305Data::from(bytes.bytes().to_vec()),
    )?;
    let context_hash = context.hash().clone();
    let sealed_hash = create_entry(EntryTypes::SealedDetails(SealedDetails {
        recipient: recipient.clone(),
        context,
        sealed,
    }))?;
    create_link(context_hash, sealed_hash, LinkTypes::ContextToSealedDetails, ())?;
    Ok(())
}

/// The other party's contact details for a request or loan, if they were shared with me.
#[hdk_extern]
pub fn get_shared_details(context_hash: ActionHash) -> ExternResult<Option<ContactDetails>> {
    let me = me()?;
    let mut newest: Option<(Timestamp, ContactDetails)> = None;
    for link in links(context_hash, LinkTypes::ContextToSealedDetails)? {
        let Some(record) = get(link_target(&link)?, GetOptions::network())? else {
            continue;
        };
        let sealed: SealedDetails = decode_entry(&record)?;
        if sealed.recipient != me {
            continue;
        }
        let sender = record.action().author().clone();
        let plain = ed_25519_x_salsa20_poly1305_decrypt(me.clone(), sender, sealed.sealed)?;
        let details = ContactDetails::try_from(SerializedBytes::from(UnsafeBytes::from(plain.as_ref().to_vec())))
            .map_err(|e| wasm_error!(e))?;
        if newest.as_ref().is_none_or(|(at, _)| link.timestamp > *at) {
            newest = Some((link.timestamp, details));
        }
    }
    Ok(newest.map(|(_, details)| details))
}
