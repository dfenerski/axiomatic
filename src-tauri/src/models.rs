use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Directory {
    pub id: i64,
    pub path: String,
    pub label: String,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Textbook {
    pub slug: String,
    pub title: String,
    pub file: String,
    pub dir_id: i64,
    pub dir_path: String,
    pub full_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteRecord {
    pub id: i64,
    pub slug: String,
    pub page: i64,
    pub content: String,
    pub format: String,
    pub updated_at: String,
}
