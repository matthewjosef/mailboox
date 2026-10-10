use hdi::prelude::*;

/// How a book got into someone's library.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum BookSource {
    Manual,
    Scan,
    Import,
}

/// A physical book on someone's shelf. The owner is the author of the action
/// that created it, so it is not stored in the entry.
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Book {
    pub title: String,
    pub authors: Vec<String>,
    pub isbn: Option<String>,
    pub open_library_key: Option<String>,
    pub cover_url: Option<String>,
    pub genre: Option<String>,
    pub blurb: Option<String>,
    pub source: BookSource,
}

/// A named group of books, e.g. "Kids' shelf".
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Collection {
    pub name: String,
}

const MAX_TITLE_LEN: usize = 500;

pub fn validate_book(book: &Book) -> ExternResult<ValidateCallbackResult> {
    let title = book.title.trim();
    if title.is_empty() {
        return Ok(ValidateCallbackResult::Invalid("A book needs a title".into()));
    }
    if title.chars().count() > MAX_TITLE_LEN {
        return Ok(ValidateCallbackResult::Invalid(format!(
            "Book titles can be at most {MAX_TITLE_LEN} characters"
        )));
    }
    if book.authors.iter().any(|a| a.trim().is_empty()) {
        return Ok(ValidateCallbackResult::Invalid("Author names can't be blank".into()));
    }
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_collection(collection: &Collection) -> ExternResult<ValidateCallbackResult> {
    if collection.name.trim().is_empty() {
        return Ok(ValidateCallbackResult::Invalid("A collection needs a name".into()));
    }
    Ok(ValidateCallbackResult::Valid)
}
