/**
 * 出题模板 - one compact prompt per question type.
 *
 * ## What a template is, and why it is not a string in `homework.ai.ts`
 *
 * Writing a good question is four fifths convention: how many options, which field carries the
 * answer, what a distractor looks like. Stating that convention *per type* rather than once for all
 * four shapes is the difference between a prompt the model can satisfy in forty tokens and one it
 * has to be talked through in four hundred. The templates are the compressed form of that
 * convention, and they are declared here as data - type, label, JSON skeleton, rules, size hint -
 * because three surfaces need the same list and must not drift:
 *
 *   * `buildGeneratePrompt` renders the skeleton and the rules into the prompt;
 *   * `parseGenerateReply` checks a reply against the type it was *asked* for, using the same keys;
 *   * the console offers the same three names, and guardrail G21
 *     (`tests/guardrails/homework-generate-types.test.ts`) fails if its list drifts from this one.
 *
 * ## The three types, and the one that is deliberately absent
 *
 * `single` / `multiple` / `blank` are the objectively gradable half: a template can pin their answer
 * shape down, and the server's own grader can score them the moment a pupil submits. `short` is the
 * type a model is *worst* at writing to a schema (its answer is prose, its marking is a rubric) and
 * the type whose drafts a teacher has to rewrite most - so it is not generated. Authoring a short
 * answer by hand is a textarea; asking a model for one costs tokens to produce text that will be
 * replaced.
 *
 * ## Token budget
 *
 * These strings are prompt payload on every call, so they are written like a config file rather than
 * like documentation: no greetings, no restated system prompt, no examples. `max_tokens` in
 * `TEMPLATE_MAX_TOKENS` is the other half of the budget - without an output cap a model asked for
 * five questions can emit a page of reasoning and bill for it.
 */

import type { HomeworkQuestionType } from '@thinkclass/contracts/domains/homework';

/**
 * The question types that can be generated. `short` is absent on purpose - see the file note.
 *
 * Narrowed from `HomeworkQuestionType` rather than written as bare strings: `homework.ai.ts` and
 * `homework.service.ts` both hold `HomeworkQuestionType` values, and this is the type-level statement
 * of which of them a template exists for. A fourth question type added to the contract would fail to
 * compile here until someone decided whether it is generatable.
 */
export const GENERATABLE_TYPES = ['single', 'multiple', 'blank'] as const satisfies readonly HomeworkQuestionType[];

export type GeneratableType = (typeof GENERATABLE_TYPES)[number];

export function isGeneratableType(value: unknown): value is GeneratableType {
  return typeof value === 'string' && (GENERATABLE_TYPES as readonly string[]).includes(value);
}

export interface QuestionTemplate {
  type: GeneratableType;
  /** The name shown in the console's type select. */
  label: string;
  /** The exact JSON object one question must be, minus the fields every type shares. */
  skeleton: string;
  /** One line per rule, printed as bullet points. Short because every word is billed. */
  rules: string[];
  /** How many options to aim for, when the type has options. Omitted for `blank`. */
  options?: { min: number; max: number };
}

/** One line per type, and nothing else. */
const OPTION_RULE = '选项 2-6 个，干扰项要像真答案但不正确，不要出现「以上都对」';

export const QUESTION_TEMPLATES: Record<GeneratableType, QuestionTemplate> = {
  single: {
    type: 'single',
    label: '单选',
    skeleton:
      '{"type":"single","stem":"word problem or question","options":[{"id":"a","text":"..."}],"reference":{"choice":["a"]},"points":5}',
    rules: [OPTION_RULE, 'reference.choice 只放 1 个选项 id'],
    options: { min: 2, max: 6 },
  },
  multiple: {
    type: 'multiple',
    label: '多选',
    skeleton:
      '{"type":"multiple","stem":"...","options":[{"id":"a","text":"..."}],"reference":{"choice":["a","c"]},"points":5}',
    rules: [OPTION_RULE, 'reference.choice 放 2 个以上正确选项的 id，且不能把所有选项都列为正确'],
    options: { min: 3, max: 6 },
  },
  blank: {
    type: 'blank',
    label: '填空',
    skeleton: '{"type":"blank","stem":"含一个空的问题（用 ____ 表示空）","reference":{"accept":["答案","同义写法"]},"points":3}',
    rules: ['题干用 ____ 标出空的位置', 'reference.accept 至少 1 个，最多 3 个可接受的写法；答案要唯一确定'],
  },
};

