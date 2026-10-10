use std::path::Path;
use std::time::Duration;

use holochain::prelude::*;
use holochain::sweettest::*;
use library::Signal as LibrarySignal;
use library_integrity::{Book, BookSource};
use tokio::sync::broadcast::Receiver;

pub const APP_ID: &str = "mailboox";
pub const ZOME: &str = "library";

pub struct Network {
    pub conductors: SweetConductorBatch,
    pub cells: Vec<SweetCell>,
}

impl Network {
    pub fn zome(&self, i: usize) -> SweetZome {
        self.cells[i].zome(ZOME)
    }

    pub fn agent(&self, i: usize) -> AgentPubKey {
        self.cells[i].agent_pubkey().clone()
    }

    pub async fn call<I, O>(&self, i: usize, fn_name: &str, payload: I) -> O
    where
        I: serde::Serialize + std::fmt::Debug,
        O: serde::de::DeserializeOwned + std::fmt::Debug,
    {
        self.conductors[i].call(&self.zome(i), fn_name, payload).await
    }

    pub async fn call_err<I>(&self, i: usize, fn_name: &str, payload: I) -> String
    where
        I: serde::Serialize + std::fmt::Debug,
    {
        let result: Result<ExternIO, _> = self.conductors[i]
            .call_fallible(&self.zome(i), fn_name, payload)
            .await;
        match result {
            Ok(_) => panic!("expected `{fn_name}` to fail, but it succeeded"),
            Err(e) => format!("{e:?}"),
        }
    }

    pub async fn sync(&self) {
        await_consistency(&self.cells).await.unwrap();
    }

    /// For after a conductor restart, which can take a while to reconnect on slow CI machines.
    pub async fn sync_after_restart(&self) {
        await_consistency_s(240, &self.cells).await.unwrap();
    }

    pub fn signals(&self, i: usize) -> Receiver<Signal> {
        self.conductors[i].subscribe_to_app_signals(APP_ID.to_string())
    }
}

/// Start `n` conductors, each running one agent with the library DNA, connected to each other.
pub async fn setup(n: usize) -> Network {
    let dna_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../workdir/library.dna");
    let dna = SweetDnaFile::from_bundle(&dna_path)
        .await
        .expect("Build the DNA first with `npm run build:happ`");
    let mut conductors = SweetConductorBatch::standard(n).await;
    let apps = conductors.setup_app(APP_ID, &[dna]).await.unwrap();
    conductors.exchange_peer_info().await;
    let cells = apps.cells_flattened();
    Network { conductors, cells }
}

pub fn sample_book(title: &str) -> Book {
    Book {
        title: title.to_string(),
        authors: vec!["Mary Shelley".to_string()],
        isbn: None,
        open_library_key: None,
        cover_url: None,
        genre: Some("Fiction".to_string()),
        blurb: None,
        source: BookSource::Manual,
    }
}

/// Wait for the next library signal matching `pred`, skipping others (e.g. local refresh signals).
pub async fn expect_signal(
    rx: &mut Receiver<Signal>,
    pred: impl Fn(&LibrarySignal) -> bool,
) -> LibrarySignal {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        let signal = tokio::time::timeout(remaining, rx.recv())
            .await
            .expect("timed out waiting for signal")
            .expect("signal channel closed");
        if let Signal::App { signal, .. } = signal {
            if let Ok(decoded) = signal.into_inner().decode::<LibrarySignal>() {
                if pred(&decoded) {
                    return decoded;
                }
            }
        }
    }
}
