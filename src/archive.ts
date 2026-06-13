import { App } from "obsidian";
import { KanbanCard } from "./types";

function getArchivePath(dateStr: string): string {
  const [year, month] = dateStr.split("-");
  return `hubstack/archive/${year}-${month}.md`;
}

async function readFile(app: App, path: string): Promise<string> {
  try {
    const exists = await app.vault.adapter.exists(path);
    if (!exists) return "";
    return await app.vault.adapter.read(path);
  } catch {
    return "";
  }
}

async function ensureArchiveDir(app: App): Promise<void> {
  try {
    const exists = await app.vault.adapter.exists("hubstack/archive");
    if (!exists) {
      await app.vault.createFolder("hubstack/archive");
    }
  } catch (e) {
    console.error("Hubstack: failed to create archive directory", e);
  }
}

/**
 * Build a multi-line archive block preserving full card information.
 */
function buildArchiveEntry(card: KanbanCard, columnName: string): string {
  const lines: string[] = [];
  lines.push(`### ${card.title}`);
  lines.push(`type: ${card.type}`);
  if (card.createdAt) lines.push(`date: ${card.createdAt}`);
  lines.push(`completed: ${card.completedAt}`);
  if (card.tags.length) lines.push(`tags: ${card.tags.join(", ")}`);
  lines.push(`source: ${columnName}`);
  lines.push(`<!-- ${card.id} -->`);
  lines.push("");
  for (const task of card.tasks) {
    lines.push(`- [${task.checked ? "x" : " "}] ${task.text}`);
  }
  if (card.body) {
    if (card.tasks.length) lines.push("");
    lines.push(card.body);
  }
  lines.push("");
  return lines.join("\n");
}

export async function appendToArchive(
  app: App,
  card: KanbanCard,
  columnName: string
): Promise<boolean> {
  if (!card.completedAt || !card.id) return false;
  await ensureArchiveDir(app);
  const archivePath = getArchivePath(card.completedAt);
  const cardMarker = `<!-- ${card.id} -->`;
  let content = await readFile(app, archivePath);
  if (content.includes(cardMarker)) return false;

  const entry = buildArchiveEntry(card, columnName);
  const dateSection = `## ${card.completedAt}`;
  const dateIndex = content.indexOf(dateSection);

  if (dateIndex !== -1) {
    const afterHeading = dateIndex + dateSection.length;
    const nlIndex = content.indexOf("\n", afterHeading);
    const insertPos = nlIndex !== -1 ? nlIndex + 1 : content.length;
    content = content.slice(0, insertPos) + entry + content.slice(insertPos);
  } else {
    content += `\n${dateSection}\n\n${entry}`;
  }

  try {
    const exists = await app.vault.adapter.exists(archivePath);
    if (exists) {
      await app.vault.adapter.write(archivePath, content);
    } else {
      const monthYear = card.completedAt.substring(0, 7);
      const header = `# ${monthYear} 完成事项\n`;
      await app.vault.adapter.write(archivePath, header + content);
    }
  } catch (e) {
    console.error("Hubstack: failed to write archive entry", e);
    return false;
  }
  return true;
}
