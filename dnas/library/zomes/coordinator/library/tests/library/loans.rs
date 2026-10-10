use library::{BookListing, LoanStatus, LoanView, MyLoans, RequestView, Signal as LibrarySignal};

use crate::common::*;

#[tokio::test(flavor = "multi_thread")]
async fn bob_requests_alice_accepts_and_bob_is_the_borrower() {
    let net = setup(2).await;
    let (alice, bob) = (0, 1);
    let mut alice_signals = net.signals(alice);
    let mut bob_signals = net.signals(bob);

    let book: BookListing = net.call(alice, "create_book", sample_book("Frankenstein")).await;
    net.sync().await;

    let request: RequestView = net.call(bob, "request_borrow", book.book_hash.clone()).await;
    assert_eq!(request.requester, net.agent(bob));

    expect_signal(&mut alice_signals, |s| {
        matches!(s, LibrarySignal::BorrowRequested { book_hash, .. } if *book_hash == book.book_hash)
    })
    .await;

    net.sync().await;
    let incoming: Vec<RequestView> = net.call(alice, "get_incoming_requests", ()).await;
    assert_eq!(incoming.len(), 1);
    assert_eq!(incoming[0].requester, net.agent(bob));

    let loan: LoanView = net.call(alice, "accept_request", request.request_hash.clone()).await;
    // The proto-era app recorded the owner as the borrower; make sure that bug is gone.
    assert_eq!(loan.borrower, net.agent(bob));
    assert_eq!(loan.owner, net.agent(alice));
    assert_eq!(loan.status, LoanStatus::Active);

    expect_signal(&mut bob_signals, |s| {
        matches!(s, LibrarySignal::RequestAccepted { loan_hash, .. } if *loan_hash == loan.loan_hash)
    })
    .await;

    net.sync().await;

    // The request is consumed by the loan.
    let incoming: Vec<RequestView> = net.call(alice, "get_incoming_requests", ()).await;
    assert!(incoming.is_empty());
    let mine: Vec<RequestView> = net.call(bob, "get_my_requests", ()).await;
    assert!(mine.is_empty());

    let listing: Option<BookListing> = net.call(bob, "get_book", book.book_hash.clone()).await;
    let open = listing.unwrap().open_loan.expect("book should be on loan");
    assert_eq!(open.borrower, net.agent(bob));

    let bobs: MyLoans = net.call(bob, "get_my_loans", ()).await;
    assert_eq!(bobs.borrowed.len(), 1);
    assert!(bobs.lent.is_empty());
    let alices: MyLoans = net.call(alice, "get_my_loans", ()).await;
    assert_eq!(alices.lent.len(), 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn alice_declines_and_bob_is_told() {
    let net = setup(2).await;
    let (alice, bob) = (0, 1);
    let mut bob_signals = net.signals(bob);

    let book: BookListing = net.call(alice, "create_book", sample_book("Emma")).await;
    net.sync().await;
    let request: RequestView = net.call(bob, "request_borrow", book.book_hash.clone()).await;
    net.sync().await;

    let _: () = net.call(alice, "decline_request", request.request_hash.clone()).await;
    expect_signal(&mut bob_signals, |s| {
        matches!(s, LibrarySignal::RequestDeclined { request_hash, .. } if *request_hash == request.request_hash)
    })
    .await;

    net.sync().await;
    let mine: Vec<RequestView> = net.call(bob, "get_my_requests", ()).await;
    assert!(mine.is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn bob_can_withdraw_his_request() {
    let net = setup(2).await;
    let (alice, bob) = (0, 1);

    let book: BookListing = net.call(alice, "create_book", sample_book("Dune")).await;
    net.sync().await;
    let request: RequestView = net.call(bob, "request_borrow", book.book_hash.clone()).await;
    let _: () = net.call(bob, "cancel_request", request.request_hash.clone()).await;
    net.sync().await;

    let incoming: Vec<RequestView> = net.call(alice, "get_incoming_requests", ()).await;
    assert!(incoming.is_empty());
}
