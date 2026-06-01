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
