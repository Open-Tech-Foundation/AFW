//! Internal static HTML search indexer for `@opentf/afw-docs`.
//! See packages/afw-docs/search/SPEC-FORMAT.md for the writer/reader contract.

use rayon::prelude::*;
use regex::Regex;
use scraper::{ElementRef, Html, Selector};
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};
use walkdir::WalkDir;

pub(super) fn run(args: &[String]) -> ExitCode {
    match args.first().map(String::as_str) {
        Some("--help" | "-h") => {
            println!("usage: afwc docs index <site-dir> [--out <index-dir>] [--root <selector>]");
            println!("       afwc docs inspect <index-dir> --term <term>");
            println!("       afwc docs query <index-dir> <query>");
            ExitCode::SUCCESS
        }
        Some("index") => index_cmd(args),
        Some("inspect") => inspect_cmd(args),
        Some("query") => query_cmd(args),
        _ => {
            eprintln!("usage: afwc docs <index|inspect|query> …");
            ExitCode::FAILURE
        }
    }
}

fn index_cmd(args: &[String]) -> ExitCode {
    let Some(site) = args.get(1) else {
        eprintln!("afwc docs: missing export directory");
        return ExitCode::FAILURE;
    };
    let mut out = PathBuf::from(site).join("_search");
    let mut root = "main".to_string();
    let mut i = 2;
    while i < args.len() {
        match args[i].as_str() {
            "--out" => {
                i += 1;
                let Some(value) = args.get(i).filter(|value| !value.starts_with("--")) else {
                    eprintln!("afwc docs: --out requires an index directory");
                    return ExitCode::FAILURE;
                };
                out = PathBuf::from(value);
            }
            "--root" => {
                i += 1;
                let Some(value) = args.get(i).filter(|value| !value.starts_with("--")) else {
                    eprintln!("afwc docs: --root requires a selector");
                    return ExitCode::FAILURE;
                };
                root = value.clone();
            }
            flag => {
                eprintln!("afwc docs: unknown option {flag}");
                return ExitCode::FAILURE;
            }
        }
        i += 1;
    }
    match build(Path::new(site), &out, &root) {
        Ok(count) => {
            eprintln!("afwc docs: indexed {count} page(s) → {}", out.display());
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("afwc docs: {error}");
            ExitCode::FAILURE
        }
    }
}

fn read_index(dir: &str) -> Result<Value, String> {
    let dir = Path::new(dir);
    let manifest: Value =
        serde_json::from_slice(&fs::read(dir.join("manifest.json")).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if manifest["v"] != 1 {
        return Err("Unsupported search index version".into());
    }
    let mut terms = serde_json::Map::new();
    for chunk in manifest["chunks"].as_array().ok_or("Missing term chunks")? {
        let bytes = fs::read(dir.join(chunk["file"].as_str().ok_or("Missing chunk filename")?))
            .map_err(|e| e.to_string())?;
        terms.extend(decode_term_chunk(&bytes)?);
    }
    let mut docs = Vec::new();
    let fragments = manifest["fragmentsDir"].as_str().unwrap_or("f");
    for id in 0..manifest["docs"].as_u64().ok_or("Missing document count")? {
        let bytes =
            fs::read(dir.join(fragments).join(format!("{id}.json"))).map_err(|e| e.to_string())?;
        docs.push(serde_json::from_slice::<Value>(&bytes).map_err(|e| e.to_string())?);
    }
    Ok(json!({"terms": terms, "docs": docs}))
}

fn inspect_cmd(args: &[String]) -> ExitCode {
    let (Some(dir), Some(flag), Some(term)) = (args.get(1), args.get(2), args.get(3)) else {
        eprintln!("usage: afwc docs inspect <index-dir> --term <term>");
        return ExitCode::FAILURE;
    };
    if flag != "--term" {
        eprintln!("usage: afwc docs inspect <index-dir> --term <term>");
        return ExitCode::FAILURE;
    }
    // Look the term up as indexing would have written it (NFKC, lowercase).
    let key = word_groups(term)
        .first()
        .and_then(|group| group.first().cloned())
        .unwrap_or_else(|| term.to_lowercase());
    match read_index(dir).map(|index| index["terms"][key.as_str()].clone()) {
        Ok(Value::Null) => {
            println!(
                "{{\"term\":{},\"df\":0,\"postings\":[]}}",
                serde_json::to_string(term).unwrap()
            );
            ExitCode::SUCCESS
        }
        Ok(postings) => {
            println!(
                "{{\"term\":{},\"df\":{},\"postings\":{}}}",
                serde_json::to_string(term).unwrap(),
                postings.as_array().map_or(0, Vec::len),
                postings
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("afwc docs: {error}");
            ExitCode::FAILURE
        }
    }
}

fn query_cmd(args: &[String]) -> ExitCode {
    let (Some(dir), Some(query)) = (args.get(1), args.get(2)) else {
        eprintln!("usage: afwc docs query <index-dir> <query>");
        return ExitCode::FAILURE;
    };
    let index = match read_index(dir) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("afwc docs: {error}");
            return ExitCode::FAILURE;
        }
    };
    let mut scores: BTreeMap<usize, u64> = BTreeMap::new();
    for term in tokens(query) {
        for posting in index["terms"][term.as_str()]
            .as_array()
            .into_iter()
            .flatten()
        {
            if let (Some(doc), Some(tf)) = (posting[0].as_u64(), posting[1].as_u64()) {
                *scores.entry(doc as usize).or_default() += tf;
            }
        }
    }
    let mut ranked: Vec<_> = scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let results: Vec<_> = ranked.into_iter().take(10).filter_map(|(doc, score)| index["docs"].get(doc).map(|fragment| json!({"url": fragment["url"], "title": fragment["title"], "score": score}))).collect();
    println!("{}", json!({"results": results}));
    ExitCode::SUCCESS
}

