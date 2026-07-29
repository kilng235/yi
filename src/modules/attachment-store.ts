import { App, TFile } from "obsidian";

const IMAGES_DIR = "hubstack/notes-images";

const IMAGE_EXT_RE = /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)$/i;

const WIKILINK_RE = /^!\[\[([^\]]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|avif))\]\]/i;

export function isImageWikilinkLine(line: string): boolean {
  return WIKILINK_RE.test(line.trim());
}

export function extractImageWikilinks(body: string): string[] {
  const paths: string[] = [];
  const lines = body.split("\n");
  for (const line of lines) {
    const m = line.trim().match(WIKILINK_RE);
    if (m) paths.push(m[1]);
  }
  return paths;
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXT_RE.test(path);
}

async function ensureDir(app: App): Promise<void> {
  try {
    const exists = await app.vault.adapter.exists(IMAGES_DIR);
    if (!exists) await app.vault.createFolder(IMAGES_DIR);
  } catch (e) {
    console.error("Hubstack: failed to ensure notes-images dir", e);
  }
}

function timestampStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function extFromType(type: string): string {
  const m = type.match(/image\/(\w+)/);
  if (!m) return "png";
  const sub = m[1].toLowerCase();
  if (sub === "jpeg") return "jpg";
  return sub;
}

export async function saveImage(
  app: App,
  noteId: string,
  buffer: ArrayBuffer,
  ext: string
): Promise<string> {
  await ensureDir(app);
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "png";
  const fileName = `${noteId}-${timestampStr()}.${safeExt}`;
  const filePath = `${IMAGES_DIR}/${fileName}`;
  try {
    if (await app.vault.adapter.exists(filePath)) {
      return filePath;
    }
    await app.vault.adapter.writeBinary(filePath, buffer);
    return filePath;
  } catch (e) {
    console.error("Hubstack: failed to write image file", e);
    return "";
  }
}

export async function saveImageFromBlob(
  app: App,
  noteId: string,
  blob: Blob
): Promise<string> {
  const ext = extFromType(blob.type);
  const buffer = await blob.arrayBuffer();
  return saveImage(app, noteId, buffer, ext);
}

export async function deleteImage(app: App, path: string): Promise<void> {
  try {
    if (await app.vault.adapter.exists(path)) {
      await app.vault.adapter.remove(path);
    }
  } catch (e) {
    console.warn("Hubstack: failed to delete image", path, e);
  }
}

export async function deleteImagesFromBody(app: App, body: string): Promise<void> {
  const paths = extractImageWikilinks(body);
  for (const p of paths) {
    await deleteImage(app, p);
  }
}

export function buildWikilink(filePath: string): string {
  return `![[${filePath}]]`;
}

export function resolveImageFile(app: App, path: string): TFile | null {
  return app.vault.getFileByPath(path);
}
