use library::{
    BookListing, LeaveForPickupInput, LoanEventKind, LoanStatus, LoanView, PendingActions, RequestView,
    Signal as LibrarySignal,
};
use library_integrity::HandoffMethod;

use crate::common::*;

/// Alice accepts Bob's request for Frankenstein (with Carol as a bystander when n = 3).
async fn accepted_loan(n: usize) -> (Network, BookListing, LoanView) {
    let net = setup(n).await;
    let (alice, bob) = (0, 1);
    let book: BookListing = net.call(alice, "create_book", sample_book("Frankenstein")).await;
    net.sync().await;
    let request: RequestView = net.call(bob, "request_borrow", book.book_hash.clone()).await;
    net.sync().await;
    let loan: LoanView = net.call(alice, "accept_request", request.request_hash).await;
    net.sync().await;
    (net, book, loan)
}

#[tokio::test(flavor = "multi_thread")]
async fn owner_leaves_it_in_the_borrowers_mailbox_and_borrower_confirms_pickup() {
    let (net, _book, loan) = accepted_loan(2).await;
    let (alice, bob) = (0, 1);
    let mut alice_signals = net.signals(alice);
    let mut bob_signals = net.signals(bob);
    assert_eq!(loan.status, LoanStatus::AwaitingHandoff);

    let ready: LoanView = net
        .call(
            alice,
            "leave_for_pickup",
            LeaveForPickupInput {
                loan_hash: loan.loan_hash.clone(),
                method: HandoffMethod::BorrowersMailbox,
                note: Some("In the blue box by your gate".to_string()),
            },
        )
        .await;
    assert_eq!(ready.status, LoanStatus::ReadyForPickup);
    assert_eq!(ready.handoff_method, Some(HandoffMethod::BorrowersMailbox));

    expect_signal(&mut bob_signals, |s| {
        matches!(s, LibrarySignal::HandoffReady { loan_hash, method: HandoffMethod::BorrowersMailbox, note, .. }
            if *loan_hash == loan.loan_hash && note.as_deref() == Some("In the blue box by your gate"))
    })
    .await;

    net.sync().await;
    let seen_by_bob: Option<LoanView> = net.call(bob, "get_loan", loan.loan_hash.clone()).await;
    let seen_by_bob = seen_by_bob.unwrap();
    assert_eq!(seen_by_bob.status, LoanStatus::ReadyForPickup);
    assert_eq!(seen_by_bob.last_note.as_deref(), Some("In the blue box by your gate"));

    let pending: PendingActions = net.call(bob, "get_pending_actions", ()).await;
    assert_eq!(pending.ready_for_pickup.len(), 1, "a borrower who was offline can catch up");

    let active: LoanView = net.call(bob, "confirm_handover", loan.loan_hash.clone()).await;
    assert_eq!(active.status, LoanStatus::Active);
    assert_eq!(active.last_event, Some(LoanEventKind::PickupConfirmation));

    expect_signal(&mut alice_signals, |s| {
        matches!(s, LibrarySignal::HandoverConfirmed { loan_hash, by, .. }
            if *loan_hash == loan.loan_hash && *by == net.agent(bob))
    })
    .await;

    net.sync().await;
    let returned: LoanView = net.call(bob, "mark_returned", loan.loan_hash.clone()).await;
    assert_eq!(returned.status, LoanStatus::ReturnPending);
}

#[tokio::test(flavor = "multi_thread")]
async fn owner_hands_it_over_in_person() {
    let (net, _book, loan) = accepted_loan(2).await;
    let alice = 0;
    let active: LoanView = net.call(alice, "confirm_handover", loan.loan_hash.clone()).await;
    assert_eq!(active.status, LoanStatus::Active);
}

#[tokio::test(flavor = "multi_thread")]
async fn borrower_cant_return_a_book_they_havent_picked_up() {
    let (net, _book, loan) = accepted_loan(2).await;
    let bob = 1;
    let err = net.call_err(bob, "mark_returned", loan.loan_hash.clone()).await;
    assert!(err.contains("haven't picked it up yet"), "{err}");
}

#[tokio::test(flavor = "multi_thread")]
async fn owner_can_cancel_before_the_handoff() {
    let (net, book, loan) = accepted_loan(2).await;
    let (alice, bob) = (0, 1);
    let cancelled: LoanView = net.call(alice, "confirm_received", loan.loan_hash.clone()).await;
    assert_eq!(cancelled.status, LoanStatus::Closed);
    net.sync().await;
    let listing: Option<BookListing> = net.call(bob, "get_book", book.book_hash).await;
    assert!(listing.unwrap().open_loan.is_none());
}

#[tokio::test(flavor = "multi_thread")]
async fn only_the_owner_leaves_it_and_only_the_parties_confirm_handover() {
    let (net, _book, loan) = accepted_loan(3).await;
    let (bob, carol) = (1, 2);

    let err = net
        .call_err(
            bob,
            "leave_for_pickup",
            LeaveForPickupInput { loan_hash: loan.loan_hash.clone(), method: HandoffMethod::OwnersMailbox, note: None },
        )
        .await;
    assert!(err.contains("Only the book's owner can leave it for pickup"), "{err}");

    let err = net.call_err(carol, "confirm_handover", loan.loan_hash.clone()).await;
    assert!(err.contains("Only the owner or the borrower can confirm"), "{err}");
}
