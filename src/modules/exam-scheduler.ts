import { ExamQuestion } from "./exam-parser";
import { ExamData } from "./exam-stats";

/**
 * 错题驱动的智能出题队列。
 *
 * 权重规则：
 *  - 上次答错的题：+4（优先重现）
 *  - 累计答错次数：每次 +1（最多 +3）
 *  - 新题（从未作答）：+1.5（保证新内容不断进入）
 *  - 考点错误率：错误率 × 3（薄弱考点的所有题都加权 → "根据错题出类似题"）
 *  - 已掌握的题：+0.5（低频维持记忆）
 */
export function buildSmartQueue(
  questions: ExamQuestion[],
  data: ExamData,
  size: number
): ExamQuestion[] {
  const topicWrongRate = new Map<string, number>();
  const topicAgg = new Map<string, { c: number; w: number }>();
  for (const q of questions) {
    if (!q.topic) continue;
    const h = data.questionHistory[q.id];
    const agg = topicAgg.get(q.topic) ?? { c: 0, w: 0 };
    if (h) {
      agg.c += h.correct;
      agg.w += h.wrong;
    }
    topicAgg.set(q.topic, agg);
  }
  for (const [topic, { c, w }] of topicAgg) {
    if (c + w > 0) topicWrongRate.set(topic, w / (c + w));
  }

  const weighted = questions.map((q) => {
    const h = data.questionHistory[q.id];
    let weight = 1;
    if (h) {
      if (h.lastCorrect === false) weight += 4;
      weight += Math.min(3, h.wrong);
      if (h.lastCorrect !== false) weight += 0.5;
    } else {
      weight += 1.5;
    }
    const wr = q.topic ? topicWrongRate.get(q.topic) : undefined;
    if (wr !== undefined) weight += wr * 3;
    return { q, weight };
  });

  // 加权无放回抽样
  const pool = [...weighted];
  const picked: ExamQuestion[] = [];
  const target = Math.min(size, questions.length);
  while (picked.length < target && pool.length > 0) {
    const total = pool.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    picked.push(pool[idx].q);
    pool.splice(idx, 1);
  }
  return picked;
}

/** 错题重做队列：上次作答为错的题 */
export function buildWrongRedoQueue(
  questions: ExamQuestion[],
  data: ExamData
): ExamQuestion[] {
  return questions.filter((q) => data.questionHistory[q.id]?.lastCorrect === false);
}
