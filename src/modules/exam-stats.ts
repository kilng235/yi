import { App, TFile, normalizePath } from "obsidian";
import { ExamQuestion } from "./exam-parser";

// ===== 数据结构 =====

export interface ExamWrongEntry {
  deck: string;
  stem: string;
  /** 单选：["A"]；多选：["A","B","C"] */
  correct: string[];
  yourAnswer: string[];
  ts: string;
}

export interface ExamDeckStat {
  answered: number;
  correct: number;
  wrong: number;
  lastSession: string;
}

export interface ExamQuestionHistory {
  seen: number;
  correct: number;
  wrong: number;
  lastCorrect?: boolean;
  lastTs: string;
}

export interface ExamDailyStat {
  answered: number;
  correct: number;
}

export interface ExamData {
  version: number;
  decks: Record<string, ExamDeckStat>;
  recentWrong: ExamWrongEntry[];
  questionHistory: Record<string, ExamQuestionHistory>;
  daily: Record<string, ExamDailyStat>;
}

const DEFAULT_DATA: ExamData = {
  version: 2,
  decks: {},
  recentWrong: [],
  questionHistory: {},
  daily: {},
};

// ===== 存储路径（与 activity-log 同约定：vault 内 hubstack/ 目录）=====

const EXAM_STATS_PATH = "hubstack/exam-stats.json";
const LEGACY_QUIZ_DATA_PATH = ".obsidian/plugins/career-exam-quiz/data.json";

export function examTodayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// ===== 考点聚合 =====

export interface ExamTopicAgg {
  topic: string;
  correct: number;
  wrong: number;
  accuracy: number; // 0-100；-1 表示无作答
}

// ===== 答题记录写入错题本 =====

export interface ExamWrongForExport {
  q: ExamQuestion;
  picked: string;
}

export class ExamStats {
  data: ExamData = DEFAULT_DATA;
  /** 每答一题回调一次（HubstackView 用它喂活跃度热力图） */
  onQuizAnswered?: (count: number) => void;

  async load(app: App): Promise<void> {
    try {
      if (!(await app.vault.adapter.exists(EXAM_STATS_PATH))) {
        this.data = DEFAULT_DATA;
        return;
      }
      const content = await app.vault.adapter.read(EXAM_STATS_PATH);
      const raw = JSON.parse(content) as Partial<ExamData>;
      // 兼容 v1 老数据:recentWrong 项里的 correct/yourAnswer 是 string,
      // 新版 ExamQuestion.answer 改为 string[],统一迁移成数组
      const recentWrong = (raw?.recentWrong ?? []).map((w: any) => ({
        deck: String(w.deck ?? ""),
        stem: String(w.stem ?? ""),
        correct: Array.isArray(w.correct) ? w.correct : w.correct ? [String(w.correct)] : [],
        yourAnswer: Array.isArray(w.yourAnswer) ? w.yourAnswer : w.yourAnswer ? [String(w.yourAnswer)] : [],
        ts: String(w.ts ?? ""),
      }));
      this.data = {
        version: 2,
        decks: raw?.decks ?? {},
        recentWrong,
        questionHistory: raw?.questionHistory ?? {},
        daily: raw?.daily ?? {},
      };
      // 加载完立刻持久化,后续就不用再做格式判断了
      if (recentWrong.length > 0) {
        await this.save(app);
      }
    } catch (e) {
      console.warn("[hubstack-exam] exam-stats.json 损坏,已重建", e);
      this.data = DEFAULT_DATA;
    }
  }

