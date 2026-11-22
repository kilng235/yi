import { App, TFile } from "obsidian";

export interface QuizOption {
  key: string;
  text: string;
}

export interface ExamQuestion {
  id: string;
  deck: string;
  source: string;
  stem: string;
  options: QuizOption[];
  /** 单选：["A"]；多选：["A","B","C"]，按文件书写顺序 */
  answer: string[];
  explanation: string;
  topic?: string;
}

const OPTION_RE = /^-\s*([A-D])[\.、．]\s*(.+)$/;
// 多选答案：A 或 A,B 或 A、B 或 A，B；分隔符支持 , / ， / 、
const ANSWER_RE = /^\*{0,2}正确答案\*{0,2}\s*[:：]\s*\**\s*([A-D](?:\s*[,，、]\s*[A-D])*)\s*\**\s*$/;
const TOPIC_RE = /^\*{0,2}考点\*{0,2}\s*[:：]\s*(.+?)\s*$/;

export function isMultiChoice(answer: string[]): boolean {
  return answer.length > 1;
}

function frontmatterTags(fm: unknown): string[] {
  if (!fm || typeof fm !== "object") return [];
  const t = (fm as Record<string, unknown>).tags ?? (fm as Record<string, unknown>).tag;
  if (Array.isArray(t)) return t.map(String);
  if (typeof t === "string") return t.split(/[,\s]+/);
  return [];
}

interface ParseBlockResult {
  question?: ExamQuestion;
  malformed?: boolean;
}

function parseBlock(
  block: string,
  deck: string,
  source: string,
  id: string
): ParseBlockResult {
  const lines = block
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return {};

  const optionIdx = lines.findIndex((l) => OPTION_RE.test(l));
  const answerIdx = lines.findIndex((l) => ANSWER_RE.test(l));

  if (optionIdx === -1 && answerIdx === -1) return {};
  if (optionIdx === -1 || answerIdx === -1) return { malformed: true };

  const stem = lines.slice(0, optionIdx).join("\n").trim();

  const options: QuizOption[] = [];
  for (let i = optionIdx; i < lines.length; i++) {
    const m = lines[i].match(OPTION_RE);
    if (!m) break;
    options.push({ key: m[1], text: m[2].trim() });
  }

  const answerMatch = lines[answerIdx].match(ANSWER_RE);
  const rawAnswers = answerMatch![1].split(/[,，、]/).map((s) => s.trim().toUpperCase());
  // 去重但保留首次出现顺序
  const answer = rawAnswers.filter((v, i, arr) => arr.indexOf(v) === i);

  // 可选的「考点」行：计入 topic，并从解析中剔除
  let topic: string | undefined;
  const explanationLines: string[] = [];
  for (let i = answerIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(TOPIC_RE);
    if (m && topic === undefined) {
      topic = m[1].replace(/^\*\*|\*\*$/g, "").trim();
      continue;
    }
    explanationLines.push(lines[i]);
  }
  const explanation = explanationLines.join("\n").trim();

  const keys = options.map((o) => o.key);
  const valid =
    stem.length > 3 &&
    options.length === 4 &&
    ["A", "B", "C", "D"].every((k) => keys.includes(k)) &&
    answer.length > 0 &&
    answer.every((a) => keys.includes(a));
  if (!valid) return { malformed: true };

  return { question: { id, deck, source, stem, options, answer, explanation, topic } };
}

export async function parseVaultQuestions(app: App, folder: string): Promise<ExamQuestion[]> {
  const questions: ExamQuestion[] = [];
  const prefix = folder.replace(/\/+$/, "") + "/";
  const files = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    const tags = frontmatterTags(fm).map((t) => t.toLowerCase());
    if (!tags.includes("quiz")) continue;

    const deck = String(
      (fm as Record<string, unknown>)?.deck ??
        (fm as Record<string, unknown>)?.subject ??
        file.parent?.name ??
        "未分组"
    );
    const source = String((fm as Record<string, unknown>)?.source ?? file.basename);

    const content = await app.vault.read(file);
    const body = content.replace(/^---\n[\s\S]*?\n---\n/, "");
    const blocks = body.split(/^---\s*$/m);

    let seq = 0;
    blocks.forEach((block, idx) => {
      const { question, malformed } = parseBlock(block, deck, source, `${file.path}#${seq}`);
      if (question) {
        question.id = `${file.path}#${seq}`;
        seq += 1;
        questions.push(question);
      } else if (malformed) {
        console.warn(
          `[hubstack-exam] 跳过格式异常的题块：${file.path} 第 ${idx + 1} 块（缺少题干/4 个选项/正确答案之一）`
        );
      }
    });
  }

  return questions;
}

export function groupByDeck(questions: ExamQuestion[]): Map<string, ExamQuestion[]> {
  const decks = new Map<string, ExamQuestion[]>();
  for (const q of questions) {
    const list = decks.get(q.deck);
    if (list) list.push(q);
    else decks.set(q.deck, [q]);
  }
  return decks;
}

export function isQuizNote(file: TFile, app: App): boolean {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  return frontmatterTags(fm)
    .map((t) => t.toLowerCase())
    .includes("quiz");
}
