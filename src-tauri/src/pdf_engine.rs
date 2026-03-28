use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::SyncSender;
use std::sync::Arc;

use crossbeam_channel::Receiver;

pub const RENDER_WORKERS: usize = 4;

/// Returns the worker count for the current platform: 2 on mobile, 4 on desktop.
pub fn worker_count() -> usize {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        2
    } else {
        RENDER_WORKERS
    }
}

use image::codecs::jpeg::JpegEncoder;
use pdfium_render::prelude::*;

use crate::pdf_models::*;

/// Requests sent from IPC commands / protocol handler to the render thread.
pub enum PdfRequest {
    OpenDocument {
        path: String,
        tx: SyncSender<Result<crate::pdf_models::DocumentInfo, String>>,
    },
    CloseDocument {
        path: String,
        tx: SyncSender<Result<(), String>>,
    },
    RenderPage {
        path: String,
        page: u32,   // 1-indexed
        width: i32,  // target pixel width
        dpr: f32,    // device pixel ratio
        generation: u64,
        tx: SyncSender<Result<Vec<u8>, String>>,
    },
    GetOutline {
        path: String,
        tx: SyncSender<Result<Vec<OutlineEntry>, String>>,
    },
    GetPageLinks {
        path: String,
        page: u32,
        tx: SyncSender<Result<Vec<LinkAnnotation>, String>>,
    },
    ExtractPageText {
        path: String,
        page: u32,
        tx: SyncSender<Result<String, String>>,
    },
    SearchDocument {
        path: String,
        query: String,
        tx: SyncSender<Result<Vec<SearchResult>, String>>,
    },
    ClipPdf {
        source_path: String,
        start_page: u32, // 1-indexed
        end_page: u32,   // 1-indexed, inclusive
        output_path: String,
        tx: SyncSender<Result<(), String>>,
    },
    GetPageTextLayer {
        path: String,
        page: u32,
        tx: SyncSender<Result<PageTextLayer, String>>,
    },
}

struct PdfEngine {
    pdfium: &'static Pdfium,
    documents: HashMap<String, PdfDocument<'static>>,
    cache: SharedRenderCache,
}

impl PdfEngine {
    fn new(pdfium: &'static Pdfium, cache: SharedRenderCache) -> Self {
        Self {
            pdfium,
            documents: HashMap::new(),
            cache,
        }
    }

    /// Load document into cache if not already present.
    fn ensure_document(&mut self, path: &str) -> Result<(), String> {
        if !self.documents.contains_key(path) {
            let doc = self
                .pdfium
                .load_pdf_from_file(path, None)
                .map_err(|e| format!("Failed to load PDF '{}': {:?}", path, e))?;
            self.documents.insert(path.to_string(), doc);
        }
        Ok(())
    }

    fn open_document(&mut self, path: &str) -> Result<DocumentInfo, String> {
        self.ensure_document(path)?;
        let doc = self.documents.get(path).unwrap();
        let page_count = doc.pages().len() as u32;

        // Read first page dimensions and assume uniform (fast path).
        // PDFium page loading is expensive for per-page reads on large docs.
        let dim = if page_count > 0 {
            let page = doc
                .pages()
                .get(0)
                .map_err(|e| format!("Failed to get page 0: {:?}", e))?;
            let w = page.width().value;
            let h = page.height().value;
            PageDimension {
                width_pts: w,
                height_pts: h,
                aspect_ratio: if h > 0.0 { w / h } else { 1.0 },
            }
        } else {
            PageDimension {
                width_pts: 612.0,
                height_pts: 792.0,
                aspect_ratio: 612.0 / 792.0,
            }
        };

        Ok(DocumentInfo {
            doc_id: path.to_string(),
            page_count,
            pages: vec![dim; page_count as usize],
            title: None,
        })
    }

