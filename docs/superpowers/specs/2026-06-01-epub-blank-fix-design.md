# Nexus EPUB blank-screen fix design

## Scope
Fix the Nexus EPUB regression where opening a book can produce a blank reader view, while preserving the existing bookshelf behavior and reading statistics logic.

## Confirmed root cause
The EPUB reader now depends on a mixed state model:
- `filePath` is passed through Obsidian view state
- `plugin` is restored from a module-level `_plugin` variable

If the view opens before that transient global state is available, `onOpen()` returns early when `file` or `plugin` is missing. That creates a blank page instead of a working reader or an explicit error state.

## Approved behavior
1. The reader should restore itself from stable view state instead of relying on transient module globals.
2. Opening a book from the bookshelf should still open a new EPUB reader leaf using the file path.
3. Existing reading stats/session tracking should be preserved.
4. If the file path is missing or invalid, the view should render an explicit error message instead of remaining blank.

## Recommended approach
Use `filePath` as the canonical reader state and keep the view recoverable from that state alone.

- Store `filePath` on the view when opening and when restoring state.
- Resolve the `TFile` from `this.app.vault.getFileByPath(...)` inside the reader view.
- Remove the fragile dependency on the module-level `_plugin` for initialization.
- Keep plugin-dependent persistence paths reachable through a stable access pattern.
- Add a visible fallback render for missing/invalid state.

## Non-goals
- No redesign of bookshelf UI
- No changes to EPUB rendering options unless required for initialization
- No changes to reading stats semantics
