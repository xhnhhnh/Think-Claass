/**
 * The 智选 rule - a pure, deterministic ranking function.
 *
 * ## Why this is a separate file from the service
 *
 * It has no `ctx`, no repository and no clock of its own: callers hand it plain data and it returns
 * plain data. Three things follow, and all three are the reason it is written this way.
 *
 *   1. **It is testable without a database.** The factor arithmetic is the part most likely to be
 *      wrong and least likely to be noticed (a set that is merely mediocre looks fine), so the
 *      tests for it must not need a seeded kernel.
 *   2. **It is reproducible.** The same input produces the same set, in the same order, forever:
 *      integer weights, one stable tie-break, and no randomness anywhere. A practice set that
 *      varies run to run is one a student cannot resume and a teacher cannot review.
 *   3. **It is the fallback that makes the AI half optional.** A deployment with no model configured
 *      is not a degraded feature - it is this function, which is why the whole surface works with
 *      `ai_provider=mock`.
 *
 * ## The one thing a model is allowed to do
 *
 * Reorder these candidates and rewrite their reasons. It can never add a question, because the
 * candidate list is this function's output and the parser drops anything outside it - the same
 * invariant `normaliseCandidateQuestion` enforces for AI 出题, and for the same reason: a model must
 * not be able to put a question in front of a class that no rule would have admitted.
 *
 * ## The factors
 *
 *   | Factor         | Weight                                                        |
 *   | -------------- | ------------------------------------------------------------- |
 *   | masteryGap     | `round((1 - mastery) * 30)` for a question the student missed  |
 *   | repeatMiss     | `min(3, wrongCount) * 8` for a question the student missed     |
 *   | weakNode       | `(importance ?? 3) * 4 + min(5, nodeWrongCount)` for its best  |
 *   |                | matching weak node, 0 when the candidate touches none          |
 *   | difficultyFit  | `-abs((difficulty ?? 3) - target) * 6`                         |
 *   | freshness      | `+4` for a question the student has never got wrong            |
 *
 * Every weight is an integer and every term is bounded, so scores compare exactly and a factor's
 * contribution can be printed without rounding surprises. The weights are a product judgement, not a
 * derivation - they are here, in one table, so changing one is a reviewable edit rather than a
 * hunt through the code.
 *
 * `weakNode` takes the *best* matching node rather than summing over all of them: a question filed
 * under four nodes, three of which the student has never touched, is not four times as urgent as one
 * filed under a single weak node.
 */

import type {
  EngineCandidate,
  EngineInput,
  EngineWeakNode,
  EngineWrongSignal,
  RankedCandidate,
} from './ai-study.types.js';

/** Bumped whenever the ranking below changes shape; stored on every set. */
export const ENGINE_VERSION = 1;

/** Items per set: five is one sitting, and the ceiling stops a caller asking for a paper. */
export const SET_SIZE_DEFAULT = 5;
export const SET_SIZE_MIN = 1;
export const SET_SIZE_MAX = 10;

/**
 * No single question type may fill more than this share of a set.
 *
 * A "personalised" set of five single-choice questions is a worse answer than a mixed four, even when
 * the five score higher: variety is part of what practice is for. The cap is a repair pass over the
 * scored order (see `applyTypeBalance`), not a scoring term, because a term would trade accuracy for
 * variety in cases where the student genuinely only needs one type.
 */
const TYPE_SHARE_MAX = 0.6;

/** The neutral difficulty, used when a question (or the student's history) has no value for it. */
const DIFFICULTY_NEUTRAL = 3;

