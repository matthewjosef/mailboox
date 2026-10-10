use library::{BookListing, LoanView, RequestView};
use library_integrity::{ContactDetails, LibraryProfile, RoundedPin};

use crate::common::*;

fn details(address: &str) -> ContactDetails {
    ContactDetails {
        address: address.to_string(),
        instructions: "Mailbox is the green one".to_string(),
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn everyone_sees_a_members_approximate_area() {
    let net = setup(2).await;
    let (alice, bob) = (0, 1);
    let area = LibraryProfile { area: Some(RoundedPin { lat_centi: 4561, lng_centi: -12268 }) };

    let _: () = net.call(alice, "set_my_profile", area.clone()).await;
    net.sync().await;
    let seen: Option<LibraryProfile> = net.call(bob, "get_profile", net.agent(alice)).await;
    assert_eq!(seen, Some(area));

    // Moving updates it rather than adding a second profile.
    let moved = LibraryProfile { area: Some(RoundedPin { lat_centi: 4562, lng_centi: -12268 }) };
    let _: () = net.call(alice, "set_my_profile", moved.clone()).await;
    net.sync().await;
    let seen: Option<LibraryProfile> = net.call(bob, "get_profile", net.agent(alice)).await;
    assert_eq!(seen, Some(moved));

    let nobody: Option<LibraryProfile> = net.call(alice, "get_profile", net.agent(bob)).await;
    assert_eq!(nobody, None);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_pin_must_be_on_the_map() {
    let net = setup(1).await;
    let err = net
        .call_err(0, "set_my_profile", LibraryProfile { area: Some(RoundedPin { lat_centi: 12000, lng_centi: 0 }) })
        .await;
    assert!(err.contains("off the map"), "{err}");
}

#[tokio::test(flavor = "multi_thread")]
async fn exact_details_are_shared_only_with_the_other_party() {
    let net = setup(3).await;
    let (alice, bob, carol) = (0, 1, 2);

    let _: () = net.call(alice, "set_my_contact_details", details("12 Maple St")).await;
    let _: () = net.call(bob, "set_my_contact_details", details("40 Elm Ave")).await;
    let mine: Option<ContactDetails> = net.call(bob, "get_my_contact_details", ()).await;
    assert_eq!(mine, Some(details("40 Elm Ave")));

    let book: BookListing = net.call(alice, "create_book", sample_book("Frankenstein")).await;
    net.sync().await;

    // Bob's details travel with his request, readable by Alice only.
    let request: RequestView = net.call(bob, "request_borrow", book.book_hash.clone()).await;
    net.sync().await;
    let for_alice: Option<ContactDetails> = net.call(alice, "get_shared_details", request.request_hash.clone()).await;
    assert_eq!(for_alice, Some(details("40 Elm Ave")));
    let for_carol: Option<ContactDetails> = net.call(carol, "get_shared_details", request.request_hash.clone()).await;
    assert_eq!(for_carol, None);

    // Alice's details are revealed to Bob when she accepts.
    let loan: LoanView = net.call(alice, "accept_request", request.request_hash.clone()).await;
    net.sync().await;
    let for_bob: Option<ContactDetails> = net.call(bob, "get_shared_details", loan.loan_hash.clone()).await;
    assert_eq!(for_bob, Some(details("12 Maple St")));
    let for_carol: Option<ContactDetails> = net.call(carol, "get_shared_details", loan.loan_hash.clone()).await;
    assert_eq!(for_carol, None);

    // During the loan, Alice can still find Bob's details through the loan's request.
    let as_owner: Option<LoanView> = net.call(alice, "get_loan", loan.loan_hash.clone()).await;
    let request_hash = as_owner.unwrap().request;
    let still: Option<ContactDetails> = net.call(alice, "get_shared_details", request_hash).await;
    assert_eq!(still, Some(details("40 Elm Ave")));
}