    fn render_page(
        &mut self,
        path: &str,
        page: u32,
        width: i32,
        dpr: f32,
    ) -> Result<Vec<u8>, String> {
        let key = RenderKey {
            path: path.to_string(),
            page,
            width,
            dpr_hundredths: (dpr * 100.0) as u32,
        };

        // Check shared cache (another thread may have missed, but render thread
        // might have since rendered it for a different caller).
        {
            let mut cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get(&key) {
                return Ok(cached.clone());
            }
        }

        self.ensure_document(path)?;

        let buf = {
            let doc = self.documents.get(path).unwrap();
            let page_index = page
                .checked_sub(1)
                .ok_or_else(|| "Page number must be >= 1".to_string())?
                as u16;
            let page_obj = doc
                .pages()
                .get(page_index)
                .map_err(|e| format!("Failed to get page {}: {:?}", page, e))?;

            let render_width = (width as f32 * dpr) as i32;
            let config = PdfRenderConfig::new().set_target_width(render_width);

            let bitmap = page_obj
                .render_with_config(&config)
                .map_err(|e| format!("Failed to render page {}: {:?}", page, e))?;

            let image = bitmap.as_image();
            let mut buf = Vec::new();
            let encoder = JpegEncoder::new_with_quality(&mut buf, 80);
            image
                .write_with_encoder(encoder)
                .map_err(|e| format!("Failed to encode JPEG: {:?}", e))?;
            buf
        };

        // Store in shared cache so the protocol handler can serve it directly
        self.cache.lock().unwrap().put(key, buf.clone());
        Ok(buf)
    }

    fn close_document(&mut self, path: &str) {
        self.documents.remove(path);
    }

    fn get_outline(&mut self, path: &str) -> Result<Vec<OutlineEntry>, String> {
        self.ensure_document(path)?;
        let doc = self.documents.get(path).unwrap();
        let bookmarks = doc.bookmarks();

        let root = match bookmarks.root() {
            Some(r) => r,
            None => return Ok(Vec::new()),
        };

        fn collect(bookmark: &PdfBookmark) -> Vec<OutlineEntry> {
            bookmark
                .iter_direct_children()
                .map(|child| {
                    let title = child.title().unwrap_or_default();
                    let page = child
                        .destination()
                        .and_then(|d| d.page_index().ok())
                        .map(|i| i as u32 + 1);
                    OutlineEntry {
                        title,
                        page,
                        children: collect(&child),
                    }
                })
                .collect()
        }

        Ok(collect(&root))
    }

    fn get_page_links(
        &mut self,
        path: &str,
        page: u32,
    ) -> Result<Vec<LinkAnnotation>, String> {
        self.ensure_document(path)?;
        let doc = self.documents.get(path).unwrap();
        let page_index = page
            .checked_sub(1)
            .ok_or_else(|| "Page number must be >= 1".to_string())?
            as u16;
        let page_obj = doc
            .pages()
            .get(page_index)
            .map_err(|e| format!("Failed to get page {}: {:?}", page, e))?;

        let page_width = page_obj.width().value;
        let page_height = page_obj.height().value;
        let links = page_obj.links();
        let mut result = Vec::new();

        for link in links.iter() {
            let rect = match link.rect() {
                Ok(r) => r,
                Err(_) => continue,
            };

            // Normalize to 0..1 coordinates (PDF Y-axis is bottom-up, convert to top-down)
            let normalized = NormalizedRect {
                x: rect.left().value / page_width,
                y: 1.0 - (rect.top().value / page_height),
                width: (rect.right().value - rect.left().value) / page_width,
                height: (rect.top().value - rect.bottom().value) / page_height,
            };

            // Try destination first (simpler), then action
            let link_type = if let Some(dest) = link.destination() {
                dest.page_index()
                    .ok()
                    .map(|idx| LinkType::Internal { page: idx as u32 + 1 })
            } else if let Some(action) = link.action() {
                extract_link_type_from_action(&action)
            } else {
                None
            };

            if let Some(lt) = link_type {
                result.push(LinkAnnotation {
                    rect: normalized,
                    link_type: lt,
                });
            }
        }

        Ok(result)
    }

    fn extract_page_text(&mut self, path: &str, page: u32) -> Result<String, String> {
        self.ensure_document(path)?;
        let doc = self.documents.get(path).unwrap();
        let page_index = page
            .checked_sub(1)
            .ok_or_else(|| "Page number must be >= 1".to_string())?
            as u16;
        let page_obj = doc
            .pages()
            .get(page_index)
            .map_err(|e| format!("Failed to get page {}: {:?}", page, e))?;
        let text = page_obj
            .text()
            .map_err(|e| format!("Failed to extract text: {:?}", e))?;
        Ok(text.all())
    }

