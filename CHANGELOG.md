# Changelog

All notable changes to Trivia Host Timer are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## v2.5 — 2026-07-17

### Changed
- Current Round now stacks above Session (each with its own label and
  timer) at narrow phone widths, instead of squeezing side by side.

## v2.4 — 2026-07-17

### Changed
- Header row now combines the title, Summary/Clear Session links, and
  settings gear onto a single line to save vertical space.

## v2.3 — 2026-07-13

### Added
- Round log column now stays visible at *every* width, down to the
  narrowest phone — the earlier ≥700px breakpoint is gone. Below 600px it
  switches to a compact mode: round #/time stack above a pace glyph
  (badge text and the inline notes field are dropped), and tapping a
  round opens a modal to read/edit its notes instead.
- Round/session/question/break digits and the log column's row text now
  size themselves off their actual container width (CSS container
  queries), so neither a narrow phone nor the Settings text-size slider
  (nor both at once) can overflow or overlap them.

### Changed
- Split the single `index.html` file into `index.html` (structure),
  `style.css`, and `app.js`. All three must ship together; nothing else
  about deployment changes (still static files, no build step).
- Below 600px, Start/End Round & Log stack vertically, and the question
  countdown's/break timer's control rows reflow into a 2x2 grid, instead
  of squeezing 3-4 controls into one row once the timer column has
  narrowed to make room for the log column.

## v2.2 — 2026-07-13

### Added
- Round log now sits in its own column to the right of the timers on wide
  windows (≥700px), instead of stacking below them. The log scrolls in
  place (independent of the page) so the timers stay visible without
  scrolling — built for hosting on a 13" laptop screen where vertical
  space is tight.
- Color-blind friendly palette, toggleable independently of light/dark
  mode in Settings. Swaps the on-pace/too-fast green-vs-red pairing for a
  blue/vermillion/amber scheme (Okabe-Ito derived) so pace is never a
  pure red-vs-green distinction. Applies to both light and dark themes.
- Round log badges now carry a shape glyph (✓ on pace, ▼ too fast, ▲ too
  slow) in addition to color, so pace reads correctly without color
  vision.
- CHANGELOG.md (this file).

### Changed
- Full color palette audit and rework for both light and dark themes:
  every text/background pairing now meets WCAG 2.1 **AAA** contrast
  (7:1 normal text, 4.5:1 large text), including the round-log badges,
  the reset button, the primary button, and the question-countdown
  warning/overtime pulse states, none of which reliably passed AAA
  before this pass.
- Question-countdown pulse (warning/overtime) now uses theme-aware
  colors instead of one hardcoded pair, so it stays legible and
  high-contrast in both light and dark mode.
- Reset button and round-log badges now use solid-fill colors (instead
  of colored text on a faint tint) for a more reliable contrast ratio.

## v2.1 — 2026-06-26
- Added a live Round timer alongside a persistent Session timer that
  keeps running across rounds.
- Renamed "Stop" to "End Round & Log".
- Added color states to the round timer as it crosses pacing thresholds,
  plus a pressed/active visual effect on Start and Reset.
- Appearance (light/dark) moved into a Settings toggle.

## v1.1 — 2026-06-17
- Question-countdown warning/overtime states pulse the background
  instead of blinking the text.
- Added Settings panel with light mode and adjustable text size.

## v1.0 — 2026-06-17
- Initial release: round countdown, question countdown, and break timer
  for hosting trivia nights.
