use holochain::prelude::*;
use library::{BookListing, UpdateBookInput};

use crate::common::*;

#[tokio::test(flavor = "multi_thread")]
async fn a_book_alice_adds_shows_up_in_bobs_library() {
    let net = setup(2).await;
    let (alice, bob) = (0, 1);

    let created: BookListing = net.call(alice, "create_book", sample_book("Frankenstein")).await;
    assert_eq!(created.owner, net.agent(alice));
    assert!(created.open_loan.is_none());

    net.sync().await;

    let all: Vec<BookListing> = net.call(bob, "get_all_books", ()).await;
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].book.title, "Frankenstein");
    assert_eq!(all[0].owner, net.agent(alice));

    let alices: Vec<BookListing> = net.call(bob, "get_books_for_owner", net.agent(alice)).await;
    assert_eq!(alices.len(), 1);
    let bobs: Vec<BookListing> = net.call(bob, "get_books_for_owner", net.agent(bob)).await;
    assert!(bobs.is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn edits_show_the_latest_version_under_the_original_hash() {
    let net = setup(2).await;
    let (alice, bob) = (0, 1);

    let created: BookListing = net.call(alice, "create_book", sample_book("Frankenstien")).await;
    let fixed: BookListing = net
        .call(
            alice,
            "update_book",
            UpdateBookInput {
                book_hash: created.book_hash.clone(),
                updated_book: sample_book("Frankenstein"),
            },
        )
        .await;
    assert_eq!(fixed.book_hash, created.book_hash);

    net.sync().await;

    let seen: Option<BookListing> = net.call(bob, "get_book", created.book_hash.clone()).await;
    assert_eq!(seen.unwrap().book.title, "Frankenstein");
    let all: Vec<BookListing> = net.call(bob, "get_all_books", ()).await;
    assert_eq!(all.len(), 1, "an edit must not create a second listing");
}

#[tokio::test(flavor = "multi_thread")]
async fn batch_import_and_delete() {
    let net = setup(1).await;
    let alice = 0;

    let created: Vec<BookListing> = net
        .call(
            alice,
            "create_books_batch",
            vec![sample_book("Dune"), sample_book("Emma"), sample_book("Ulysses")],
        )
        .await;
    assert_eq!(created.len(), 3);

    let _: ActionHash = net.call(alice, "delete_book", created[1].book_hash.clone()).await;
    let all: Vec<BookListing> = net.call(alice, "get_all_books", ()).await;
    let mut titles: Vec<_> = all.iter().map(|b| b.book.title.clone()).collect();
    titles.sort();
    assert_eq!(titles, vec!["Dune", "Ulysses"]);
}