/// The selectors every page is read with, compiled once.
struct Selectors {
    root: Selector,
    marked: Selector,
    meta: Selector,
    title: Selector,
}

impl Selectors {
    fn new(root: &str) -> Result<Self, String> {
        Ok(Selectors {
            root: Selector::parse(root).map_err(|e| format!("Invalid search root selector: {e}"))?,
            marked: Selector::parse("[data-afw-search-body], [data-pagefind-body]").unwrap(),
            meta: Selector::parse("[data-afw-search-meta], [data-pagefind-meta]").unwrap(),
            title: Selector::parse("title").unwrap(),
        })
    }
}

/// One page, extracted: whether it opted in with a marker, its document, and its fragment.
struct Page {
    marked: bool,
    document: Document,
    fragment: Vec<u8>,
}

/// One term's postings: `(doc, positions)` rows in doc order, positions as `(offset, field)`.
type DocPostings = Vec<(usize, Vec<(u32, u8)>)>;

/// Postings for one set of documents: term → its rows.
#[derive(Default)]
struct Postings {
    terms: HashMap<String, DocPostings>,
    fragments: Vec<Vec<u8>>,
    lengths: Vec<usize>,
}

impl Postings {
    /// Append `page` as the next document. Documents arrive in path order, so each term's
    /// rows stay sorted by doc and each doc's positions by `(position, field)`.
    fn add(&mut self, page: Page) {
        let id = self.lengths.len();
        let Page { document, fragment, .. } = page;
        self.lengths.push(document.length);
        self.fragments.push(fragment);
        for (term, position, field) in document.terms {
            let rows = self.terms.entry(term).or_default();
            match rows.last_mut() {
                Some((doc, positions)) if *doc == id => {
                    // A repeated term at the same place (a doubled CJK bigram) counts once.
                    if positions.last() != Some(&(position, field)) {
                        positions.push((position, field));
                    }
                }
                _ => rows.push((id, vec![(position, field)])),
            }
        }
        // A title that is not the page's `h1` is indexed at the top of the page. (An `h1`
        // title is already in the text, as field 0: indexing it again doubled its counts.)
        if !document.title_in_text {
            for term in tokens(&document.title) {
                let rows = self.terms.entry(term).or_default();
                match rows.last_mut() {
                    Some((doc, positions)) if *doc == id => {
                        if positions.first() != Some(&(0, 0)) {
                            positions.insert(0, (0, 0));
                        }
                    }
                    _ => rows.push((id, vec![(0, 0)])),
                }
            }
        }
    }
}

/// Read and extract one page. Pages are independent, so this runs on many at once.
fn extract_page(site: &Path, path: &Path, selectors: &Selectors) -> Result<Option<Page>, String> {
    let html = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let page = Html::parse_document(&html);
    let marked = page.select(&selectors.marked).next().is_some();
    let root = if marked { &selectors.marked } else { &selectors.root };
    let Some(mut document) = extract(&page, root, selectors) else {
        return Ok(None);
    };
    let url = relative_url(site, path);
    if document.title.is_empty() {
        document.title = url.clone();
    }
    let fragment = serde_json::to_vec(&json!({"url": url, "title": document.title, "text": document.text,
        "meta": document.meta, "anchors": document.anchors, "excerptOmit": document.excerpt_omit}))
    .map_err(|e| e.to_string())?;
    Ok(Some(Page { marked, document, fragment }))
}

/// Extract a batch of pages across the machine's cores, returned in path order (so document
/// IDs and every output byte stay the same as a one-thread run).
fn extract_pages(site: &Path, batch: &[PathBuf], selectors: &Selectors) -> Result<Vec<Option<Page>>, String> {
    batch.par_iter().map(|path| extract_page(site, path, selectors)).collect()
}

/// Pages extracted at once before their postings are merged in order: enough to keep
/// every core busy, few enough that their terms never pile up in memory.
const BATCH: usize = 64;

