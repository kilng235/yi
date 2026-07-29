import { App } from "obsidian";
import { isImageWikilinkLine, resolveImageFile } from "./attachment-store";

const WIKILINK_RE = /^!\[\[([^\]]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|avif))\]\]/i;

export function renderBody(
  container: HTMLElement,
  body: string,
  app: App,
  opts: { cls?: string; maxImageWidth?: number } = {}
): void {
  const cls = opts.cls || "hubstack-note-card-body";
  const lines = body.split("\n");
  let textBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length === 0) return;
    const text = textBuffer.join("\n");
    textBuffer = [];
    if (text.trim()) {
      container.createDiv({ cls: `${cls}-text`, text });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(WIKILINK_RE);
    if (m) {
      flushText();
      const path = m[1];
      const file = resolveImageFile(app, path);
      if (file) {
        const url = app.vault.getResourcePath(file);
        const img = container.createEl("img", { cls: `${cls}-img` });
        img.src = url;
        img.loading = "lazy";
        if (opts.maxImageWidth) {
          img.style.maxWidth = `${opts.maxImageWidth}px`;
        }
      } else {
        container.createDiv({
          cls: `${cls}-img-missing`,
          text: `[图片缺失: ${path}]`,
        });
      }
    } else {
      textBuffer.push(line);
    }
  }
  flushText();
}

export function bodyHasImages(body: string): boolean {
  return body.split("\n").some((l) => isImageWikilinkLine(l));
}

export function bodyPlainText(body: string): string {
  return body
    .split("\n")
    .filter((l) => !isImageWikilinkLine(l))
    .join("\n")
    .trim();
}