/** The templates a request asks for: the chosen one, or all three when the console offers 混合. */
export function templatesFor(type: GeneratableType | null): QuestionTemplate[] {
  if (type) return [QUESTION_TEMPLATES[type]];
  return GENERATABLE_TYPES.map((entry) => QUESTION_TEMPLATES[entry]);
}

/** Kept out of the prompt: the model emits JSON, so its own labels may as well be short. */
export function questionFieldSchema(): string {
  return '每题只使用这些字段：type, stem, options, reference, points。不要输出 id、explanation 或其他字段。';
}

/**
 * The output ceiling, in tokens, for `count` questions.
 *
 * A question's JSON is roughly 60-90 tokens, so this is a generous ceiling rather than a target -
 * its only job is to stop a model that decides to reason out loud from billing for a page. The floor
 * keeps a single-question request from being cut off mid-object.
 */
export const TEMPLATE_MAX_TOKENS = { perQuestion: 160, floor: 400, ceiling: 2400 };

export function maxTokensFor(count: number): number {
  return Math.max(TEMPLATE_MAX_TOKENS.floor, Math.min(TEMPLATE_MAX_TOKENS.ceiling, count * TEMPLATE_MAX_TOKENS.perQuestion));
}

/**
 * The system prompt - short, and short on purpose.
 *
 * Every token here is paid on every generation, so it carries only what a template cannot: who the
 * model is, that the reply is one bare JSON object, and the two failure rules (do not invent, do not
 * pad the stem). The *shapes*, which used to live here as a four-type description, are in the
 * per-type templates instead - that is the whole point of the change.
 */
export const AI_GENERATE_SYSTEM_PROMPT = [
  '你是中小学老师，按模板出题。',
  '只输出一个 JSON 对象：{"questions":[...]}，不要解释、不要 Markdown 代码块。',
  '严格使用给定模板的字段与取值；没有把握的题不要出，不要编造题干。',
  '题干自足、可独立作答，不要出现「略」「同上」或依赖上下文的写法。',
].join('\n');

/** One question type as a prompt block. */
function renderTemplate(template: QuestionTemplate): string {
  // A single-line rule prefix rather than markdown bullets: three `- ` markers and their newlines are
  // ~9 tokens on every call, and the model does not need them to read a list.
  return [`[${template.type}] ${template.label}`, `模板：${template.skeleton}`, `要求：${template.rules.join('；')}`].join('\n');
}

export interface GeneratePromptInput {
  topic: string;
  type: GeneratableType | null;
  count: number;
  grade: string | null;
  hint: string | null;
  contextTitle: string | null;
  avoid: string[];
}

/**
 * The whole user turn: what to make, the templates to make it in, and what not to repeat.
 *
 * The `avoid` list is trimmed *here* as well as at the service boundary, because this is the function
 * that knows what it costs: a teacher with forty existing stems should not pay for all forty to be
 * restated. Each is truncated for the same reason - a duplicate is spotted from the opening words.
 */
export function renderGeneratePrompt(input: GeneratePromptInput): string {
  const parts: string[] = [`主题：${input.topic}`, `数量：${input.count} 题`];
  if (input.type) parts.push(`题型：只用 ${input.type}`);
  if (input.grade?.trim()) parts.push(`年级/难度：${input.grade.trim()}`);
  if (input.hint?.trim()) parts.push(`额外要求：${input.hint.trim()}`);
  if (input.contextTitle?.trim()) parts.push(`作业标题：${input.contextTitle.trim()}`);

  parts.push(questionFieldSchema());
  parts.push(templatesFor(input.type).map(renderTemplate).join('\n\n'));

  const avoid = input.avoid
    .map((stem) => stem.trim().slice(0, AVOID_STEM_MAX_LENGTH))
    .filter(Boolean)
    .slice(0, AVOID_MAX_STEMS);
  if (avoid.length > 0) parts.push(`已有题目，不要重复：${avoid.join(' | ')}`);

  return parts.join('\n');
}

/** How many existing stems are sent, and how much of each. Both are prompt-cost decisions. */
export const AVOID_MAX_STEMS = 15;
export const AVOID_STEM_MAX_LENGTH = 60;