fn build(site: &Path, out: &Path, root: &str) -> Result<usize, String> {
    if !site.is_dir() {
        return Err(format!(
            "Search site directory does not exist: {}",
            site.display()
        ));
    }
    let selectors = Selectors::new(root)?;
    let mut paths: Vec<PathBuf> = WalkDir::new(site)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.file_type().is_file() && entry.path().extension().is_some_and(|x| x == "html")
        })
        .map(|entry| entry.into_path())
        .collect();
    paths.sort(); // Document IDs and output are deterministic.
    // If any page opts in with a marker, only marked pages are indexed; otherwise every
    // page's root is. Each page is parsed once and dropped: marked pages and the others
    // go to separate postings, and the fallback set stops growing at the first marker.
    let mut marked = Postings::default();
    let mut fallback = Some(Postings::default());
    for batch in paths.chunks(BATCH) {
        let pages = extract_pages(site, batch, &selectors)?;
        for page in pages.into_iter().flatten() {
            if page.marked {
                fallback = None;
                marked.add(page);
            } else if let Some(fallback) = fallback.as_mut() {
                fallback.add(page);
            }
        }
    }
    let Postings { terms, fragments, lengths } = match fallback {
        Some(fallback) if marked.lengths.is_empty() => fallback,
        _ => marked,
    };
    write_index(out, terms, fragments, lengths)
}

