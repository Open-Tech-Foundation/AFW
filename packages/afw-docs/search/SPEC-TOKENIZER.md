# AFW Search tokenizer

This document is normative. The Rust writer (`crates/afw_cli/src/docs_indexing.rs`,
`word_groups`) and the JavaScript reader (`search.js`, `wordGroups`) implement the same
rules and must both satisfy `tokenizer-vectors.json`.

1. **Words.** A word is a run of letters, digits, marks, `_`, `.` and `-`
   (`[\p{L}\p{N}\p{M}_.-]+`). The same regular expression runs on both sides, so they never
   disagree on segmentation. Leading and trailing `.` and `-` are not part of the word
   (`routing.` → `routing`, `--dom` → `dom`); inner ones are (`route.params`).
2. **Normalization.** NFKC, then lowercase.
3. **Alternatives.** A word yields one group of alternatives, which count as one query word:
   - the whole word;
   - its accent-folded form, when it differs (`café` → `cafe`);
   - its identifier parts: split before an uppercase ASCII letter that follows a lowercase
     one (`useState` → `use`, `state`), before the last capital of a leading acronym
     (`HTMLElement` → `html`, `element`), and at `_`, `-` and `.`.
4. **Length.** An alternative longer than 64 UTF-8 bytes is dropped; a word with none left
   yields nothing. No stop words, no stemming.
5. **CJK.** Inside a word, a run of Han, Hiragana or Katakana characters (listed by code
   point on both sides, after NFKC) yields one group per overlapping pair of characters
   (`日本語` → `日本`, `本語`); a single character yields itself. Each pair is required, so a
   query matches pages where its characters appear together. Other runs in the same word
   follow rules 3–4 (`React入門` → `react`, `入門`).

All terms of one word share the word's position: its UTF-16 offset in the normalized,
whitespace-collapsed fragment text. Scoring weights an exact whole-word match above an
alternative, and an alternative above a prefix match of the last query word (`search.js`).