  async save(app: App): Promise<void> {
    try {
      if (!(await app.vault.adapter.exists("hubstack"))) {
        await app.vault.createFolder("hubstack");
      }
      await app.vault.adapter.write(EXAM_STATS_PATH, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error("[hubstack-exam] 保存刷题统计失败", e);
    }
  }

  async record(app: App, deck: string, correct: boolean, question?: ExamQuestion): Promise<void> {
    const stat =
      this.data.decks[deck] ?? { answered: 0, correct: 0, wrong: 0, lastSession: "" };
    stat.answered += 1;
    if (correct) stat.correct += 1;
    else stat.wrong += 1;
    stat.lastSession = new Date().toISOString();
    this.data.decks[deck] = stat;

    const key = examTodayKey();
    const daily = this.data.daily[key] ?? { answered: 0, correct: 0 };
    daily.answered += 1;
    if (correct) daily.correct += 1;
    this.data.daily[key] = daily;

    if (question) {
      const h =
        this.data.questionHistory[question.id] ??
        { seen: 0, correct: 0, wrong: 0, lastTs: "" };
      h.seen += 1;
      if (correct) h.correct += 1;
      else h.wrong += 1;
      h.lastCorrect = correct;
      h.lastTs = new Date().toISOString();
      this.data.questionHistory[question.id] = h;
    }

    await this.save(app);
    this.onQuizAnswered?.(1);
  }

  async addWrong(app: App, entry: ExamWrongEntry): Promise<void> {
    this.data.recentWrong.unshift(entry);
    if (this.data.recentWrong.length > 50) this.data.recentWrong.length = 50;
    await this.save(app);
  }

  topicAggregates(questions: ExamQuestion[]): ExamTopicAgg[] {
    const map = new Map<string, { correct: number; wrong: number }>();
    for (const q of questions) {
      if (!q.topic) continue;
      const h = this.data.questionHistory[q.id];
      const agg = map.get(q.topic) ?? { correct: 0, wrong: 0 };
      if (h) {
        agg.correct += h.correct;
        agg.wrong += h.wrong;
      }
      map.set(q.topic, agg);
    }
    return [...map.entries()]
      .map(([topic, { correct, wrong }]) => {
        const total = correct + wrong;
        return {
          topic,
          correct,
          wrong,
          accuracy: total > 0 ? Math.round((correct / total) * 100) : -1,
        };
      })
      .sort((a, b) => {
        if (a.accuracy < 0) return 1;
        if (b.accuracy < 0) return -1;
        return a.accuracy - b.accuracy;
      });
  }
}

/** 一次性迁移：读取旧 career-exam-quiz 插件的 data.json 作为初始数据 */
export async function migrateLegacyExamData(app: App, stats: ExamStats): Promise<boolean> {
  try {
    if (await app.vault.adapter.exists(EXAM_STATS_PATH)) return false;
    if (!(await app.vault.adapter.exists(LEGACY_QUIZ_DATA_PATH))) return false;
    const content = await app.vault.adapter.read(LEGACY_QUIZ_DATA_PATH);
    const raw = JSON.parse(content) as Partial<ExamData>;
    if (!raw) return false;
    stats.data = {
      version: 2,
      decks: raw.decks ?? {},
      recentWrong: raw.recentWrong ?? [],
      questionHistory: raw.questionHistory ?? {},
      daily: raw.daily ?? {},
    };
    await stats.save(app);
    console.info("[hubstack-exam] 已从 career-exam-quiz 迁移刷题统计");
    return true;
  } catch (e) {
    console.warn("[hubstack-exam] 迁移旧刷题统计失败，忽略", e);
    return false;
  }
}

/** 把本轮错题追加写入 06-错题本/<学科>/<日期>-错题.md */
export async function appendWrongsToVault(
  app: App,
  wrongFolder: string,
  deck: string,
  wrongs: ExamWrongForExport[]
): Promise<void> {
  const folder = normalizePath(`${wrongFolder}/${deck}`);
  if (!app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder);
  }

  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const path = normalizePath(`${folder}/${dateStr}-错题.md`);

  const body = wrongs
    .map(({ q, picked }) => {
      const lines = [
        q.stem,
        ...q.options.map((o) => `- ${o.key}. ${o.text}`),
        `**正确答案**: ${q.answer.join(",")}`,
        `**我的答案**: ${picked.join(",")}`,
      ];
      if (q.topic) lines.splice(1, 0, `**考点**: ${q.topic}`);
      if (q.explanation) {
        lines.push(`> ${q.explanation.replace(/\n/g, "\n> ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n---\n\n");

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.process(existing, (data) => `${data}\n\n---\n\n${body}\n`);
  } else {
    await app.vault.create(path, `# ${dateStr} 错题本 · ${deck}\n\n${body}\n`);
  }
}