    fn search_document(
        &mut self,
        path: &str,
        query: &str,
    ) -> Result<Vec<SearchResult>, String> {
        self.ensure_document(path)?;
        let doc = self.documents.get(path).unwrap();
        let page_count = doc.pages().len();
        let mut results = Vec::new();
        let mut match_index = 0u32;
        let lower_query = query.to_lowercase();

        for i in 0..page_count {
            let page_obj = doc
                .pages()
                .get(i)
                .map_err(|e| format!("Failed to get page {}: {:?}", i + 1, e))?;
            let text = page_obj
                .text()
                .map_err(|e| format!("Failed to extract text from page {}: {:?}", i + 1, e))?;
            let page_text = text.all().to_lowercase();

            let mut start = 0;
            while let Some(idx) = page_text[start..].find(&lower_query) {
                let _abs_idx = start + idx;
                results.push(SearchResult {
                    page: i as u32 + 1,
                    match_index,
                    rects: Vec::new(), // TODO: character-level bounding boxes
                });
                match_index += 1;
                start += idx + 1;
            }
        }

        Ok(results)
    }

    fn get_page_text_layer(
        &mut self,
        path: &str,
        page: u32,
    ) -> Result<PageTextLayer, String> {
        self.ensure_document(path)?;
        let doc = self.documents.get(path).unwrap();
        let page_index = page
            .checked_sub(1)
            .ok_or_else(|| "Page number must be >= 1".to_string())?
            as u16;
        let page_obj = doc
            .pages()
            .get(page_index)
            .map_err(|e| format!("Failed to get page {}: {:?}", page, e))?;

        let page_width = page_obj.width().value;
        let page_height = page_obj.height().value;
        let text = page_obj
            .text()
            .map_err(|e| format!("Failed to extract text: {:?}", e))?;

        let mut spans: Vec<TextSpan> = Vec::new();
        let mut current_text = String::new();
        let mut current_char_rects: Vec<NormalizedRect> = Vec::new();
        let mut prev_y: Option<f32> = None;
        let mut prev_right: Option<f32> = None;
        let mut prev_char_height: f32 = 0.0;
        let mut prev_char_width: f32 = 0.0;

        let finalize_span = |text: &mut String, char_rects: &mut Vec<NormalizedRect>, spans: &mut Vec<TextSpan>| {
            if text.is_empty() || char_rects.is_empty() {
                text.clear();
                char_rects.clear();
                return;
            }
            let mut min_x = f32::MAX;
            let mut min_y = f32::MAX;
            let mut max_x = f32::MIN;
            let mut max_y = f32::MIN;
            for r in char_rects.iter() {
                min_x = min_x.min(r.x);
                min_y = min_y.min(r.y);
                max_x = max_x.max(r.x + r.width);
                max_y = max_y.max(r.y + r.height);
            }
            spans.push(TextSpan {
                text: text.clone(),
                rect: NormalizedRect {
                    x: min_x,
                    y: min_y,
                    width: max_x - min_x,
                    height: max_y - min_y,
                },
                char_rects: char_rects.clone(),
            });
            text.clear();
            char_rects.clear();
        };

        for ch in text.chars().iter() {
            let c = match ch.unicode_char() {
                Some(c) => c,
                None => continue,
            };
            let bounds = match ch.loose_bounds() {
                Ok(b) => b,
                Err(_) => {
                    // Non-renderable char (e.g. control char) — treat as word break
                    if c == '\n' || c == '\r' {
                        finalize_span(&mut current_text, &mut current_char_rects, &mut spans);
                        prev_y = None;
                        prev_right = None;
                    }
                    continue;
                }
            };

            let left = bounds.left().value;
            let right = bounds.right().value;
            let top = bounds.top().value;
            let bottom = bounds.bottom().value;
            let char_width = (right - left).abs();
            let char_height = (top - bottom).abs();

            if char_width < 0.001 && char_height < 0.001 {
                continue;
            }

            // Normalized coordinates (PDF Y is bottom-up, flip to top-down)
            let norm_x = left / page_width;
            let norm_y = 1.0 - (top / page_height);
            let norm_w = char_width / page_width;
            let norm_h = char_height / page_height;

            let center_y = (top + bottom) / 2.0;

            // Check for line break (Y-gap > 0.5x font size)
            let is_new_line = if let Some(py) = prev_y {
                (center_y - py).abs() > prev_char_height * 0.5
            } else {
                false
            };

            // Check for word gap (X-gap > 1.5x char width)
            let is_word_gap = if let Some(pr) = prev_right {
                !is_new_line && (left - pr) > prev_char_width * 1.5
            } else {
                false
            };

            if is_new_line {
                finalize_span(&mut current_text, &mut current_char_rects, &mut spans);
            } else if is_word_gap {
                finalize_span(&mut current_text, &mut current_char_rects, &mut spans);
            }

            current_text.push(c);
            current_char_rects.push(NormalizedRect {
                x: norm_x,
                y: norm_y,
                width: norm_w,
                height: norm_h,
            });

            prev_y = Some(center_y);
            prev_right = Some(right);
            prev_char_height = char_height;
            prev_char_width = char_width;
        }

        finalize_span(&mut current_text, &mut current_char_rects, &mut spans);

        Ok(PageTextLayer { page, spans })
    }

