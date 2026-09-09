import { HubstackPlugin } from "../main";
import { ExamQuestion, groupByDeck } from "./exam-parser";
import { buildSmartQueue, buildWrongRedoQueue } from "./exam-scheduler";
import { ExamStats, ExamWrongForExport, examTodayKey } from "./exam-stats";
import { ExamQuizModal } from "./exam-quiz-modal";

/**
 * 备考页签：把原 career-exam-quiz 工作台以 hubstack section 风格渲染。
 * 结构：今日刷题 → 学科刷题 → 薄弱考点 → 最近错题 → 刷题统计
 */
export async function renderExamTab(
  container: HTMLElement,
  plugin: HubstackPlugin,
  onRoundEnd: () => void
): Promise<void> {
  container.empty();
  container.addClass("hubstack-exam");

  const app = plugin.app;
  const bank = await plugin.loadExamBank();
  plugin.seedExamHistoryFromBank(bank);
  const stats = plugin.examStats;
  const data = stats.data;

  const daily = data.daily[examTodayKey()] ?? { answered: 0, correct: 0 };
  const redoQueue = buildWrongRedoQueue(bank, data);
  const decks = groupByDeck(bank);

  // ===== 今日刷题 =====
  const todayBody = examSection(container, "今日刷题", "red");
  const cards = todayBody.createDiv("hubstack-exam-cards");
  statCard(cards, String(bank.length), "题库总量");
  statCard(cards, String(daily.answered), "今日已答");
  statCard(
    cards,
    daily.answered > 0 ? `${Math.round((daily.correct / daily.answered) * 100)}%` : "—",
    "今日正确率"
  );
  statCard(cards, String(redoQueue.length), "待重做错题");

  // 最近 7 天迷你柱状图
  const chart = todayBody.createDiv("hubstack-exam-chart");
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push(examTodayKey(new Date(Date.now() - i * 86400000)));
  }
  const maxAnswered = Math.max(1, ...days.map((d) => data.daily[d]?.answered ?? 0));
  for (const d of days) {
    const s = data.daily[d];
    const col = chart.createDiv("hubstack-exam-chart-col");
    const barWrap = col.createDiv("hubstack-exam-chart-barwrap");
    if (s && s.answered > 0) {
      const bar = barWrap.createDiv("hubstack-exam-chart-bar");
      bar.style.height = `${Math.max(8, (s.answered / maxAnswered) * 100)}%`;
      bar.title = `${d}：${s.answered} 题 / 正确 ${s.correct}`;
    }
    col.createSpan({ text: d.slice(5), cls: "hubstack-exam-chart-label" });
  }

  if (bank.length === 0) {
    todayBody.createDiv({
      cls: "hubstack-exam-empty",
      text: `未在 ${plugin.settings.examQuizFolder} 找到 quiz 格式题库（frontmatter tags 需包含 quiz）`,
    });
    return;
  }

  // ===== 学科刷题 =====
  const deckBody = examSection(container, "学科刷题", "blue");
  const startQuiz = (questions: ExamQuestion[], label: string) => {
    new ExamQuizModal(app, questions, label, {
      app,
      stats,
      wrongFolder: plugin.settings.examWrongFolder,
      onFinish: onRoundEnd,
    }).open();
  };

  for (const [deck, list] of decks) {
    const stat = data.decks[deck];
    const acc =
      stat && stat.answered > 0
        ? `${Math.round((stat.correct / stat.answered) * 100)}%`
        : null;

    const row = deckBody.createDiv("hubstack-exam-deck");
    const info = row.createDiv("hubstack-exam-deck-info");
    info.createDiv({ text: deck, cls: "hubstack-exam-deck-name" });
    info.createDiv({
      text:
        `共 ${list.length} 题` +
        (stat ? ` · 累计作答 ${stat.answered} · 正确率 ${acc}` : " · 尚未作答"),
      cls: "hubstack-exam-deck-meta",
    });
    const btns = row.createDiv("hubstack-exam-deck-btns");
    const smart = btns.createEl("button", { text: "智能刷题", cls: "mod-cta" });
    smart.addEventListener("click", () => {
      const queue = buildSmartQueue(list, data, plugin.settings.examRoundSize);
      startQuiz(queue, `${deck} · 智能出题`);
    });
    const all = btns.createEl("button", { text: "顺序刷题" });
    all.addEventListener("click", () => startQuiz(list, deck));
  }

  const redoRow = deckBody.createDiv("hubstack-exam-redo-row");
  const redoBtn = redoRow.createEl("button", {
    text: redoQueue.length > 0 ? `重做错题（${redoQueue.length}）` : "重做错题",
  });
  redoBtn.disabled = redoQueue.length === 0;
  redoBtn.addEventListener("click", () => startQuiz(redoQueue, "错题重做"));

  // ===== 薄弱考点 =====
  const weakBody = examSection(container, "薄弱考点", "yellow");
  const topics = stats.topicAggregates(bank);
  const answeredTopics = topics.filter((t) => t.accuracy >= 0);
  if (answeredTopics.length === 0) {
    weakBody.createDiv({
      cls: "hubstack-exam-empty",
      text: "暂无数据 — 题库标注 **考点**: 后，刷题即自动生成弱点分析",
    });
  } else {
    for (const t of answeredTopics.slice(0, 8)) {
      weakBody.appendChild(topicRow(t.topic, t.accuracy, t.correct, t.wrong));
    }
  }

  // ===== 最近错题 =====
  const wrongBody = examSection(container, "最近错题", "green");
  if (data.recentWrong.length === 0) {
    wrongBody.createDiv({ cls: "hubstack-exam-empty", text: "还没有错题记录 🎉" });
  } else {
    for (const w of data.recentWrong.slice(0, 10)) {
      const item = wrongBody.createDiv("hubstack-exam-wrong-item");
      item.createDiv({
        text: w.stem.length > 50 ? w.stem.slice(0, 50) + "…" : w.stem,
        cls: "hubstack-exam-wrong-stem",
      });
      item.createDiv({
        text: `${w.deck} · 你的答案 ${(w.yourAnswer ?? []).join("") || "（未作答）"} → 正确答案 ${(w.correct ?? []).join("")}`,
        cls: "hubstack-exam-wrong-meta",
      });
    }
  }

  // ===== 刷题统计 =====
  const statsBody = examSection(container, "刷题统计", "blue");
  let totalAnswered = 0;
  let totalCorrect = 0;
  for (const deck of Object.values(data.decks)) {
    totalAnswered += deck.answered;
    totalCorrect += deck.correct;
  }
  statsBody.createDiv({
    text: `累计：作答 ${totalAnswered} 题 · 正确 ${totalCorrect} 题 · 总正确率 ${
      totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0
    }%`,
    cls: "hubstack-exam-deck-meta",
  });
  if (answeredTopics.length > 0) {
    for (const t of answeredTopics) {
      statsBody.appendChild(topicRow(t.topic, t.accuracy, t.correct, t.wrong));
    }
  }
}

