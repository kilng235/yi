# Nexus EPUB Blank-Screen Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the EPUB reader blank-screen regression by making the reader restore from stable view state and render an explicit failure state instead of silently opening blank.

**Architecture:** Treat `filePath` as the canonical EPUB reader state and resolve the active `TFile` from the Obsidian vault inside the view itself. Remove the fragile initialization dependency on transient module globals, keep the existing reading stats/session code, and add a visible error render when required state is missing or invalid.

**Tech Stack:** TypeScript, Obsidian plugin runtime, epubjs, esbuild, Node built-in test runner (`node --test`) with esbuild-bundled test files.

---

## File structure

- Create: `__tests__/epub-reader-state.test.ts` — regression tests for reader state restoration and failure fallback behavior.
- Create: `src/epub-reader-state.ts` — pure helper(s) for extracting a valid file path from view state and producing user-facing fallback messages.
- Modify: `src/modules/epub-reader.ts` — use helper logic for state restoration, remove fragile initialization dependency, and render explicit error states.
- Modify: `src/modules/bookshelf.ts` — keep the open flow using `file.path` and adapt only if the new helper signature requires it.

### Task 1: Add failing regression tests for EPUB state restoration and failure fallback

**Files:**
- Create: `__tests__/epub-reader-state.test.ts`
- Create: `src/epub-reader-state.ts`
- Modify: `src/modules/epub-reader.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  getEpubFilePathFromState,
  getEpubReaderErrorMessage,
} from "../src/epub-reader-state";

test("getEpubFilePathFromState returns filePath when state contains a valid string", () => {
  assert.equal(getEpubFilePathFromState({ filePath: "books/demo.epub" }), "books/demo.epub");
});

test("getEpubFilePathFromState returns null for missing or invalid filePath", () => {
  assert.equal(getEpubFilePathFromState(undefined), null);
  assert.equal(getEpubFilePathFromState({}), null);
  assert.equal(getEpubFilePathFromState({ filePath: 123 }), null);
  assert.equal(getEpubFilePathFromState({ filePath: "" }), null);
});

test("getEpubReaderErrorMessage distinguishes missing state from missing file", () => {
  assert.equal(getEpubReaderErrorMessage(null), "未收到 EPUB 文件路径");
  assert.equal(getEpubReaderErrorMessage("books/missing.epub"), "未找到 EPUB 文件：books/missing.epub");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npx esbuild __tests__/epub-reader-state.test.ts --bundle --platform=node --format=cjs --outfile=.tmp-tests/epub-reader-state.test.cjs && node --test .tmp-tests/epub-reader-state.test.cjs
```

Expected: FAIL because `../src/epub-reader-state` does not exist yet.

- [ ] **Step 3: Write the minimal helper implementation**

Create `src/epub-reader-state.ts`:

```ts
export function getEpubFilePathFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const filePath = (state as { filePath?: unknown }).filePath;
  if (typeof filePath !== "string") return null;
  const trimmed = filePath.trim();
  return trimmed ? trimmed : null;
}

export function getEpubReaderErrorMessage(filePath: string | null): string {
  if (!filePath) return "未收到 EPUB 文件路径";
  return `未找到 EPUB 文件：${filePath}`;
}
```

- [ ] **Step 4: Update `src/modules/epub-reader.ts` to use explicit state restoration and fallback rendering**

Add imports and remove the module-global initialization dependency:

```ts
import { getEpubFilePathFromState, getEpubReaderErrorMessage } from "../epub-reader-state";
```

Replace the current module-global handoff and `setState()` logic with a file-path-driven version:

```ts
export function openEpubInNewLeaf(file: TFile, plugin: NexusPlugin) {
  const leaf = plugin.app.workspace.getLeaf(true);
  leaf.setViewState({
    type: NEXUS_EPUB_VIEW_TYPE,
    active: true,
    state: { filePath: file.path },
  });
}
```

Inside `EpubReaderView`, add a field:

```ts
private filePath: string | null = null;
```

Replace `setState()` with:

```ts
async setState(state: any, result: any): Promise<void> {
  this.filePath = getEpubFilePathFromState(state);
  this.file = this.filePath ? this.app.vault.getFileByPath(this.filePath) || null : null;
  return super.setState(state, result);
}
```

Replace the early return in `onOpen()` with explicit fallback rendering:

```ts
async onOpen() {
  if (!this.file) {
    this.renderError(getEpubReaderErrorMessage(this.filePath));
    return;
  }
  await this.renderReader();
}
```

Add the helper method inside the class:

