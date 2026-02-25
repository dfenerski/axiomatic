use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookTagMapping {
    pub book_slug: String,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub id: i64,
    pub slug: String,
    pub page: i64,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub color: String,
    pub note: String,
    pub text: String,
    pub group_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snip {
    pub id: i64,
    pub slug: String,
    pub full_path: String,
    pub page: i64,
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub created_at: String,
}

impl BookTagMapping {
    pub fn group_from_rows(rows: Vec<(String, i64, String, String)>) -> Vec<BookTagMapping> {
        let mut map: HashMap<String, Vec<Tag>> = HashMap::new();
        for (slug, id, name, color) in rows {
            map.entry(slug).or_default().push(Tag { id, name, color });
        }
        map.into_iter()
            .map(|(book_slug, tags)| BookTagMapping { book_slug, tags })
            .collect()
    }
}
