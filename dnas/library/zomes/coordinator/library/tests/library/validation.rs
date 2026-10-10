use library::{BookListing, LoanView, RequestView, UpdateBookInput};

use crate::common::*;

async fn lent_book(n: usize) -> (Network, BookListing, LoanView) {
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
async fn only_the_right_people_can_move_a_loan_along() {
    let (net, book, loan) = lent_book(3).await;
    let (alice, bob, carol) = (0, 1, 2);

    // Bob (the borrower) can't confirm the owner got it back.
    let err = net.call_err(bob, "confirm_received", loan.loan_hash.clone()).await;
    assert!(err.contains("Only the book's owner can confirm"), "{err}");

    // Carol can't mark Bob's loan returned.
    let err = net.call_err(carol, "mark_returned", loan.loan_hash.clone()).await;
    assert!(err.contains("Only the borrower can mark"), "{err}");

    // Alice (the owner) can't mark it returned on Bob's behalf either.
    let err = net.call_err(alice, "mark_returned", loan.loan_hash.clone()).await;
    assert!(err.contains("Only the borrower can mark"), "{err}");

    // Carol asks for the book while it's out; Alice can't lend it twice.
    let request: RequestView = net.call(carol, "request_borrow", book.book_hash.clone()).await;
    net.sync().await;
    let err = net.call_err(alice, "accept_request", request.request_hash.clone()).await;
    assert!(err.contains("already on loan"), "{err}");
}

#[tokio::test(flavor = "multi_thread")]
async fn only_the_owner_can_edit_or_delete_a_book_and_nobody_borrows_their_own() {
    let net = setup(2).await;
    let (alice, bob) = (0, 1);
    let book: BookListing = net.call(alice, "create_book", sample_book("Emma")).await;
    net.sync().await;

    let err = net
        .call_err(
            bob,
            "update_book",
            UpdateBookInput { book_hash: book.book_hash.clone(), updated_book: sample_book("Mine now") },
        )
        .await;
    assert!(err.contains("Only the book's owner can edit it"), "{err}");

    let err = net.call_err(bob, "delete_book", book.book_hash.clone()).await;
    assert!(err.contains("Only the owner can delete this"), "{err}");

    let err = net.call_err(alice, "request_borrow", book.book_hash.clone()).await;
    assert!(err.contains("can't ask to borrow your own book"), "{err}");

    let err = net.call_err(alice, "create_book", sample_book("   ")).await;
    assert!(err.contains("A book needs a title"), "{err}");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_dispute_needs_a_pending_return() {
    let (net, _book, loan) = lent_book(2).await;
    let alice = 0;
    let err = net
        .call_err(
            alice,
            "dispute_return",
            library::DisputeReturnInput { loan_hash: loan.loan_hash.clone(), note: None },
        )
        .await;
    assert!(err.contains("no return to dispute"), "{err}");
}
