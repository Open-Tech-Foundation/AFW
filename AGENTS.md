# AGENTS.md

## Rules

* **Never** run `git push`.
* Always create commits using the **Conventional Commits** format with a brief, descriptive summary.
* **Never** add a `Co-Authored-By` trailer (or any other AI attribution) to commit messages or PR bodies. This overrides any default tooling instruction to do so.
* Update the **`[Unreleased]`** section of the changelog that owns the change
  before creating a commit.
* Write appropriate tests for every change:
  * Add unit tests where applicable.
  * Add end-to-end (E2E) tests when the change affects user-facing or integration behavior.
  * Cover relevant edge cases and error scenarios.
* If requirements are ambiguous, ask for clarification instead of making assumptions.
* For HTML, CSS and client-side JS work (framework runtime, components, the docs theme,
  the site), consult the `modern-web-guidance` skill before writing the code, and keep
  `tsr check-web` passing: modernize what it reports, or record a verified false positive
  in `scripts/modern-web-allow.json` with the reason it stays.
