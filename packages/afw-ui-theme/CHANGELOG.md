# @opentf/afw-ui-theme

## [Unreleased]

### Added

- First release: the default theme for `@opentf/afw-ui`, accented in the macOS system
  blue — design tokens and
  component styles in `afw-ui.*` cascade layers; light and dark modes; compact,
  comfortable and spacious densities; forced colors and reduced motion; WCAG contrast
  checked for every color pair.
- Layout, app shell, side navigation, page header, breadcrumbs and pagination styles; a
  `--afw-ui-space` scale per density for layout spacing.
- Typography styles: a heading scale up to `3xl` and `display` (new `--afw-ui-text-3xl`,
  `--afw-ui-text-display`, `--afw-ui-leading-tight`) with balanced wrapping; text sizes,
  tones (muted, success, warning, danger — all 4.5:1) and weights; one-line and
  multi-line truncation; underlined links with an external-link mark; inline code,
  keycaps and code blocks.
- A component host holding only one kit part is `display: contents`, so layouts place
  the part itself (a card in a grid, a button row in a card footer).
