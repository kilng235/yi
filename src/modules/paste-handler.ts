import { App } from "obsidian";
import { saveImageFromBlob, buildWikilink } from "./attachment-store";

interface PasteHandlerOptions {
  app: App;
  noteId: string;
  textarea: HTMLTextAreaElement;
  onSaved?: () => void;
}

interface PasteHandlerHandle {
  detach: () => void;
}

export function attachImagePasteHandler(opts: PasteHandlerOptions): PasteHandlerHandle {
  const { app, noteId, textarea, onSaved } = opts;

  const onPaste = async (e: ClipboardEvent) => {
    const clipboard = e.clipboardData;
    if (!clipboard) return;

    const imageItems: DataTransferItem[] = [];
    for (const item of Array.from(clipboard.items)) {
      if (item.type && item.type.startsWith("image/")) {
        imageItems.push(item);
      }
    }
    if (imageItems.length === 0) return;

    e.preventDefault();

    const wikilinks: string[] = [];
    for (const item of imageItems) {
      const blob = item.getAsFile();
      if (!blob) continue;
      try {
        const filePath = await saveImageFromBlob(app, noteId, blob);
        if (filePath) wikilinks.push(buildWikilink(filePath));
      } catch (err) {
        console.error("Hubstack: paste image save failed", err);
      }
    }

    if (wikilinks.length === 0) return;

    const insertText = wikilinks.join("\n");
    insertAtCursor(textarea, insertText);

    if (onSaved) onSaved();
  };

  textarea.addEventListener("paste", onPaste);

  return {
    detach: () => textarea.removeEventListener("paste", onPaste),
  };
}

function insertAtCursor(textarea: HTMLTextAreaElement, text: string): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);

  const needNewlineBefore = before.length > 0 && !before.endsWith("\n");
  const needNewlineAfter = after.length > 0 && !after.startsWith("\n");

  const parts: string[] = [];
  if (needNewlineBefore) parts.push("\n");
  parts.push(text);
  if (needNewlineAfter) parts.push("\n");
  const insert = parts.join("");

  textarea.value = before + insert + after;
  const cursor = start + insert.length;
  textarea.selectionStart = cursor;
  textarea.selectionEnd = cursor;

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