function examSection(
  parent: HTMLElement,
  title: string,
  dot: "red" | "yellow" | "blue" | "green"
): HTMLElement {
  const sec = parent.createDiv({ cls: "hubstack-section" });
  const header = sec.createDiv({ cls: "hubstack-section-header" });
  header.createDiv({ cls: `hubstack-section-dot hubstack-section-dot--${dot}` });
  header.createEl("span", { text: title, cls: "hubstack-section-title" });
  return sec.createDiv({ cls: "hubstack-section-body" });
}

function statCard(parent: HTMLElement, value: string, label: string): void {
  const card = parent.createDiv("hubstack-exam-card");
  card.createDiv({ text: value, cls: "hubstack-exam-card-value" });
  card.createDiv({ text: label, cls: "hubstack-exam-card-label" });
}

function topicRow(
  topic: string,
  accuracy: number,
  correct: number,
  wrong: number
): HTMLElement {
  const row = document.createElement("div");
  row.className = "hubstack-exam-topic";
  const name = row.createSpan({ text: topic, cls: "hubstack-exam-topic-name" });
  name.title = topic;
  const bar = row.createDiv("hubstack-exam-topic-bar");
  bar.createDiv("hubstack-exam-topic-fill").style.width = `${accuracy}%`;
  bar.addClass(accuracy < 60 ? "is-bad" : accuracy < 85 ? "is-mid" : "is-good");
  row.createSpan({
    text: `${accuracy}%（对${correct}/错${wrong}）`,
    cls: "hubstack-exam-topic-acc",
  });
  return row;
}

// 保留类型引用，避免未来接入直接导出时报 unused
export type { ExamWrongForExport };