```ts
private renderError(message: string) {
  const container = this.contentEl;
  container.empty();
  container.addClass("nexus-epub-standalone");
  container.createDiv({ cls: "nexus-epub-error", text: message });
}
```

Also replace plugin-dependent reads/writes with a stable source from `this.app` plus guarded access to settings via a new class field set during `openEpubInNewLeaf()` only if still needed for persistence.

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npx esbuild __tests__/epub-reader-state.test.ts --bundle --platform=node --format=cjs --outfile=.tmp-tests/epub-reader-state.test.cjs && node --test .tmp-tests/epub-reader-state.test.cjs
```

Expected: PASS with `3 tests` passed.

- [ ] **Step 6: Build the plugin**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npm run build
```

Expected: build succeeds without bundling errors.

- [ ] **Step 7: Commit**

```bash
git -C /e/1/Juno/nexus-plugin add __tests__/epub-reader-state.test.ts src/epub-reader-state.ts src/modules/epub-reader.ts && git -C /e/1/Juno/nexus-plugin commit -m "fix: restore epub reader from view state"
```

### Task 2: Verify bookshelf open flow still passes file path correctly

**Files:**
- Modify: `__tests__/epub-reader-state.test.ts`
- Modify: `src/modules/bookshelf.ts`

- [ ] **Step 1: Extend the failing test with a state-shape assertion**

Append to `__tests__/epub-reader-state.test.ts`:

```ts
test("EPUB view state shape uses filePath as the canonical identifier", () => {
  const state = { filePath: "vault/book.epub" };
  assert.equal(getEpubFilePathFromState(state), "vault/book.epub");
});
```

- [ ] **Step 2: Run the test suite to verify the state contract remains valid**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npx esbuild __tests__/epub-reader-state.test.ts --bundle --platform=node --format=cjs --outfile=.tmp-tests/epub-reader-state.test.cjs && node --test .tmp-tests/epub-reader-state.test.cjs
```

Expected: PASS, confirming the state contract stays centered on `filePath`.

- [ ] **Step 3: Touch `src/modules/bookshelf.ts` only if needed to preserve the explicit state contract**

If no change is required, keep the existing click handler:

```ts
card.addEventListener("click", () => {
  openEpubInNewLeaf(entry.file, plugin);
});
```

If a change is required for the new helper signature, update only the minimal call site and nothing else.

- [ ] **Step 4: Build the plugin again**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git -C /e/1/Juno/nexus-plugin add __tests__/epub-reader-state.test.ts src/modules/bookshelf.ts main.js && git -C /e/1/Juno/nexus-plugin commit -m "test: lock epub file-path state contract"
```

### Task 3: Final verification and installed-plugin replacement

**Files:**
- Test: `__tests__/epub-reader-state.test.ts`
- Modify: none

- [ ] **Step 1: Run the EPUB regression test suite**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npx esbuild __tests__/epub-reader-state.test.ts --bundle --platform=node --format=cjs --outfile=.tmp-tests/epub-reader-state.test.cjs && node --test .tmp-tests/epub-reader-state.test.cjs
```

Expected: PASS with all EPUB state tests green.

- [ ] **Step 2: Run the production build again**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npm run build
```

Expected: build succeeds and updates `main.js`.

- [ ] **Step 3: Replace the installed plugin files in the active vault**

Run:
```bash
cp /e/1/Juno/nexus-plugin/main.js '/e/笔记/笔记/.obsidian/plugins/nexus/main.js' && cp /e/1/Juno/nexus-plugin/manifest.json '/e/笔记/笔记/.obsidian/plugins/nexus/manifest.json' && cp /e/1/Juno/nexus-plugin/styles.css '/e/笔记/笔记/.obsidian/plugins/nexus/styles.css'
```

Expected: files copy successfully with no output.

- [ ] **Step 4: Manual verification in Obsidian**

Check these behaviors:

```text
1. Open Nexus and click an EPUB from the bookshelf.
2. Confirm the reader view opens with book content instead of a blank page.
3. Close the reader and reopen the same EPUB.
4. Confirm it still renders content.
5. Temporarily force an invalid filePath state (or open a missing file via a crafted state) and confirm the view shows an explicit error message instead of staying blank.
6. Read for at least 5 seconds, close the reader, and confirm reading stats still accumulate.
```

- [ ] **Step 5: Inspect git status for only intended changes**

Run:
```bash
git -C /e/1/Juno/nexus-plugin status --short
```

Expected: only intended EPUB fix files, docs, tests, and bundled `main.js` changes appear.
