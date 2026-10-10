use library::{
    BookListing, DisputeReturnInput, LoanEventKind, LoanStatus, LoanView, PendingActions,
    RequestView, Signal as LibrarySignal,
};

use crate::common::*;

/// Alice lends Frankenstein to Bob. Returns (network, book listing, active loan).
async fn active_loan() -> (Network, BookListing, LoanView) {
    let net = setup(2).await;
    let (alice, bob) = (0, 1);
    let book: BookListing = net.call(alice, "create_book", sample_book("Frankenstein")).await;
    net.sync().await;
    let request: RequestView = net.call(bob, "request_borrow", book.book_hash.clone()).await;
    net.sync().await;
    let loan: LoanView = net.call(alice, "accept_request", request.request_hash).await;
    let loan: LoanView = net.call(alice, "confirm_handover", loan.loan_hash).await;
    net.sync().await;
    (net, book, loan)
}

#[tokio::test(flavor = "multi_thread")]
async fn borrower_marks_returned_and_owner_is_notified_then_confirms() {
    let (net, book, loan) = active_loan().await;
    let (alice, bob) = (0, 1);
    let mut alice_signals = net.signals(alice);
    let mut bob_signals = net.signals(bob);

    let after_notice: LoanView = net.call(bob, "mark_returned", loan.loan_hash.clone()).await;
    assert_eq!(after_notice.status, LoanStatus::ReturnPending);
    assert_eq!(after_notice.last_event, Some(LoanEventKind::ReturnNotice));

    expect_signal(&mut alice_signals, |s| {
        matches!(s, LibrarySignal::BookReturned { loan_hash, borrower, .. }
            if *loan_hash == loan.loan_hash && *borrower == net.agent(bob))
    })
    .await;

    net.sync().await;
    let seen_by_alice: Option<LoanView> = net.call(alice, "get_loan", loan.loan_hash.clone()).await;
    assert_eq!(seen_by_alice.unwrap().status, LoanStatus::ReturnPending);

    let closed: LoanView = net.call(alice, "confirm_received", loan.loan_hash.clone()).await;
    assert_eq!(closed.status, LoanStatus::Closed);

    expect_signal(&mut bob_signals, |s| {
        matches!(s, LibrarySignal::ReturnConfirmed { loan_hash, .. } if *loan_hash == loan.loan_hash)
    })
    .await;

    net.sync().await;
    // The book is available again, and Bob can ask for it a second time.
    let listing: Option<BookListing> = net.call(bob, "get_book", book.book_hash.clone()).await;
    assert!(listing.unwrap().open_loan.is_none());
    let _again: RequestView = net.call(bob, "request_borrow", book.book_hash.clone()).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn owner_disputes_a_return_and_the_loan_reopens() {
    let (net, _book, loan) = active_loan().await;
    let (alice, bob) = (0, 1);
    let mut bob_signals = net.signals(bob);

    let _: LoanView = net.call(bob, "mark_returned", loan.loan_hash.clone()).await;
    net.sync().await;

    let disputed: LoanView = net
        .call(
            alice,
            "dispute_return",
            DisputeReturnInput {
                loan_hash: loan.loan_hash.clone(),
                note: Some("It's not in my mailbox".to_string()),
            },
        )
        .await;
    assert_eq!(disputed.status, LoanStatus::Active);
    assert_eq!(disputed.last_event, Some(LoanEventKind::ReturnDispute));

    expect_signal(&mut bob_signals, |s| {
        matches!(s, LibrarySignal::ReturnDisputed { loan_hash, note, .. }
            if *loan_hash == loan.loan_hash && note.as_deref() == Some("It's not in my mailbox"))
    })
    .await;

    net.sync().await;
    let seen_by_bob: Option<LoanView> = net.call(bob, "get_loan", loan.loan_hash.clone()).await;
    assert_eq!(seen_by_bob.unwrap().last_note.as_deref(), Some("It's not in my mailbox"));

    // Bob drops it off for real and marks it returned again; Alice confirms.
    let pending: LoanView = net.call(bob, "mark_returned", loan.loan_hash.clone()).await;
    assert_eq!(pending.status, LoanStatus::ReturnPending);
    net.sync().await;
    let closed: LoanView = net.call(alice, "confirm_received", loan.loan_hash.clone()).await;
    assert_eq!(closed.status, LoanStatus::Closed);
}

#[tokio::test(flavor = "multi_thread")]
async fn owner_can_mark_received_without_a_notice() {
    let (net, _book, loan) = active_loan().await;
    let alice = 0;

    let closed: LoanView = net.call(alice, "confirm_received", loan.loan_hash.clone()).await;
    assert_eq!(closed.status, LoanStatus::Closed);
    assert_eq!(closed.last_event, Some(LoanEventKind::ReturnReceipt));
}

#[tokio::test(flavor = "multi_thread")]
async fn owner_catches_up_on_a_return_made_while_offline() {
    let (mut net, _book, loan) = active_loan().await;
    let (alice, bob) = (0, 1);

    net.conductors[alice].shutdown().await;
    let _: LoanView = net.call(bob, "mark_returned", loan.loan_hash.clone()).await;
    net.conductors[alice].startup().await;
    net.conductors.exchange_peer_info().await;
    net.sync().await;

    let pending: PendingActions = net.call(alice, "get_pending_actions", ()).await;
    assert_eq!(pending.returns_to_confirm.len(), 1);
    assert_eq!(pending.returns_to_confirm[0].loan_hash, loan.loan_hash);
    assert!(pending.incoming_requests.is_empty());
}
