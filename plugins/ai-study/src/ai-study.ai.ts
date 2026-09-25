/**
 * The optional model pass: re-rank the rule's candidates and rewrite their reasons.
 *
 * ## What a model is allowed to do here, and why the line is drawn there
 *
 * The rule engine (`ai-study.engine.ts`) decides *which* questions are in the set. The model only
 * decides what order to show them in and how to phrase why each one is there. `parseRerankReply`
 * enforces that by construction: it accepts a permutation of question ids it was given, drops
 * anything it does not recognise, appends anything the model forgot in rule order, and never
 * produces a candidate that was not already in the list.
 *
 * That split is what makes the feature honest. A model choosing questions from a bank would be
 * choosing from rows it cannot verify - the difficulty, the mastery history and the knowledge-node
 * links are all facts this system holds and a prompt only paraphrases. Ordering and explanation,
 * on the other hand, are exactly what a language model is better at than a weight table: the rule's
 * reason is a template filled from the winning factor, and a model can say the same thing in a
 * sentence a student wants to read.
 *
 * ## Failure is a result, not an exception
 *
 * Every path below returns a `RerankOutcome`. No model configured, no `homework` plugin installed, an
 * unreachable endpoint, a timeout, a reply that is prose instead of JSON - all of them leave the
 * ranked list exactly as the rule produced it and report `ai.available: false` with the line to
 * print. The caller has a complete, correct answer either way; there is nothing for a 5xx to add.
 */

import type { HomeworkAiCompletion, HomeworkAiPort } from '@thinkclass/contracts/domains/homework';
import type { AiStudyOutcome } from '@thinkclass/contracts/domains/ai-study';

import type { EngineWeakNode, RankedCandidate } from './ai-study.types.js';

/**
 * The model's deadline, whatever `ai_timeout_ms` says.
 *
 * The frontend's axios client times out at 15 s for the whole request, and the operator's default
 * `ai_timeout_ms` is 20 s - so without this ceiling a slow model would mean the browser gave up
 * first, the student saw a generic network error, and the graceful-degradation path this whole file
 * is built around would never be reached. Eight seconds is well inside the client's patience and far
 * more than one short JSON reply needs.
 */
const RERANK_TIMEOUT_MS = 8_000;

/** A reranking reply is short; the cap stops a model that decides to think out loud. */
const RERANK_MAX_TOKENS_FLOOR = 200;
const RERANK_MAX_TOKENS_CEILING = 1_200;
const RERANK_MAX_TOKENS_PER_ITEM = 80;

/** How long a rewritten reason may be. The rule's own reasons are one sentence; so is this. */
const REASON_MAX_LENGTH = 60;

export const AI_STUDY_SYSTEM_PROMPT = [
  '你是一位中小学老师的练习编排助手。',
  '你只输出一个 JSON 对象，不要输出任何解释性文字、Markdown 代码块或前后缀。',
  'JSON 结构为：{"items": [{"question_id": number, "reason": string}, ...]}。',
  'items 只能包含给定候选题里的 question_id，不能新增、不能重复；按下发顺序表示你建议的练习顺序。',
  'reason 是给学生看的一句话，不超过 40 个汉字，要具体说明为什么现在练这道题，不要说空话。',
  '不要修改题目内容，也不要给出答案。',
].join('\n');

/**
 * The candidate list, rendered for the prompt.
 *
 * Deliberately excludes the reference answer and the explanation even though the learning port could
 * not have supplied them anyway: a prompt is the easiest place for an answer key to leak, and there
 * is nothing about "which order and why" that needs one.
 */
export function buildRerankPrompt(
  ranked: RankedCandidate[],
  weakNodes: EngineWeakNode[],
  hint: string | null,
): string {
  const lines: string[] = [];

  if (weakNodes.length > 0) {
    lines.push(
      `学生薄弱知识点：${weakNodes
        .slice(0, 8)
        .map((node) => `${node.name}（错 ${node.wrongCount} 次）`)
        .join('、')}`,
    );
  }
  if (hint && hint.trim()) lines.push(`老师补充要求：${hint.trim()}`);

  lines.push('候选题（顺序为规则打分顺序，可作为参考，但你可以调整）：');
  for (const item of ranked) {
    const difficulty = item.difficulty === null ? '未标注' : String(item.difficulty);
    lines.push(
      `- question_id=${item.questionId} 题型=${item.type} 难度=${difficulty} 规则理由=${item.reason}`,
    );
  }
  lines.push('请只返回 JSON。');
  return lines.join('\n');
}

/**
 * Read the model's reply, keeping only what it is entitled to change.
 *
 * Returns `null` when there is nothing usable at all, which the caller reports as "the rule order
 * was kept" rather than as a failure the student has to care about.
 */