const FACTOR_WEIGHT = {
  masteryGap: 30,
  repeatMiss: 8,
  repeatMissCap: 3,
  weakNodeImportance: 4,
  weakNodeCountCap: 5,
  difficultyFit: 6,
  freshness: 4,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The requested size, clamped. A caller asking for 0 or 500 gets a real practice set, not an error. */
export function clampSize(size: unknown): number {
  const numeric = Number(size);
  if (!Number.isFinite(numeric)) return SET_SIZE_DEFAULT;
  return clamp(Math.floor(numeric), SET_SIZE_MIN, SET_SIZE_MAX);
}

/**
 * The difficulty this student should be working at.
 *
 * Derived from graded objective answers across all their papers, because that is the only
 * difficulty-adjacent number the system already holds. `total: 0` is "no data" and answers the
 * neutral 3 - deliberately not the lowest band, which would start every new student on the easiest
 * questions in the bank and read as "智学 only gives me easy work".
 */
export function targetDifficulty(accuracy: { correct: number; total: number }): number {
  if (!accuracy || accuracy.total <= 0) return DIFFICULTY_NEUTRAL;
  const rate = accuracy.correct / accuracy.total;
  if (rate >= 0.8) return 4;
  if (rate >= 0.6) return 3;
  return 2;
}

/** questionId -> the wrong-question row for it. */
function indexWrong(rows: EngineWrongSignal[]): Map<number, EngineWrongSignal> {
  const index = new Map<number, EngineWrongSignal>();
  for (const row of rows) index.set(row.questionId, row);
  return index;
}

/** nodeId -> the weak node. */
function indexWeakNodes(rows: EngineWeakNode[]): Map<number, EngineWeakNode> {
  const index = new Map<number, EngineWeakNode>();
  for (const row of rows) index.set(row.nodeId, row);
  return index;
}

interface Scored {
  candidate: EngineCandidate;
  score: number;
  factors: Record<string, number>;
  /** The factor that contributed most, kept so the reason can be written from it. */
  driver: string;
  driverNode: EngineWeakNode | null;
  wrong: EngineWrongSignal | null;
}

/**
 * Score one candidate.
 *
 * Split out from the ranking loop so the arithmetic is readable in one screen and so a test can ask
 * "what does *this* candidate score" without constructing a pool.
 */
function scoreCandidate(
  candidate: EngineCandidate,
  wrong: EngineWrongSignal | null,
  weakNodes: Map<number, EngineWeakNode>,
  target: number,
): Scored {
  const factors: Record<string, number> = {};

  // 1. A question the student has already missed is the strongest signal there is: mastery is the
  //    system's own record of "not learned yet", and re-practising a miss is what 错题本 is for.
  factors.masteryGap = wrong
    ? Math.round((1 - clamp(wrong.masteryScore, 0, 1)) * FACTOR_WEIGHT.masteryGap)
    : 0;

  // 2. How many times they have missed it. Capped, because the fourth miss is not evidence of
  //    anything the third was not, and an uncapped term would let one old question dominate a set.
  factors.repeatMiss = wrong
    ? Math.min(FACTOR_WEIGHT.repeatMissCap, Math.max(0, wrong.wrongCount)) * FACTOR_WEIGHT.repeatMiss
    : 0;

  // 3. The knowledge node behind it. Takes the single best matching weak node - see the header.
  let bestNode: EngineWeakNode | null = null;
  let bestNodeScore = 0;
  for (const nodeId of candidate.nodeIds) {
    const node = weakNodes.get(nodeId);
    if (!node) continue;
    const score =
      (node.importance ?? DIFFICULTY_NEUTRAL) * FACTOR_WEIGHT.weakNodeImportance +
      Math.min(FACTOR_WEIGHT.weakNodeCountCap, Math.max(0, node.wrongCount));
    if (score > bestNodeScore) {
      bestNodeScore = score;
      bestNode = node;
    }
  }
  factors.weakNode = bestNodeScore;

  // 4. Difficulty fit. Negative by construction (it is a distance), so the printed breakdown reads
  //    as "this cost you 6 points", which is what it is.
  const difficulty = candidate.difficulty ?? DIFFICULTY_NEUTRAL;
  factors.difficultyFit = -Math.abs(difficulty - target) * FACTOR_WEIGHT.difficultyFit;

  // 5. A question the student has never got wrong is worth introducing rather than avoiding: a set
  //    built only from the 错题本 never tests anything the book does not already know about.
  factors.freshness = wrong ? 0 : FACTOR_WEIGHT.freshness;

  const score =
    factors.masteryGap + factors.repeatMiss + factors.weakNode + factors.difficultyFit + factors.freshness;

  // The driver is the largest *magnitude*, so a large negative difficulty penalty never masquerades
  // as a reason to include a question.
  const magnitudes: Array<[string, number]> = [
    ['masteryGap', factors.masteryGap],
    ['repeatMiss', factors.repeatMiss],
    ['weakNode', factors.weakNode],
    ['freshness', factors.freshness],
  ];
  if (Math.abs(factors.difficultyFit) > 0) magnitudes.push(['difficultyFit', Math.abs(factors.difficultyFit)]);

  let driver = 'fallback';
  let driverValue = 0;
  for (const [name, value] of magnitudes) {
    if (value > driverValue) {
      driverValue = value;
      driver = name;
    }
  }

  return { candidate, score, factors, driver, driverNode: bestNode, wrong };
}

/**
 * Write the student-facing reason from the factor that actually put the question in the set.
 *
 * This is the whole difference between "a recommendation" and "a number": the reason quotes the
 * number it was chosen for (the miss count, the mastery, the node name), so a student can disagree
 * with it, and a teacher can see the rule is not arbitrary. Nothing here is written by a model, which
 * is why the unconfigured deployment still has reasons to show.
 */
function reasonFor(scored: Scored): string {
  const { driver, driverNode, wrong, candidate } = scored;
  const accuracy = Math.round(clamp(wrong ? wrong.masteryScore : 0, 0, 1) * 100);

  switch (driver) {
    case 'masteryGap':
      return `这道题你错过 ${wrong?.wrongCount ?? 1} 次，掌握度 ${accuracy}%，再练一遍最有效。`;
    case 'repeatMiss':
      return `这道题反复出错（${wrong?.wrongCount ?? 1} 次），需要重新巩固。`;
    case 'weakNode':
      return driverNode
        ? `知识点「${driverNode.name}」是你的薄弱项，这个班这一块错得比较多。`
        : '这道题属于你的薄弱知识点。';
    case 'freshness':
      return candidate.difficulty === null
        ? '这道题你还没做过，用来检验一下这个知识点。'
        : `这道题你还没做过，难度 ${candidate.difficulty}，用来检验一下这个知识点。`;
    case 'difficultyFit':
      return `难度 ${candidate.difficulty ?? DIFFICULTY_NEUTRAL} 接近你现在的水平，适合当成练习。`;
    default:
      return '按你当前的掌握情况为你挑选。';
  }
}

/**
 * Keep any one type from filling the whole set.
 *
 * A repair pass rather than a scoring term: the scored order is already the best answer to "what
 * should this student practise", and variety is a *constraint* on that answer, not a competing
 * objective. Candidates displaced by the cap go into a reserve and are used only if the capped pass
 * cannot fill the set - so a bank that holds nothing but single-choice questions still produces a
 * set instead of an empty one.
 */
function applyTypeBalance(ranked: Scored[], size: number): Scored[] {
  const perTypeMax = Math.max(1, Math.ceil(size * TYPE_SHARE_MAX));
  const taken: Scored[] = [];
  const counts = new Map<string, number>();
  const reserve: Scored[] = [];

  for (const entry of ranked) {
    if (taken.length >= size) break;
    const used = counts.get(entry.candidate.type) ?? 0;
    if (used >= perTypeMax) {
      reserve.push(entry);
      continue;
    }
    counts.set(entry.candidate.type, used + 1);
    taken.push(entry);
  }

  for (const entry of reserve) {
    if (taken.length >= size) break;
    taken.push(entry);
  }

  return taken;
}

/**
 * Rank a candidate pool into a practice set.
 *
 * The order is: score descending, then question id ascending. The id tie-break is not decoration -
 * without it two candidates with equal scores would come out in whatever order the database's
 * `SELECT` happened to produce, and "the same request gives the same set" would be false.
 */
export function rankCandidates(input: EngineInput): RankedCandidate[] {
  const size = clampSize(input.size);
  const excluded = new Set(input.excludeQuestionIds);
  const wrongIndex = indexWrong(input.wrongQuestions ?? []);
  const weakNodeIndex = indexWeakNodes(input.weakNodes ?? []);
  const target = targetDifficulty(input.accuracy);

  const scored: Scored[] = [];
  for (const candidate of input.candidates) {
    if (excluded.has(candidate.questionId)) continue;
    scored.push(scoreCandidate(candidate, wrongIndex.get(candidate.questionId) ?? null, weakNodeIndex, target));
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.candidate.questionId - b.candidate.questionId;
  });

  return applyTypeBalance(scored, size).map((entry) => ({
    questionId: entry.candidate.questionId,
    type: entry.candidate.type,
    difficulty: entry.candidate.difficulty,
    points: entry.candidate.points,
    score: entry.score,
    factors: entry.factors,
    reason: reasonFor(entry),
  }));
}