    fn clip_pdf(
        &mut self,
        source_path: &str,
        start_page: u32,
        end_page: u32,
        output_path: &str,
    ) -> Result<(), String> {
        self.ensure_document(source_path)?;
        let source_doc = self.documents.get(source_path).unwrap();
        let page_count = source_doc.pages().len() as u32;

        if start_page < 1 || start_page > page_count || end_page < start_page || end_page > page_count {
            return Err(format!(
                "Invalid page range {}-{} (document has {} pages)",
                start_page, end_page, page_count
            ));
        }

        let mut new_doc = self.pdfium.create_new_pdf()
            .map_err(|e| format!("Failed to create new PDF: {:?}", e))?;

        for (dest_idx, page_num) in (start_page..=end_page).enumerate() {
            let page_index = (page_num - 1) as u16;

            new_doc.pages_mut()
                .copy_page_from_document(&source_doc, page_index, dest_idx as u16)
                .map_err(|e| format!("Failed to copy page {}: {:?}", page_num, e))?;
        }

        new_doc.save_to_file(output_path)
            .map_err(|e| format!("Failed to save clipped PDF: {:?}", e))?;

        Ok(())
    }
}

fn extract_link_type_from_action(action: &PdfAction) -> Option<LinkType> {
    match action.action_type() {
        PdfActionType::Uri => action
            .as_uri_action()
            .and_then(|a| a.uri().ok())
            .map(|url| LinkType::External { url }),
        PdfActionType::GoToDestinationInSameDocument => action
            .as_local_destination_action()
            .and_then(|a| a.destination().ok())
            .and_then(|d| d.page_index().ok())
            .map(|idx| LinkType::Internal { page: idx as u32 + 1 }),
        _ => None,
    }
}

/// Spawn a pool of render workers sharing a single crossbeam receiver.
/// Each worker binds its own `Pdfium` instance — `Pdfium` is `!Send + !Sync`,
/// so sharing a single instance across threads is unsound.
pub fn run_pool(
    rx: Receiver<PdfRequest>,
    lib_path: std::path::PathBuf,
    generation: Arc<AtomicU64>,
    cache: SharedRenderCache,
    worker_count: usize,
) -> Vec<std::thread::JoinHandle<()>> {
    (0..worker_count)
        .map(|i| {
            let rx = rx.clone();
            let gen = Arc::clone(&generation);
            let cache = Arc::clone(&cache);
            let lib_path = lib_path.clone();
            std::thread::Builder::new()
                .name(format!("pdf-render-{}", i))
                .spawn(move || {
                    let bindings = Pdfium::bind_to_library(&lib_path)
                        .unwrap_or_else(|e| {
                            panic!("pdf-render-{}: failed to bind PDFium: {:?}", i, e)
                        });
                    let pdfium: &'static Pdfium =
                        Box::leak(Box::new(Pdfium::new(bindings)));
                    run(rx, pdfium, gen, cache);
                })
                .expect("failed to spawn pdf render worker")
        })
        .collect()
}