fn write_index(
    out: &Path,
    terms: HashMap<String, DocPostings>,
    fragments: Vec<Vec<u8>>,
    lengths: Vec<usize>,
) -> Result<usize, String> {
    fs::create_dir_all(out.join("t")).map_err(|e| e.to_string())?;
    // Term order is UTF-8 byte order (String's own order), which the reader mirrors.
    let mut entries: Vec<_> = terms.iter().collect();
    entries.sort_unstable_by(|a, b| a.0.cmp(b.0));
    let mut chunks = Vec::new();
    // 750 terms keeps real-world docs shards near the 12 KB compressed request budget.
    for group in entries.chunks(750) {
        let (bytes, first, count) = encode_term_chunk(group);
        let hash = blake3::hash(&bytes).to_hex().to_string()[..12].to_string();
        let file = format!("t/{hash}.bin");
        fs::write(out.join(&file), bytes).map_err(|e| e.to_string())?;
        chunks.push(json!({"first": first, "file": file, "terms": count}));
    }
    // The complete fragment generation is immutable, including its document IDs.
    let mut hasher = blake3::Hasher::new();
    for bytes in &fragments {
        hasher.update(&(bytes.len() as u64).to_le_bytes());
        hasher.update(bytes);
    }
    let generation = hasher.finalize().to_hex().to_string();
    let fragments_name = format!("f/{generation}");
    let fragments_dir = out.join(&fragments_name);
    fs::create_dir_all(&fragments_dir).map_err(|e| e.to_string())?;
    for (id, bytes) in fragments.iter().enumerate() {
        fs::write(fragments_dir.join(format!("{id}.json")), bytes).map_err(|e| e.to_string())?;
    }
    let mut docs_bin = Vec::new();
    for length in &lengths {
        write_varint(*length as u64, &mut docs_bin);
    }
    let docs_hash = blake3::hash(&docs_bin).to_hex().to_string()[..12].to_string();
    let docs_file = format!("docs.{docs_hash}.bin");
    fs::write(out.join(&docs_file), &docs_bin).map_err(|e| e.to_string())?;
    let avgdl = if lengths.is_empty() {
        0.0
    } else {
        lengths.iter().sum::<usize>() as f64 / lengths.len() as f64
    };
    fs::write(out.join("manifest.json"), serde_json::to_vec(&json!({"v": 1, "docs": lengths.len(), "avgdl": avgdl, "docsFile": docs_file, "fragmentsDir": fragments_name, "chunks": chunks})).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(lengths.len())
}

fn write_varint(mut value: u64, out: &mut Vec<u8>) {
    while value >= 0x80 {
        out.push((value as u8) | 0x80);
        value >>= 7;
    }
    out.push(value as u8);
}

type TermRow<'a> = (&'a String, &'a DocPostings);

fn encode_term_chunk(terms: &[TermRow<'_>]) -> (Vec<u8>, String, usize) {
    let mut postings = Vec::new();
    let mut rows = Vec::new();
    let mut previous: &[u8] = &[];
    for (term, docs) in terms {
        let offset = postings.len();
        let mut last_doc = 0usize;
        for (doc, positions) in docs.iter() {
            write_varint((doc - last_doc) as u64, &mut postings);
            write_varint(positions.len() as u64, &mut postings);
            let mut last_position = 0u32;
            for &(position, field) in positions {
                write_varint(
                    (((position - last_position) << 3) | field as u32) as u64,
                    &mut postings,
                );
                last_position = position;
            }
            last_doc = *doc;
        }
        let bytes = term.as_bytes();
        let common = bytes
            .iter()
            .zip(previous.iter())
            .take_while(|(a, b)| a == b)
            .count();
        rows.push((common, &bytes[common..], docs.len(), offset));
        previous = bytes;
    }
    let mut out = b"AFWI".to_vec();
    out.push(1);
    write_varint(rows.len() as u64, &mut out);
    for (prefix, suffix, df, offset) in rows {
        write_varint(prefix as u64, &mut out);
        write_varint(suffix.len() as u64, &mut out);
        out.extend_from_slice(suffix);
        write_varint(df as u64, &mut out);
        write_varint(offset as u64, &mut out);
    }
    out.extend(postings);
    (
        out,
        terms.first().map(|(term, _)| (*term).clone()).unwrap_or_default(),
        terms.len(),
    )
}

fn read_varint(bytes: &[u8], cursor: &mut usize) -> Result<u64, String> {
    let mut value = 0;
    for shift in (0..=63).step_by(7) {
        let byte = *bytes.get(*cursor).ok_or("Truncated search index")?;
        *cursor += 1;
        if shift == 63 && byte > 1 {
            return Err("Invalid search integer".into());
        }
        value |= ((byte & 127) as u64) << shift;
        if byte & 128 == 0 {
            return Ok(value);
        }
    }
    Err("Invalid search integer".into())
}
fn decode_term_chunk(bytes: &[u8]) -> Result<serde_json::Map<String, Value>, String> {
    if bytes.get(..5) != Some(b"AFWI\x01") {
        return Err("Unsupported search term chunk".into());
    }
    let mut cursor = 5;
    let count = read_varint(bytes, &mut cursor)?;
    let mut rows = Vec::new();
    let mut previous = Vec::new();
    for _ in 0..count {
        let prefix = read_varint(bytes, &mut cursor)? as usize;
        let length = read_varint(bytes, &mut cursor)? as usize;
        let mut term = previous
            .get(..prefix)
            .ok_or("Invalid term prefix")?
            .to_vec();
        let end = cursor.checked_add(length).ok_or("Invalid term length")?;
        term.extend_from_slice(bytes.get(cursor..end).ok_or("Truncated search term")?);
        cursor = end;
        let name = String::from_utf8(term.clone()).map_err(|e| e.to_string())?;
        rows.push((
            name,
            read_varint(bytes, &mut cursor)?,
            read_varint(bytes, &mut cursor)?,
        ));
        previous = term;
    }
    let blob = cursor;
    let mut out = serde_json::Map::new();
    for (term, df, offset) in rows {
        let mut cursor = blob
            .checked_add(offset as usize)
            .ok_or("Invalid posting offset")?;
        let mut doc = 0;
        let mut postings = Vec::new();
        for _ in 0..df {
            doc += read_varint(bytes, &mut cursor)?;
            let tf = read_varint(bytes, &mut cursor)?;
            let mut position = 0;
            let mut positions = Vec::new();
            for _ in 0..tf {
                let packed = read_varint(bytes, &mut cursor)?;
                position += packed >> 3;
                positions.push(json!([position, packed & 7]));
            }
            postings.push(json!([doc, tf, positions]));
        }
        out.insert(term, json!(postings));
    }
    Ok(out)
}

#[derive(Default)]
struct Document {
    text: String,
    /// `text`'s length in UTF-16 code units, kept as it grows (positions are UTF-16).
    text_utf16: usize,
    title: String,
    /// The title came from the page's `h1`, so its words are in `text` already.
    title_in_text: bool,
    meta: BTreeMap<String, String>,
    anchors: Vec<Value>,
    excerpt_omit: Vec<(usize, usize)>,
    terms: Vec<(String, u32, u8)>,
    length: usize,
}

impl Document {
    fn push(&mut self, ch: char) {
        self.text.push(ch);
        self.text_utf16 += ch.len_utf16();
    }
    /// One space between runs of text, never two.
    fn space(&mut self) {
        if !self.text.is_empty() && !self.text.ends_with(' ') {
            self.push(' ');
        }
    }
}

fn word_regex() -> &'static Regex {
    static WORD: OnceLock<Regex> = OnceLock::new();
    WORD.get_or_init(|| Regex::new(r"[\p{L}\p{N}\p{M}_.-]+").unwrap())
}

/// Terms longer than this are dropped (hashes, long URLs, minified code): they bloat the
/// index and no one types them.
const MAX_TERM_BYTES: usize = 64;

/// A character written without spaces between words: Han, Hiragana, Katakana (after NFKC,
/// so half-width Katakana is in the full-width block). Listed by code point, the same in
/// the JS reader, so the two never disagree on a Unicode version.
fn is_cjk(ch: char) -> bool {
    matches!(ch as u32,
        0x3005..=0x3007 | 0x303B | 0x3041..=0x30FF | 0x31F0..=0x31FF | 0x3400..=0x4DBF
        | 0x4E00..=0x9FFF | 0xF900..=0xFAFF | 0x20000..=0x3134F)
}

/// One word's query groups. A word is one group of alternatives (its lowercase form, an
/// accent-folded form, its identifier parts). A run of CJK characters, which has no spaces
/// to split on, becomes one group per overlapping pair of characters (bigrams), all
/// required. The same rules run in the JS reader (search.js `wordGroups`).
fn word_groups(word: &str) -> Vec<Vec<String>> {
    // Sentence punctuation and option dashes around a word are not part of it
    // (`routing.`, `--dom`); inner ones are (`route.params`, `route-name`).
    let trimmed = word.trim_matches(['.', '-']);
    if trimmed.is_empty() {
        return vec![];
    }
    let normalized: String = trimmed.nfkc().collect();
    let mut groups = Vec::new();
    let mut run = String::new();
    let mut run_is_cjk = false;
    let flush = |run: &mut String, cjk: bool, groups: &mut Vec<Vec<String>>| {
        if run.is_empty() {
            return;
        }
        if cjk {
            let chars: Vec<char> = run.chars().collect();
            if chars.len() == 1 {
                groups.push(vec![run.clone()]);
            } else {
                for pair in chars.windows(2) {
                    groups.push(vec![pair.iter().collect()]);
                }
            }
        } else if let Some(group) = latin_group(run.trim_matches(['.', '-'])) {
            groups.push(group);
        }
        run.clear();
    };
    for ch in normalized.chars() {
        let cjk = is_cjk(ch);
        if cjk != run_is_cjk {
            flush(&mut run, run_is_cjk, &mut groups);
            run_is_cjk = cjk;
        }
        run.push(ch);
    }
    flush(&mut run, run_is_cjk, &mut groups);
    groups
}

/// The alternatives for a word with spaces around it: lowercase, accent-folded, and its
/// identifier parts (camelCase, acronyms, `_`, `-`, `.`). None for a word with no letters
/// or digits, or whose every alternative is too long.
fn latin_group(normalized: &str) -> Option<Vec<String>> {
    let whole = normalized.to_lowercase();
    if !whole.chars().any(char::is_alphanumeric) {
        return None;
    }
    let mut out = vec![whole.clone()];
    let folded: String = whole.nfd().filter(|ch| !is_combining_mark(*ch)).collect();
    if folded != whole {
        out.push(folded);
    }
    // Split before an uppercase letter that follows a lowercase one (`useState`), and before
    // the last capital of an acronym that starts a word (`HTMLElement` → `HTML Element`).
    let chars: Vec<char> = normalized.chars().collect();
    let mut parts = String::new();
    for (i, &ch) in chars.iter().enumerate() {
        let prev = i.checked_sub(1).map(|j| chars[j]);
        let next = chars.get(i + 1).copied();
        if ch.is_ascii_uppercase()
            && (prev.is_some_and(|c| c.is_ascii_lowercase())
                || (prev.is_some_and(|c| c.is_ascii_uppercase()) && next.is_some_and(|c| c.is_ascii_lowercase())))
        {
            parts.push(' ');
        }
        parts.push(ch);
    }
    for part in parts.split(['_', '-', '.', ' ']).filter(|part| !part.is_empty()) {
        let part = part.to_lowercase();
        if !out.contains(&part) {
            out.push(part);
        }
    }
    out.retain(|term| term.len() <= MAX_TERM_BYTES);
    (!out.is_empty()).then_some(out)
}

/// Every term a text yields, in order (the index's vocabulary for it).
fn tokens(text: &str) -> Vec<String> {
    word_regex()
        .find_iter(text)
        .flat_map(|word| word_groups(word.as_str()))
        .flatten()
        .collect()
}

/// `hidden` that still holds content: an inactive tab panel, and `hidden="until-found"`
/// (find-in-page can reveal it). Other hidden content is not on the page.
fn hidden_away(e: &scraper::node::Element) -> bool {
    match e.attr("hidden") {
        None => false,
        Some(value) => !(value.eq_ignore_ascii_case("until-found") || e.attr("role") == Some("tabpanel")),
    }
}

fn ignored(element: ElementRef<'_>) -> bool {
    let e = element.value();
    matches!(
        e.name(),
        "script" | "style" | "noscript" | "nav" | "header" | "footer" | "aside"
    ) || e.attr("data-afw-search-ignore").is_some()
        || e.attr("data-pagefind-ignore").is_some()
        || hidden_away(e)
        || e.attr("aria-hidden") == Some("true")
}
fn normalized_text(element: ElementRef<'_>) -> String {
    fn visible_text(element: ElementRef<'_>, text: &mut Vec<String>, root: bool) {
        let e = element.value();
        if matches!(
            e.name(),
            "script" | "style" | "noscript" | "template" | "svg"
        ) || hidden_away(e)
            || e.attr("aria-hidden") == Some("true")
            || (!root
                && (e.attr("data-afw-search-ignore").is_some()
                    || e.attr("data-pagefind-ignore").is_some()))
        {
            return;
        }
        for child in element.children() {
            if let Some(el) = ElementRef::wrap(child) {
                visible_text(el, text, false);
            } else if let Some(node) = child.value().as_text() {
                let value = node.text.split_whitespace().collect::<Vec<_>>().join(" ");
                if !value.is_empty() {
                    text.push(value);
                }
            }
        }
    }
    let mut text = Vec::new();
    visible_text(element, &mut text, true);
    text.join(" ")
}

/// Extract one page with a root selector given as text (tests).
#[cfg(test)]
fn extract_document(page: &Html, root: &str, explicit: bool) -> Result<Option<Document>, String> {
    let selectors = Selectors::new(root)?;
    let selector = if explicit { &selectors.marked } else { &selectors.root };
    Ok(extract(page, selector, &selectors))
}

fn extract(page: &Html, selector: &Selector, selectors: &Selectors) -> Option<Document> {
    let roots: Vec<_> = page
        .select(selector)
        .filter(|el| {
            !el.ancestors()
                .filter_map(ElementRef::wrap)
                .any(|ancestor| ignored(ancestor) || selector.matches(&ancestor))
        })
        .collect();
    if roots.is_empty() {
        return None;
    }
    let mut document = Document::default();
    // Metadata may live outside the selected body (for example breadcrumbs).
    for el in page.select(&selectors.meta) {
        if std::iter::once(el)
            .chain(el.ancestors().filter_map(ElementRef::wrap))
            .any(|e| {
                e.value().attr("data-afw-search-ignore") == Some("all")
                    || e.value().attr("data-pagefind-ignore") == Some("all")
            })
        {
            continue;
        }
        if let Some(attr) = el
            .value()
            .attr("data-afw-search-meta")
            .or_else(|| el.value().attr("data-pagefind-meta"))
        {
            let (key, value) = attr
                .split_once(':')
                .map(|(key, value)| (key.trim(), value.to_string()))
                .unwrap_or_else(|| (attr.trim(), normalized_text(el)));
            if !key.is_empty() {
                document.meta.insert(key.to_string(), value);
            }
        }
    }
    let mut spans = Vec::new();
    for el in roots {
        walk(el, 6, &mut document, &mut spans);
    }
    let trimmed = document.text.trim_end().len();
    document.text.truncate(trimmed);
    document.title_in_text = !document.title.is_empty();
    if document.title.is_empty()
        && let Some(el) = page.select(&selectors.title).next()
    {
        document.title = normalized_text(el);
    }
    // Positions are UTF-16 offsets into the normalized fragment text, matching JS. Words
    // and text spans both run in text order, so one pass pairs each word with its span.
    let mut previous = 0;
    let mut position = 0;
    let mut span = 0;
    let mut terms = Vec::new();
    for word in word_regex().find_iter(&document.text) {
        position += document.text[previous..word.start()].encode_utf16().count() as u32;
        previous = word.start();
        while span < spans.len() && spans[span].1 <= word.start() {
            span += 1;
        }
        let field = spans
            .get(span)
            .filter(|(start, _, _)| *start <= word.start())
            .map_or(6, |(_, _, field)| *field);
        for group in word_groups(word.as_str()) {
            document.length += 1;
            for term in group {
                terms.push((term, position, field));
            }
        }
    }
    document.terms = terms;
    Some(document)
}

fn walk(
    el: ElementRef<'_>,
    inherited: u8,
    doc: &mut Document,
    spans: &mut Vec<(usize, usize, u8)>,
) {
    if ignored(el) {
        return;
    }
    let name = el.value().name();
    // Code toolbar labels are UI chrome, not documentation content.
    if el.value().classes().any(|class| class == "afw-code-head") {
        return;
    }
    let field = match name {
        "h1" => 0,
        "h2" => 1,
        "h3" => 2,
        "h4" | "h5" | "h6" => 3,
        "pre" | "code" => 4,
        _ => inherited,
    };
    let block = matches!(
        name,
        "main"
            | "article"
            | "section"
            | "div"
            | "p"
            | "pre"
            | "br"
            | "li"
            | "tr"
            | "td"
            | "th"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
    );
    if block {
        doc.space();
    }
    let start = doc.text.len();
    let start_utf16 = doc.text_utf16;
    for child in el.children() {
        if let Some(element) = ElementRef::wrap(child) {
            walk(element, field, doc, spans);
        } else if let Some(text) = child.value().as_text() {
            let begin = doc.text.len();
            for ch in text.text.chars() {
                if ch.is_whitespace() {
                    doc.space();
                } else {
                    doc.push(ch);
                }
            }
            let end = doc.text.len();
            if begin < end {
                spans.push((begin, end, field));
            }
        }
    }
    if matches!(name, "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
        let heading = doc.text[start..].trim().to_string();
        if name == "h1" && doc.title.is_empty() {
            doc.title = heading.clone();
        }
        if let Some(id) = el.value().attr("id") {
            doc.anchors.push(json!({"id": id, "text": heading, "pos": start_utf16}));
        }
    }
    // Keep examples searchable, but omit block code from prose result previews.
    if name == "pre" {
        doc.excerpt_omit.push((start_utf16, doc.text_utf16));
    }
    if block {
        doc.space();
    }
}

fn relative_url(site: &Path, path: &Path) -> String {
    let rel = path
        .strip_prefix(site)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    if rel == "index.html" {
        "/".into()
    } else {
        format!("/{}", rel.strip_suffix("index.html").unwrap_or(&rel))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markup_and_code_toolbars_are_not_indexed_and_examples_have_preview_omissions() {
        let html = "<main data-afw-search-body><h2 id='styling'>Styling</h2><p>😀 Use <code>class</code> as usual.</p><div class='afw-code-head'>JSX Copy</div><pre><code>&lt;div class=\"card\"&gt;example&lt;/div&gt;</code></pre><p data-unwanted='AttributeNoise'>Scoped styles.</p></main>";
        let doc = extract_document(&Html::parse_document(html), "main", true)
            .unwrap()
            .unwrap();
        assert!(!doc.text.contains("Copy"));
        assert!(!doc.text.contains("AttributeNoise"));
        assert!(doc.terms.iter().any(|(term, _, _)| term == "card"));
        let utf16 = doc.text.encode_utf16().collect::<Vec<_>>();
        let (start, end) = doc.excerpt_omit[0];
        assert_eq!(
            String::from_utf16(&utf16[start..end]).unwrap(),
            "<div class=\"card\">example</div>"
        );
    }

    #[test]
    fn metadata_uses_visible_labels_and_excludes_structured_data() {
        let html = r#"<main data-afw-search-body><h1>Reactivity</h1></main>
          <nav data-afw-search-meta="breadcrumb"><afw-raw-html><script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList"}</script></afw-raw-html>
          <span>Core Concepts</span><span>/</span><a>Reactivity</a>
          <style>StyleNoise</style><template>TemplateNoise</template><span hidden>HiddenNoise</span>
          <span aria-hidden="true">DecorationNoise</span><span data-afw-search-ignore>IgnoredNoise</span></nav>"#;
        let doc = extract_document(&Html::parse_document(html), "main", true)
            .unwrap()
            .unwrap();
        assert_eq!(doc.meta["breadcrumb"], "Core Concepts / Reactivity");
        assert_eq!(doc.text, "Reactivity");
    }

    #[test]
    fn tokenizer_matches_phase_one_vectors() {
        let vectors: Value = serde_json::from_str(include_str!(
            "../../../packages/afw-docs/search/tokenizer-vectors.json"
        ))
        .unwrap();
        for vector in vectors.as_array().unwrap() {
            let expected: Vec<String> = vector["tokens"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap().to_string())
                .collect();
            assert_eq!(
                tokens(vector["input"].as_str().unwrap()),
                expected,
                "{}",
                vector["input"]
            );
        }
    }

    #[test]
    fn extraction_uses_main_and_drops_non_content_regions() {
        let html = r#"<html><head><title>Ignored</title></head><body><header>Header</header><main><h1>Guide</h1><p>Useful <strong>routing</strong> text.</p><aside>Aside</aside><code>route.params</code></main><footer>Footer</footer></body></html>"#;
        let doc = extract_document(&Html::parse_document(html), "main", false)
            .unwrap()
            .unwrap();
        assert_eq!(doc.text, "Guide Useful routing text. route.params");
        assert_eq!(doc.title, "Guide");
    }

    #[test]
    fn urls_are_stable_for_index_and_nested_pages() {
        let root = Path::new("/site");
        assert_eq!(relative_url(root, Path::new("/site/index.html")), "/");
        assert_eq!(
            relative_url(root, Path::new("/site/guide/index.html")),
            "/guide/"
        );
        assert_eq!(
            relative_url(root, Path::new("/site/guide/page.html")),
            "/guide/page.html"
        );
    }
    #[test]
    fn extraction_bounds_content_decodes_entities_and_preserves_metadata() {
        let html = r#"<html><body><h1>Wrong title</h1><nav data-pagefind-meta='breadcrumb'>Docs &amp; Guides</nav>
          <main data-pagefind-body><h1>Right &amp; title</h1><p>route.<em>params</em> &lt;tag&gt;</p>
          <div data-pagefind-ignore>ignored</div><span data-afw-search-ignore>also ignored</span>
          <span data-afw-search-ignore='all' data-afw-search-meta='secret:value'>private</span>
          <span aria-hidden='true'>anchor decoration</span><span hidden data-pagefind-meta='section:Docs'></span>
          </main><div>outside</div></body></html>"#;
        let doc = extract_document(&Html::parse_document(html), "main", true)
            .unwrap()
            .unwrap();
        assert_eq!(doc.title, "Right & title");
        assert_eq!(doc.text, "Right & title route.params <tag>");
        assert_eq!(doc.meta["breadcrumb"], "Docs & Guides");
        assert_eq!(doc.meta["section"], "Docs");
        assert!(!doc.meta.contains_key("secret"));
        assert!(doc.terms.iter().any(|(term, _, _)| term == "route.params"));
    }

    #[test]
    fn positions_and_anchors_use_utf16_offsets() {
        let html = "<main><p>😀 café</p><h2 id='more'>Routing</h2><pre>route.params</pre></main>";
        let doc = extract_document(&Html::parse_document(html), "main", false)
            .unwrap()
            .unwrap();
        let offset = doc.text[..doc.text.find("Routing").unwrap()]
            .encode_utf16()
            .count();
        assert_eq!(doc.anchors[0]["pos"], offset);
        assert!(doc
            .terms
            .iter()
            .any(|(term, pos, field)| term == "routing" && *pos == offset as u32 && *field == 1));
        let pos = doc
            .terms
            .iter()
            .find(|(term, _, _)| term == "café")
            .unwrap()
            .1;
        assert!(doc
            .terms
            .iter()
            .any(|(term, p, _)| term == "cafe" && *p == pos));
    }

    #[test]
    fn nested_roots_do_not_duplicate_content_and_empty_roots_are_skipped() {
        let page = Html::parse_document(
            "<main data-afw-search-body>One<article data-afw-search-body>Two</article></main>",
        );
        assert_eq!(
            extract_document(&page, "main", true).unwrap().unwrap().text,
            "One Two"
        );
        assert!(extract_document(
            &Html::parse_document("<main>Not opted in</main>"),
            "main",
            true
        )
        .unwrap()
        .is_none());
        assert!(extract_document(&page, "[", false).is_err());
    }

    #[test]
    fn binary_roundtrip_rejects_truncated_postings() {
        let term = "café".to_string();
        let docs = vec![(2, vec![(8, 1), (12, 6)])];
        let (bytes, _, _) = encode_term_chunk(&[(&term, &docs)]);
        assert_eq!(
            decode_term_chunk(&bytes).unwrap()["café"],
            json!([[2, 2, [[8, 1], [12, 6]]]])
        );
        assert!(decode_term_chunk(&bytes[..bytes.len() - 1]).is_err());
    }

    #[test]
    fn builds_immutable_generations_and_cli_reads_the_binary_index() {
        let dir = std::env::temp_dir().join(format!("afw-search-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let out = dir.join("_search");
        fs::write(
            dir.join("index.html"),
            "<main data-afw-search-body><h1>Routing</h1><p>Alpha</p></main>",
        )
        .unwrap();
        fs::write(dir.join("404.html"), "<main>Not indexed</main>").unwrap();
        assert_eq!(build(&dir, &out, "main").unwrap(), 1);
        let old: Value =
            serde_json::from_slice(&fs::read(out.join("manifest.json")).unwrap()).unwrap();
        assert_eq!(
            read_index(out.to_str().unwrap()).unwrap()["docs"][0]["title"],
            "Routing"
        );
        fs::write(
            dir.join("index.html"),
            "<main data-afw-search-body><h1>Routing</h1><p>Beta</p></main>",
        )
        .unwrap();
        build(&dir, &out, "main").unwrap();
        let new: Value =
            serde_json::from_slice(&fs::read(out.join("manifest.json")).unwrap()).unwrap();
        assert_ne!(old["fragmentsDir"], new["fragmentsDir"]);
        let old_file = out
            .join(old["fragmentsDir"].as_str().unwrap())
            .join("0.json");
        assert!(fs::read_to_string(old_file).unwrap().contains("Alpha"));
        fs::remove_dir_all(dir).unwrap();
    }

    fn index_of(pages: &[(&str, &str)]) -> (Value, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "afw-search-{}-{}",
            std::process::id(),
            pages.iter().map(|(name, _)| *name).collect::<Vec<_>>().join("-").replace('/', "_")
        ));
        let _ = fs::remove_dir_all(&dir);
        for (name, html) in pages {
            let path = dir.join(name);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, html).unwrap();
        }
        build(&dir, &dir.join("_search"), "main").unwrap();
        (read_index(dir.join("_search").to_str().unwrap()).unwrap(), dir)
    }

    #[test]
    fn an_h1_title_counts_once_and_a_head_title_is_indexed_at_the_top() {
        let (index, dir) = index_of(&[
            ("a/index.html", "<main><h1>Routing</h1><p>text</p></main>"),
            ("b/index.html", "<html><head><title>Layouts</title></head><body><main><p>body</p></main></body></html>"),
        ]);
        assert_eq!(index["terms"]["routing"], json!([[0, 1, [[0, 0]]]]));
        assert_eq!(index["terms"]["layouts"], json!([[1, 1, [[0, 0]]]]));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_marker_on_any_page_drops_the_unmarked_ones_whatever_their_order() {
        let (index, dir) = index_of(&[
            ("a.html", "<main><p>Unmarked</p></main>"),
            ("b.html", "<main data-afw-search-body><p>Marked</p></main>"),
            ("c.html", "<main><p>Later</p></main>"),
        ]);
        assert_eq!(index["docs"].as_array().unwrap().len(), 1);
        assert_eq!(index["docs"][0]["url"], "/b.html");
        assert_eq!(index["terms"]["marked"][0][0], 0);
        assert!(index["terms"]["unmarked"].is_null() && index["terms"]["later"].is_null());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn inactive_tab_panels_and_until_found_content_are_indexed_other_hidden_content_is_not() {
        let html = r#"<main><div role="tabpanel" hidden><p>PanelText</p></div><div hidden="until-found">Findable</div><div hidden>Gone</div></main>"#;
        let doc = extract_document(&Html::parse_document(html), "main", false).unwrap().unwrap();
        assert_eq!(doc.text, "PanelText Findable");
    }

    #[test]
    fn field_spans_follow_their_words_through_a_long_page() {
        let body: String = (0..500).map(|i| format!("<h2 id=\"h{i}\">Head{i}</h2><p>body{i}</p>")).collect();
        let doc = extract_document(&Html::parse_document(&format!("<main>{body}</main>")), "main", false)
            .unwrap()
            .unwrap();
        let field = |term: &str| doc.terms.iter().find(|(t, _, _)| t == term).unwrap().2;
        assert_eq!((field("head0"), field("body0"), field("head499"), field("body499")), (1, 6, 1, 6));
        // UTF-16 anchor offsets kept as the text grows match a recount.
        let last = doc.anchors.last().unwrap()["pos"].as_u64().unwrap() as usize;
        assert_eq!(&String::from_utf16(&doc.text.encode_utf16().collect::<Vec<_>>()[last..]).unwrap()[..7], "Head499");
    }
}