export function parseRerankReply(
  raw: string,
  allowed: RankedCandidate[],
): { order: number[]; reasons: Map<number, string> } | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  // Tolerate a fenced block: models emit them constantly and rejecting one would be pedantry rather
  // than safety. Everything else that does not parse is refused below, and the rule order stands.
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return null;

  const known = new Map(allowed.map((item) => [item.questionId, item]));
  const order: number[] = [];
  const reasons = new Map<number, string>();

  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as { question_id?: unknown; reason?: unknown };
    const id = Number(record.question_id);
    // An unknown id is dropped rather than mapped onto something: the model may reorder this list,
    // not extend it. A duplicate is dropped for the same reason - one question, one slot.
    if (!Number.isFinite(id) || !known.has(id) || order.includes(id)) continue;

    order.push(id);
    const reason = typeof record.reason === 'string' ? record.reason.trim().replace(/\s+/g, ' ') : '';
    if (reason) reasons.set(id, reason.slice(0, REASON_MAX_LENGTH));
  }

  if (order.length === 0) return null;

  // Anything the model left out keeps its rule position, after the ones it named: a partial answer
  // is still an answer, and dropping the rest would shrink the student's set.
  for (const item of allowed) {
    if (!order.includes(item.questionId)) order.push(item.questionId);
  }

  return { order, reasons };
}

export interface RerankOutcome {
  ranked: RankedCandidate[];
  ai: AiStudyOutcome;
  /** The items whose reason (and position) came from the model, for the UI's provenance label. */
  rankedByModel: Set<number>;
}

function unavailable(ranked: RankedCandidate[], source: string, message: string): RerankOutcome {
  return { ranked, ai: { source, available: false, confidence: null, message }, rankedByModel: new Set() };
}

/**
 * Apply the model pass, or explain why there is none.
 *
 * `provider` is resolved by the caller per request (`ctx.tryUse('homework.public')`), never captured
 * at setup: `homework` is `required: false` and sorts after this plugin, so a value taken during
 * `setup()` would be `null` for the life of the process - the trap `plugins/insights` records.
 */
export async function rerankWithModel(input: {
  provider: HomeworkAiPort | null;
  ranked: RankedCandidate[];
  weakNodes: EngineWeakNode[];
  hint: string | null;
}): Promise<RerankOutcome> {
  const { provider, ranked, weakNodes, hint } = input;

  if (ranked.length === 0) {
    return unavailable(ranked, 'none', '题库里还没有可用于智学的题目，暂时无法给出理由。');
  }
  if (!provider) {
    return unavailable(
      ranked,
      'none',
      'AI 智学当前只运行本地规则打分：作业插件未启用，因此没有可借用的模型。规则结果与理由不受影响。',
    );
  }

  const maxTokens = Math.min(
    RERANK_MAX_TOKENS_CEILING,
    Math.max(RERANK_MAX_TOKENS_FLOOR, ranked.length * RERANK_MAX_TOKENS_PER_ITEM),
  );

  let completion: HomeworkAiCompletion;
  try {
    completion = await provider.complete({
      system: AI_STUDY_SYSTEM_PROMPT,
      user: buildRerankPrompt(ranked, weakNodes, hint),
      maxTokens,
      timeoutMs: RERANK_TIMEOUT_MS,
    });
  } catch (error) {
    // The port's contract says it does not throw; this is belt-and-braces so that a future provider
    // which does cannot turn a practice set into a 500.
    return unavailable(ranked, 'http', `AI 服务调用失败：${error instanceof Error ? error.message : String(error)}`);
  }

  if (!completion.available || !completion.text) {
    return unavailable(ranked, completion.source, completion.message);
  }

  const parsed = parseRerankReply(completion.text, ranked);
  if (!parsed) {
    return unavailable(
      ranked,
      completion.source,
      '模型返回的内容无法解析，已保留本地规则的排序与理由。原始返回：' +
        completion.text.trim().slice(0, 120),
    );
  }

  const byId = new Map(ranked.map((item) => [item.questionId, item]));
  const reordered: RankedCandidate[] = [];
  const rankedByModel = new Set<number>();

  for (const id of parsed.order) {
    const item = byId.get(id);
    if (!item) continue;
    const reason = parsed.reasons.get(id);
    if (reason) rankedByModel.add(id);
    reordered.push(reason ? { ...item, reason } : item);
  }

  return {
    ranked: reordered,
    ai: {
      source: completion.source,
      available: true,
      // A reordering has no confidence to report, and inventing one would be exactly the kind of
      // number this feature refuses to fabricate. `available` is the field the UI branches on.
      confidence: null,
      message: `已由模型（${completion.source}）重排 ${rankedByModel.size}/${reordered.length} 题的顺序与理由。`,
    },
    rankedByModel,
  };
}