/// Main loop for the PDF render thread. Runs until the channel is closed.
pub fn run(rx: Receiver<PdfRequest>, pdfium: &'static Pdfium, generation: Arc<AtomicU64>, cache: SharedRenderCache) {
    let mut engine = PdfEngine::new(pdfium, cache);

    while let Ok(request) = rx.recv() {
        match request {
            PdfRequest::OpenDocument { path, tx } => {
                let _ = tx.send(engine.open_document(&path));
            }
            // Renders check the generation counter — if a newer open_document has
            // been submitted, this render is stale and can be skipped instantly.
            PdfRequest::RenderPage {
                path,
                page,
                width,
                dpr,
                generation: req_gen,
                tx,
            } => {
                if req_gen < generation.load(Ordering::Relaxed) {
                    let _ = tx.send(Err("preempted".to_string()));
                } else {
                    let _ = tx.send(engine.render_page(&path, page, width, dpr));
                }
            }
            PdfRequest::CloseDocument { path, tx } => {
                engine.close_document(&path);
                let _ = tx.send(Ok(()));
            }
            PdfRequest::GetOutline { path, tx } => {
                let _ = tx.send(engine.get_outline(&path));
            }
            PdfRequest::GetPageLinks { path, page, tx } => {
                let _ = tx.send(engine.get_page_links(&path, page));
            }
            PdfRequest::ExtractPageText { path, page, tx } => {
                let _ = tx.send(engine.extract_page_text(&path, page));
            }
            PdfRequest::SearchDocument { path, query, tx } => {
                let _ = tx.send(engine.search_document(&path, &query));
            }
            PdfRequest::ClipPdf {
                source_path,
                start_page,
                end_page,
                output_path,
                tx,
            } => {
                let _ = tx.send(engine.clip_pdf(&source_path, start_page, end_page, &output_path));
            }
            PdfRequest::GetPageTextLayer { path, page, tx } => {
                let _ = tx.send(engine.get_page_text_layer(&path, page));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn test_render_workers_constant() {
        assert_eq!(RENDER_WORKERS, 4);
    }

    #[test]
    fn test_worker_count_desktop() {
        // On desktop (Linux/macOS/Windows test runner), worker_count returns 4
        assert_eq!(worker_count(), 4);
    }

    #[test]
    fn test_pool_processes_all_requests() {
        let (tx, rx) = crossbeam_channel::unbounded::<PdfRequest>();
        let generation = Arc::new(AtomicU64::new(1));

        let handles: Vec<_> = (0..RENDER_WORKERS)
            .map(|_| {
                let rx = rx.clone();
                let gen = Arc::clone(&generation);
                std::thread::spawn(move || {
                    while let Ok(request) = rx.recv() {
                        if let PdfRequest::RenderPage {
                            generation: req_gen,
                            tx,
                            ..
                        } = request
                        {
                            if req_gen < gen.load(Ordering::Relaxed) {
                                let _ = tx.send(Err("preempted".into()));
                            } else {
                                let _ = tx.send(Ok(vec![0xFF, 0xD8]));
                            }
                        }
                    }
                })
            })
            .collect();

        let mut receivers = Vec::new();
        for page in 1..=20 {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::RenderPage {
                path: "test.pdf".into(),
                page,
                width: 800,
                dpr: 1.0,
                generation: 1,
                tx: reply_tx,
            })
            .unwrap();
            receivers.push(reply_rx);
        }
        drop(tx);

        for rx in &receivers {
            assert!(rx.recv().unwrap().is_ok());
        }
        for h in handles {
            h.join().unwrap();
        }
    }

    #[test]
    fn test_pool_generation_preemption_across_workers() {
        let (tx, rx) = crossbeam_channel::unbounded::<PdfRequest>();
        let generation = Arc::new(AtomicU64::new(1));

        let handles: Vec<_> = (0..RENDER_WORKERS)
            .map(|_| {
                let rx = rx.clone();
                let gen = Arc::clone(&generation);
                std::thread::spawn(move || {
                    while let Ok(request) = rx.recv() {
                        if let PdfRequest::RenderPage {
                            generation: req_gen,
                            tx,
                            ..
                        } = request
                        {
                            // Simulate render time so stale requests accumulate
                            std::thread::sleep(std::time::Duration::from_millis(5));
                            if req_gen < gen.load(Ordering::Relaxed) {
                                let _ = tx.send(Err("preempted".into()));
                            } else {
                                let _ = tx.send(Ok(vec![0xFF, 0xD8]));
                            }
                        }
                    }
                })
            })
            .collect();

        // Send 10 requests at gen=1
        let mut gen1_rxs = Vec::new();
        for page in 1..=10 {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::RenderPage {
                path: "test.pdf".into(),
                page,
                width: 800,
                dpr: 1.0,
                generation: 1,
                tx: reply_tx,
            })
            .unwrap();
            gen1_rxs.push(reply_rx);
        }

        // Bump generation
        generation.store(2, Ordering::Relaxed);

        // Send 10 requests at gen=2
        let mut gen2_rxs = Vec::new();
        for page in 11..=20 {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::RenderPage {
                path: "test.pdf".into(),
                page,
                width: 800,
                dpr: 1.0,
                generation: 2,
                tx: reply_tx,
            })
            .unwrap();
            gen2_rxs.push(reply_rx);
        }
        drop(tx);

        // Gen=1 requests: some may succeed (if processed before bump), some preempted
        let preempted_count = gen1_rxs
            .iter()
            .filter(|rx| rx.recv().unwrap().is_err())
            .count();
        assert!(
            preempted_count > 0,
            "at least some gen=1 requests should be preempted"
        );

        // Gen=2 requests: all should succeed
        for rx in &gen2_rxs {
            assert!(rx.recv().unwrap().is_ok());
        }
        for h in handles {
            h.join().unwrap();
        }
    }

    /// CRITICAL regression test: prerender_pages reads the current generation but
    /// must NOT bump it. If it did, concurrent thumbnail loads would preempt each
    /// other, breaking thumbnails.
    #[test]
    fn test_prerender_reads_generation_without_bumping() {
        let (tx, rx) = crossbeam_channel::unbounded::<PdfRequest>();
        let generation = Arc::new(AtomicU64::new(5));

        let handles: Vec<_> = (0..RENDER_WORKERS)
            .map(|_| {
                let rx = rx.clone();
                let gen = Arc::clone(&generation);
                std::thread::spawn(move || {
                    while let Ok(request) = rx.recv() {
                        if let PdfRequest::RenderPage {
                            generation: req_gen,
                            tx,
                            ..
                        } = request
                        {
                            if req_gen < gen.load(Ordering::Relaxed) {
                                let _ = tx.send(Err("preempted".into()));
                            } else {
                                let _ = tx.send(Ok(vec![0xFF, 0xD8]));
                            }
                        }
                    }
                })
            })
            .collect();

        // Send 10 RenderPage requests all with gen=5 (simulating prerender_pages)
        let mut receivers = Vec::new();
        for page in 1..=10 {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::RenderPage {
                path: "test.pdf".into(),
                page,
                width: 200,
                dpr: 1.0,
                generation: 5,
                tx: reply_tx,
            })
            .unwrap();
            receivers.push(reply_rx);
        }
        drop(tx);

        // All 10 must succeed (gen=5 == current=5, no preemption)
        for rx in &receivers {
            assert!(rx.recv().unwrap().is_ok(), "request should not be preempted");
        }

        // Generation must STILL be 5 — proves no bump happened
        assert_eq!(generation.load(Ordering::Relaxed), 5);

        for h in handles {
            h.join().unwrap();
        }
    }

    /// CRITICAL regression test: 3 concurrent thumbnail loads (batches of
    /// RenderPage requests) must not preempt each other. Generation stays at 0
    /// throughout, so all requests with gen=0 succeed.
    #[test]
    fn test_concurrent_prerenders_no_mutual_preemption() {
        let (tx, rx) = crossbeam_channel::unbounded::<PdfRequest>();
        let generation = Arc::new(AtomicU64::new(0));

        let handles: Vec<_> = (0..RENDER_WORKERS)
            .map(|_| {
                let rx = rx.clone();
                let gen = Arc::clone(&generation);
                std::thread::spawn(move || {
                    while let Ok(request) = rx.recv() {
                        if let PdfRequest::RenderPage {
                            generation: req_gen,
                            tx,
                            ..
                        } = request
                        {
                            std::thread::sleep(std::time::Duration::from_millis(2));
                            if req_gen < gen.load(Ordering::Relaxed) {
                                let _ = tx.send(Err("preempted".into()));
                            } else {
                                let _ = tx.send(Ok(vec![0xFF, 0xD8]));
                            }
                        }
                    }
                })
            })
            .collect();

        // 3 concurrent thumbnail loads, each requesting 5 pages
        let mut all_receivers = Vec::new();
        for batch in 0..3 {
            for page_offset in 1..=5 {
                let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
                tx.send(PdfRequest::RenderPage {
                    path: format!("book{}.pdf", batch),
                    page: page_offset,
                    width: 200,
                    dpr: 1.0,
                    generation: 0,
                    tx: reply_tx,
                })
                .unwrap();
                all_receivers.push(reply_rx);
            }
        }
        drop(tx);

        // All 15 must succeed — none preempted by each other
        for (i, rx) in all_receivers.iter().enumerate() {
            assert!(
                rx.recv().unwrap().is_ok(),
                "request {} should not be preempted",
                i
            );
        }

        // Generation unchanged
        assert_eq!(generation.load(Ordering::Relaxed), 0);

        for h in handles {
            h.join().unwrap();
        }
    }

    #[test]
    fn test_open_document_preempts_stale_renders() {
        let (tx, rx) = crossbeam_channel::unbounded::<PdfRequest>();
        let generation = Arc::new(AtomicU64::new(0));

        let handles: Vec<_> = (0..RENDER_WORKERS)
            .map(|_| {
                let rx = rx.clone();
                let gen = Arc::clone(&generation);
                std::thread::spawn(move || {
                    while let Ok(request) = rx.recv() {
                        if let PdfRequest::RenderPage {
                            generation: req_gen,
                            tx,
                            ..
                        } = request
                        {
                            if req_gen < gen.load(Ordering::Relaxed) {
                                let _ = tx.send(Err("preempted".into()));
                            } else {
                                let _ = tx.send(Ok(vec![0xFF, 0xD8]));
                            }
                        }
                    }
                })
            })
            .collect();

        // Render at gen=0 succeeds
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::RenderPage {
                path: "test.pdf".into(),
                page: 1,
                width: 800,
                dpr: 1.0,
                generation: 0,
                tx: reply_tx,
            })
            .unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }

        // Bump generation (simulating open_document)
        generation.store(1, Ordering::Relaxed);

        // Stale render at gen=0 → preempted
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::RenderPage {
                path: "test.pdf".into(),
                page: 2,
                width: 800,
                dpr: 1.0,
                generation: 0,
                tx: reply_tx,
            })
            .unwrap();
            let result = reply_rx.recv().unwrap();
            assert!(result.is_err());
            assert_eq!(result.unwrap_err(), "preempted");
        }

        // Fresh render at gen=1 → succeeds
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::RenderPage {
                path: "test.pdf".into(),
                page: 2,
                width: 800,
                dpr: 1.0,
                generation: 1,
                tx: reply_tx,
            })
            .unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }

        drop(tx);
        for h in handles {
            h.join().unwrap();
        }
    }

    #[test]
    fn test_cache_populated_after_render() {
        let (tx, rx) = crossbeam_channel::unbounded::<PdfRequest>();
        let generation = Arc::new(AtomicU64::new(0));
        let cache = crate::pdf_models::new_shared_render_cache();

        // Spawn workers that populate the shared cache after "rendering"
        let handles: Vec<_> = (0..2)
            .map(|_| {
                let rx = rx.clone();
                let gen = Arc::clone(&generation);
                let cache = Arc::clone(&cache);
                std::thread::spawn(move || {
                    while let Ok(request) = rx.recv() {
                        if let PdfRequest::RenderPage {
                            path,
                            page,
                            width,
                            dpr,
                            generation: req_gen,
                            tx,
                            ..
                        } = request
                        {
                            if req_gen < gen.load(Ordering::Relaxed) {
                                let _ = tx.send(Err("preempted".into()));
                            } else {
                                let jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0];
                                let key = RenderKey {
                                    path,
                                    page,
                                    width,
                                    dpr_hundredths: (dpr * 100.0) as u32,
                                };
                                cache.lock().unwrap().put(key, jpeg.clone());
                                let _ = tx.send(Ok(jpeg));
                            }
                        }
                    }
                })
            })
            .collect();

        let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
        tx.send(PdfRequest::RenderPage {
            path: "doc.pdf".into(),
            page: 3,
            width: 600,
            dpr: 2.0,
            generation: 0,
            tx: reply_tx,
        })
        .unwrap();

        let result = reply_rx.recv().unwrap();
        assert!(result.is_ok());

        // Verify cache contains the entry
        let expected_key = RenderKey {
            path: "doc.pdf".into(),
            page: 3,
            width: 600,
            dpr_hundredths: 200,
        };
        let cached = cache.lock().unwrap().get(&expected_key).cloned();
        assert!(cached.is_some());
        assert_eq!(cached.unwrap(), vec![0xFF, 0xD8, 0xFF, 0xE0]);

        drop(tx);
        for h in handles {
            h.join().unwrap();
        }
    }

    #[test]
    fn test_all_request_types_dispatched() {
        let (tx, rx) = crossbeam_channel::unbounded::<PdfRequest>();

        let handle = std::thread::spawn(move || {
            while let Ok(request) = rx.recv() {
                match request {
                    PdfRequest::OpenDocument { tx, .. } => {
                        let _ = tx.send(Ok(DocumentInfo {
                            doc_id: "test".into(),
                            page_count: 1,
                            pages: vec![PageDimension {
                                width_pts: 612.0,
                                height_pts: 792.0,
                                aspect_ratio: 612.0 / 792.0,
                            }],
                            title: None,
                        }));
                    }
                    PdfRequest::CloseDocument { tx, .. } => {
                        let _ = tx.send(Ok(()));
                    }
                    PdfRequest::RenderPage { tx, .. } => {
                        let _ = tx.send(Ok(vec![0xFF]));
                    }
                    PdfRequest::GetOutline { tx, .. } => {
                        let _ = tx.send(Ok(vec![]));
                    }
                    PdfRequest::GetPageLinks { tx, .. } => {
                        let _ = tx.send(Ok(vec![]));
                    }
                    PdfRequest::ExtractPageText { tx, .. } => {
                        let _ = tx.send(Ok("text".into()));
                    }
                    PdfRequest::SearchDocument { tx, .. } => {
                        let _ = tx.send(Ok(vec![]));
                    }
                    PdfRequest::ClipPdf { tx, .. } => {
                        let _ = tx.send(Ok(()));
                    }
                    PdfRequest::GetPageTextLayer { tx, .. } => {
                        let _ = tx.send(Ok(PageTextLayer {
                            page: 1,
                            spans: vec![],
                        }));
                    }
                }
            }
        });

        // OpenDocument
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::OpenDocument { path: "t.pdf".into(), tx: reply_tx }).unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }
        // CloseDocument
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::CloseDocument { path: "t.pdf".into(), tx: reply_tx }).unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }
        // RenderPage
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::RenderPage {
                path: "t.pdf".into(), page: 1, width: 800, dpr: 1.0, generation: 0, tx: reply_tx,
            }).unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }
        // GetOutline
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::GetOutline { path: "t.pdf".into(), tx: reply_tx }).unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }
        // GetPageLinks
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::GetPageLinks { path: "t.pdf".into(), page: 1, tx: reply_tx }).unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }
        // ExtractPageText
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::ExtractPageText { path: "t.pdf".into(), page: 1, tx: reply_tx }).unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }
        // SearchDocument
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::SearchDocument { path: "t.pdf".into(), query: "q".into(), tx: reply_tx }).unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }
        // ClipPdf
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::ClipPdf {
                source_path: "t.pdf".into(), start_page: 1, end_page: 1, output_path: "o.pdf".into(), tx: reply_tx,
            }).unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }
        // GetPageTextLayer
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::GetPageTextLayer { path: "t.pdf".into(), page: 1, tx: reply_tx }).unwrap();
            assert!(reply_rx.recv().unwrap().is_ok());
        }

        drop(tx);
        handle.join().unwrap();
    }

    #[test]
    fn test_sender_disconnect_detected() {
        let (tx, rx) = crossbeam_channel::unbounded::<PdfRequest>();

        let handles: Vec<_> = (0..RENDER_WORKERS)
            .map(|_| {
                let rx = rx.clone();
                std::thread::spawn(move || {
                    // Workers exit cleanly when sender disconnects
                    while let Ok(_request) = rx.recv() {}
                })
            })
            .collect();

        // Drop the sender — workers' rx.recv() returns Err → threads exit
        drop(tx);

        // All worker JoinHandles must complete
        for h in handles {
            h.join().expect("worker thread should exit cleanly on sender disconnect");
        }
    }

    #[test]
    fn test_pool_distributes_across_workers() {
        let (tx, rx) = crossbeam_channel::unbounded::<PdfRequest>();
        let generation = Arc::new(AtomicU64::new(1));
        let worker_ids = Arc::new(Mutex::new(std::collections::HashSet::new()));

        let handles: Vec<_> = (0..RENDER_WORKERS)
            .map(|_| {
                let rx = rx.clone();
                let gen = Arc::clone(&generation);
                let ids = Arc::clone(&worker_ids);
                std::thread::spawn(move || {
                    while let Ok(request) = rx.recv() {
                        if let PdfRequest::RenderPage {
                            generation: req_gen,
                            tx,
                            ..
                        } = request
                        {
                            ids.lock().unwrap().insert(std::thread::current().id());
                            std::thread::sleep(std::time::Duration::from_millis(5));
                            if req_gen < gen.load(Ordering::Relaxed) {
                                let _ = tx.send(Err("preempted".into()));
                            } else {
                                let _ = tx.send(Ok(vec![0xFF, 0xD8]));
                            }
                        }
                    }
                })
            })
            .collect();

        for page in 1..=20 {
            let (reply_tx, _) = std::sync::mpsc::sync_channel(1);
            tx.send(PdfRequest::RenderPage {
                path: "test.pdf".into(),
                page,
                width: 800,
                dpr: 1.0,
                generation: 1,
                tx: reply_tx,
            })
            .unwrap();
        }
        drop(tx);

        for h in handles {
            h.join().unwrap();
        }
        let unique_workers = worker_ids.lock().unwrap().len();
        assert!(
            unique_workers > 1,
            "expected multiple workers, got {}",
            unique_workers
        );
    }
}
