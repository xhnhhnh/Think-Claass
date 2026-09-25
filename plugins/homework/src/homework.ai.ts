/**
 * The homework AI provider port, and its two implementations.
 *
 * ## AI is an assist, never a gate
 *
 * Everything in this file is written so that the feature works with no model configured, which is
 * the default. The mock provider grades objective questions *deterministically* - it is the same
 * function the service uses for immediate scoring on submit, not a stand-in that guesses - and
 * declines to judge what it cannot (a short answer with no rubric, a photograph) with a low
 * confidence and a message saying so. A teacher reviewing a grade sheet therefore sees either a
 * real, reproducible judgement or an explicit "needs you", and never a fabricated number.
 *
 * That posture is why `AiGradeLine.score` is `number | null` and why an unavailable provider is
 * reported as `available: false` inside a 200 response rather than thrown. If the AI half of a
 * request fails, the write the teacher asked for has already succeeded and must stay succeeded.
 *
 * ## Why the provider is resolved from platform settings
 *
 * The configuration (`ai_provider`, `ai_base_url`, `ai_api_key`, `ai_model`, `ai_timeout_ms`) lives
 * in the `settings` table and is read through `ctx.settings.getPlatform`, so this plugin needs no
 * kernel configuration field - the kernel keeps knowing no business vocabulary (guardrail G5).
 * The keys are operator-editable in the admin console, and `ai_api_key` is masked on the way out
 * so the console never renders a secret back into the browser.
 *
 * The HTTP provider exists and is wired, but is off by default: `ai_provider` defaults to `mock`
 * and refuses to construct when its key or base URL is missing, so a deployment that has not
 * configured a model cannot accidentally call one.
 */

import { ApiError } from '@thinkclass/kernel';

import type {
  HomeworkAiCompletion,
  HomeworkAnswerValue,
  HomeworkOption,
  HomeworkQuestionPayload,
  HomeworkReferenceAnswer,
} from '@thinkclass/contracts/domains/homework';

import {
  describeReference,
  gradeObjectiveAnswer,
  gradeShortAnswer,
  isObjectiveType,
} from './homework.grading.js';
import {
  AI_GENERATE_SYSTEM_PROMPT,
  isGeneratableType,
  maxTokensFor,
  renderGeneratePrompt,
  type GeneratableType,
} from './homework.templates.js';

/** One question as the provider sees it. */
export interface AiQuestionInput {
  question_id: number;
  type: string;
  stem: string;
  options: HomeworkOption[];
  reference: HomeworkReferenceAnswer;
  rubric: Array<{ label: string; points: number }>;
  points: number;
}

/** One question's answer as the provider sees it. */
export interface AiAnswerInput {
  question_id: number;
  /**
   * The pupil's raw answer, not a pre-flattened string.
   *
   * Handing the provider the structured value rather than a rendering of it is what lets the mock
   * call the same `gradeObjectiveAnswer` the service uses - a choice answer is a list of option
   * ids, and flattening it to `"b、d"` before grading would make exact comparison impossible and
   * the two graders disagree on the same input.
   */
  value: HomeworkAnswerValue;
  /** How many photos the pupil attached to this question. */
  photoCount: number;
}

export interface AiGradeRequest {
  questions: AiQuestionInput[];
  answers: AiAnswerInput[];
}

/**
 * One question's proposed grade.
 *
 * `score: null` is "I decline to judge", which is a different answer from `score: 0` ("this is
 * worth nothing") and is rendered differently. `confidence` is 0..1 and is what the UI sorts on:
 * the teacher's attention should go to the low-confidence lines first.
 */
export interface AiGradeLine {
  question_id: number;
  score: number | null;
  comment: string;
  confidence: number;
  /** Which rubric lines the answer hit, so the panel can show its work. */
  matched: string[];
}

export interface AiGradeOutcome {
  lines: AiGradeLine[];
  /** A whole-paper remark, or null when the provider has nothing useful to add. */
  feedback: string | null;
  /** 0..1 across the graded lines. */
  confidence: number | null;
  message: string;
}

export interface AiAskRequest {
  homeworkTitle: string;
  /** The question the pupil's own question is anchored to, when there is one. */
  focus: AiQuestionInput | null;
  /** What the pupil wrote, so the answer can be about their actual attempt. */
  studentAnswer: string;
  /** The teacher's feedback on this attempt, when there is any. */
  teacherFeedback: string | null;
  /** Prior turns, oldest first, so a follow-up ("why?") has something to refer to. */
  history: Array<{ role: 'student' | 'assistant'; content: string }>;
  /**
   * What the pupil actually asked.
   *
   * Named `studentQuestion` rather than `question` because `focus` is already the *question of the
   * homework*, and two things called "question" one field apart is how a prompt ends up asking the
   * model to answer the exam paper.
   */
  studentQuestion: string;
}

export interface AiAskOutcome {
  text: string;
  confidence: number | null;
  message: string;
}

/**
 * One generated question, in the *raw* shape a model replies with.
 *
 * Deliberately loose (`unknown` fields, optional everything): this is untrusted input from a model,
 * and typing it as `HomeworkQuestionPayload` would be a claim the parser has not earned yet. It is
 * narrowed in exactly one place - `normaliseCandidateQuestion` - so there is one definition of what
 * a usable generated question is.
 */
export interface CandidateQuestion {
  type?: unknown;
  stem?: unknown;
  options?: unknown;
  reference?: unknown;
  explanation?: unknown;
  points?: unknown;
}

export interface AiGenerateRequest {
  topic: string;
  /**
   * The type the prompt must ask for, or `null` for 混合.
   *
   * `GeneratableType` rather than a bare string, and that is the point of the template module: the
   * set of types a request may name *is* the set of types a template exists for. The service narrows
   * the untrusted body into this type before the provider is called (see `generateQuestions`), so a
   * request for 简答 is refused with a reason at the edge rather than silently generating one of the
   * three.
   */
  type: GeneratableType | null;
  count: number;
  grade: string | null;
  hint: string | null;
  contextTitle: string | null;
  avoid: string[];
}

/**
 * What a provider returns for a generation request.
 *
 * `questions` are already *filtered to usable candidates* by the provider's own parser, because
 * only the provider knows what its model actually emitted - a reply of ten malformed objects is a
 * fact about that model's output, and the count of what it lost is the only actionable thing left
 * of it. Deeper validation (a single-choice question with two answers, an option set with no
 * reference) stays where it belongs: the service's `normaliseQuestions`, through which every
 * candidate then passes, so AI-written and human-written questions are held to one rule.
 */
export interface AiGenerateOutcome {
  questions: HomeworkQuestionPayload[];
  /** Candidates the model offered and the parser could not turn into a question. */
  skipped: number;
  message: string;
}

export interface HomeworkAiProvider {
  /** `mock` | `http` - written into `p_homework_answers.ai_source` for provenance. */
  readonly source: string;
  /** False when the provider is configured but unusable; the caller reports why. */
  available(): boolean;
  /** One human-readable line explaining the current state, for the UI to show verbatim. */
  state(): string;
  grade(request: AiGradeRequest): Promise<AiGradeOutcome>;
  ask(request: AiAskRequest): Promise<AiAskOutcome>;
  /**
   * Draft questions from a topic.
   *
   * Never throws, and never returns a half-truth: a provider that cannot do this says so in
   * `message` with an empty `questions` array. That is the same posture as the refusal to invent a
   * grade, and it is why the default (mock) implementation is a refusal rather than a template -
   * see `createMockProvider`.
   */
  generateQuestions(request: AiGenerateRequest): Promise<AiGenerateOutcome>;
  /**
   * One borrowed chat completion, for an AI surface that lives elsewhere.
   *
   * The caller owns the prompt; this provider owns only "which model, with which key, for how long".
   * That split is why the method carries no 判分/问答/出题 vocabulary - `plugins/ai-study` uses it to
   * re-rank candidates its own rule engine already chose, and homework learns nothing about that.
   *
   * Never throws. A provider with no model configured, an unreachable one and an unparseable reply
   * all come back as `text: null, available: false` plus the line the caller prints verbatim, because
   * every caller has a deterministic result to fall back on and a 5xx would discard it.
   *
   * `timeoutMs` may only *shorten* the operator's configured patience - see the port's contract.
   */
  complete(request: {
    system: string;
    user: string;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<HomeworkAiCompletion>;
  /** A minimal round trip, for the admin console's "test connection" action. */
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

/**
 * Whether an answer's evidence is a photograph rather than something a grader can read.
 *
 * Exported because two callers must agree on it and they live in different files: the mock provider
 * declines such an answer, and `HomeworkService.autoScoreObjective` skips it. If they disagreed, a
 * pupil's photograph would silence the AI and then be marked wrong by the deterministic grader -
 * the loudest possible way to be unhelpful.
 *
 * `wholeSubmissionPhotos > 0` counts towards every question, because a photograph of the whole paper
 * is evidence for all of them; `value.photo_ids` counts for the one question it is attached to.
 */
export function answerHasPhoto(value: HomeworkAnswerValue | undefined, wholeSubmissionPhotos = 0): boolean {
  return wholeSubmissionPhotos > 0 || (value?.photo_ids?.length ?? 0) > 0;
}

/**
 * Flatten a pupil's answer into text, for a prompt or a comment.
 *
 * The inverse of `AiAnswerInput.value`'s reasoning: grading needs the structure, but a prompt can
 * only carry text, so a choice answer is rendered with the option *labels* rather than the ids it
 * is stored as. A model shown `["b"]` would have to be told what `b` means; shown the option text,
 * it can judge the answer.
 */
export function describeAnswer(value: HomeworkAnswerValue | undefined, options: HomeworkOption[] = []): string {
  if (!value) return '';
  const text = String(value.text ?? '').trim();
  const ids = value.choice ?? [];
  const labels = ids.map((id) => options.find((option) => option.id === id)?.text ?? id);
  return [labels.join('、'), text].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Prompt construction - shared by the HTTP provider and by its tests

export const AI_SYSTEM_PROMPT = [
  '你是一位中小学老师的批改助手。',
  '你只输出一个 JSON 对象，不要输出任何解释性文字、Markdown 代码块或前后缀。',
  'JSON 结构为：{"score": number|null, "confidence": number, "comment": string, "matched_points": string[]}。',
  'score 必须是 0 到该题满分之间的整数；当你无法判断时，score 必须是 null，confidence 必须是 0 到 0.3 之间。',
  '不要臆造分数。宁可回答 null 也不要猜。',
].join('\n');

/** One question rendered as prompt text. */
export function buildGradePrompt(question: AiQuestionInput, answer: AiAnswerInput | undefined): string {
  const lines = [
    `题型：${question.type}`,
    `题目：${question.stem}`,
  ];
  if (question.options.length > 0) {
    lines.push(`选项：${question.options.map((option) => `${option.id}. ${option.text}`).join('；')}`);
  }
  lines.push(`满分：${question.points}`);
  lines.push(`参考答案：${describeReference(question.type, question.reference, question.options)}`);
  if (question.rubric.length > 0) {
    lines.push(`评分要点：${question.rubric.map((entry) => `${entry.label}(${entry.points}分)`).join('；')}`);
  }
  const answerText = describeAnswer(answer?.value, question.options);
  lines.push(`学生作答：${answerText ? answerText : '（未作答）'}`);
  if ((answer?.photoCount ?? 0) > 0) {
    lines.push(`学生另附了 ${answer?.photoCount} 张照片（你无法查看图片内容，请据此降低 confidence）。`);
  }
  return lines.join('\n');
}

export const AI_ASK_SYSTEM_PROMPT = [
  '你是一位耐心、鼓励学生的中小学老师。',
  '回答要简短、口语化、面向学生本人，用「你」称呼学生。',
  '不要直接给出与作业无关的答案；如果学生问的是最后的结论，先引导思路再给结论。',
  '不要编造题目中没有出现的信息。',
].join('\n');

// ---------------------------------------------------------------------------
// Question generation - the third AI surface
//
// Grading and asking both had a deterministic baseline to fall back on (the objective grader, and
// the stored thread). Generation has none: a question either came from a model or it did not exist.
// So the mock provider *refuses* (see createMockProvider) and the strict rules below exist to make
// the HTTP path's output safe to put in front of a class.
//
// ## Where the prompt lives now
//
// `homework.templates.ts` owns the per-type templates, the system prompt and the prompt renderer, and
// the prompt builder below is a thin adapter over it. That split is deliberate: the templates are the
// *token budget* - one skeleton and two rules per type instead of a prose description of four types -
// and they are shared with the parser, which checks a reply against the same field names. See that
// file for why `short` is not generatable.

/** One generation request as prompt text. The token-budgeted form is in `homework.templates.ts`. */
export function buildGeneratePrompt(request: AiGenerateRequest): string {
  return renderGeneratePrompt(request);
}

/**
 * Re-exported so callers and tests have one import for "the prompt surface".
 *
 * The string itself is defined in `homework.templates.ts` next to the templates it introduces; this
 * barrel exists because every other prompt in this plugin is reachable from here, and a second import
 * path for one constant is the kind of inconsistency that ends with two copies.
 */
export { AI_GENERATE_SYSTEM_PROMPT };

/**
 * Narrow one model-emitted object into a question, or reject it.
 *
 * This is the single definition of "usable candidate", and it is deliberately a *repair* function
 * rather than a deep validator: it fixes what has an obvious intent (a bare `choice: "b"`, a missing
 * `points`, an option with no id) and drops what does not (no stem, no options on a choice question,
 * an unknown type). Deeper rules - a `single` question with exactly one answer, a reference that
 * names an option that does not exist - are enforced afterwards by the service's
 * `normaliseQuestions`, which is the same function a teacher's hand-written payload goes through.
 *
 * Splitting it this way is what keeps the invariant honest: the AI cannot introduce a question that
 * the manual path would have refused, because there is only one manual path.
 */
export function normaliseCandidateQuestion(candidate: CandidateQuestion): HomeworkQuestionPayload | null {
  const record = (candidate ?? {}) as Record<string, unknown>;

  // Only the three templated types are accepted. A `short` answer is a different thing to author
  // (prose, and a rubric rather than one right answer) and this request never carries a template for
  // it, so a reply that emits one is answering a question nobody asked - the same reason a mismatched
  // type is dropped by `parseGenerateReply` when a specific type was requested.
  const type = record.type;
  if (!isGeneratableType(type)) return null;

  const stem = String(record.stem ?? '').trim();
  if (!stem) return null;

  const points = Number(record.points);
  // A missing or nonsense mark becomes the editor's own default (5) rather than a rejection: the
  // teacher is going to set the marks anyway, and dropping an otherwise good question over a field
  // they will type over is not a service to them.
  const safePoints = Number.isFinite(points) && points >= 0 ? Math.floor(points) : 5;

  const reference = (record.reference ?? {}) as Record<string, unknown>;
  const explanation = typeof record.explanation === 'string' && record.explanation.trim() ? record.explanation.trim() : null;

  if (type === 'single' || type === 'multiple') {
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    const options = rawOptions
      .map((option, index) => {
        const entry = (option ?? {}) as Record<string, unknown>;
        const text = String(entry.text ?? '').trim();
        if (!text) return null;
        const id = String(entry.id ?? '').trim() || String.fromCharCode(97 + index);
        return { id, text };
      })
      .filter((option): option is { id: string; text: string } => option !== null);

    if (options.length < 2) return null;

    const choice = toIdList(reference.choice).filter((id) => options.some((option) => option.id === id));
    if (choice.length === 0) return null;
    if (type === 'single' && choice.length > 1) return null;

    return { type, stem, options, reference: { choice }, explanation, points: safePoints };
  }

  if (type === 'blank') {
    const accept = toTextList(reference.accept);
    if (accept.length === 0) return null;
    return { type, stem, options: [], reference: { accept }, explanation, points: safePoints };
  }

  const text = String(reference.text ?? '').trim();
  if (!text) return null;
  return { type: 'short', stem, options: [], reference: { text }, explanation, points: safePoints };
}

/** A list of trimmed strings from a field that may be a scalar, an array, or absent. */
function toTextList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry) => String(entry ?? '').trim()).filter(Boolean);
}

/** The same, for the option ids a choice reference names. */
function toIdList(value: unknown): string[] {
  return [...new Set(toTextList(value))];
}

/**
 * Parse a generation reply into usable candidates.
 *
 * The two failure modes are counted apart on purpose. A reply that does not parse at all is a *model*
 * problem (wrong endpoint, truncation, a prose answer) and the caller gets a message quoting it. A
 * reply that parses into ten objects of which four survive is an *output* problem, and the honest
 * report is "4 usable, 6 dropped" - which is what `skipped` carries rather than being silently
 * rounded up to "4 questions generated".
 *
 * `requestedType` is the type the prompt asked for, and it is enforced here rather than trusted: a
 * teacher who picked 填空 in the console and gets single-choice questions back has been handed a
 * paper they did not ask for. A mismatched candidate is dropped and counted, so "3 of 5 were the
 * wrong type" is visible instead of quietly mixed into the paper.
 */
export function parseGenerateReply(
  raw: string,
  limit: number,
  requestedType: GeneratableType | null = null,
): { questions: HomeworkQuestionPayload[]; skipped: number; unparsed: boolean } {
  const trimmed = raw.trim();
  // Tolerate a fenced block: models emit them constantly, and rejecting one would be pedantry
  // rather than safety. Anything else unparseable is refused below.
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { questions: [], skipped: 0, unparsed: true };
  }

  const record = (parsed ?? {}) as Record<string, unknown>;
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  if (rawQuestions.length === 0) return { questions: [], skipped: 0, unparsed: true };

  const questions: HomeworkQuestionPayload[] = [];
  let skipped = 0;
  for (const entry of rawQuestions) {
    const question = normaliseCandidateQuestion((entry ?? {}) as CandidateQuestion);
    if (!question || (requestedType !== null && question.type !== requestedType)) {
      skipped += 1;
      continue;
    }
    // Over-delivery is dropped rather than trimmed-and-counted: asking for 5 and getting 12 is not
    // an error the teacher needs to read about, and the extra ones are exactly what they did not ask
    // for.
    if (questions.length >= limit) break;
    questions.push(question);
  }

  return { questions, skipped, unparsed: false };
}

export function buildAskPrompt(request: AiAskRequest): string {
  const lines: string[] = [`作业：${request.homeworkTitle}`];
  if (request.focus) {
    lines.push(`题目：${request.focus.stem}`);
    if (request.focus.options.length > 0) {
      lines.push(`选项：${request.focus.options.map((option) => `${option.id}. ${option.text}`).join('；')}`);
    }
    lines.push(
      `参考答案：${describeReference(request.focus.type, request.focus.reference, request.focus.options)}`,
    );
  }
  if (request.studentAnswer.trim()) lines.push(`我的作答：${request.studentAnswer.trim()}`);
  if (request.teacherFeedback?.trim()) lines.push(`老师的评语：${request.teacherFeedback.trim()}`);
  lines.push(`学生的问题：${request.studentQuestion}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Mock provider

/**
 * The default provider: deterministic, offline, and honest about its limits.
 *
 * Objective questions go through exactly the same function the service uses for immediate scoring,
 * so "the AI agreed with the auto-grade" is a fact rather than a coincidence, and the result is
 * reproducible across runs - which is what makes it testable at all.
 *
 * A short answer is graded against its rubric by keyword. That is a real if coarse signal, so the
 * confidence is capped at 0.6 and the comment names the rubric lines that hit: the teacher can
 * check the work rather than take the number on faith.
 *
 * A photograph is not judged. There is no vision model here, and returning a score for an image
 * this provider never looked at would be the single most damaging thing it could do.
 */
export function createMockProvider(): HomeworkAiProvider {
  const STATE = '当前未接入外部模型：客观题自动判分，简答题按评分要点匹配，拍照题需老师批改。';

  return {
    source: 'mock',
    available: () => true,
    state: () => STATE,
    testConnection: async () => ({ ok: true, message: STATE }),

    async grade(request) {
      const lines: AiGradeLine[] = [];

      for (const question of request.questions) {
        const answer = request.answers.find((entry) => entry.question_id === question.question_id);
        const answerText = describeAnswer(answer?.value, question.options);

        // A photograph is the pupil's answer, and this provider cannot read it. Declining is the only
        // honest response - and it is the *same* predicate `HomeworkService.autoScoreObjective` skips
        // on, so a photograph cannot first get a deterministic score and then an AI refusal.
        if (answerHasPhoto(answer?.value, answer?.photoCount ?? 0)) {
          lines.push({
            question_id: question.question_id,
            score: null,
            comment: `该题以照片作答（${answer?.photoCount} 张），模拟判分无法识别图片内容，请老师查看照片后批改。`,
            confidence: 0,
            matched: [],
          });
          continue;
        }

        if (isObjectiveType(question.type)) {
          const result = gradeObjectiveAnswer(
            { type: question.type, points: question.points, reference: question.reference },
            answer?.value,
          );
          lines.push({
            question_id: question.question_id,
            score: result.score,
            comment: result.comment,
            // Objective grading is exact, so a definitive result is fully confident - and a
            // declined one (unanswered, or no reference configured) is not confident at all.
            confidence: result.score === null ? 0.2 : 1,
            matched: result.matched,
          });
          continue;
        }

        const { result, confidence } = gradeShortAnswer(
          { type: question.type, points: question.points, reference: question.reference, rubric: question.rubric },
          answer?.value,
        );
        lines.push({
          question_id: question.question_id,
          score: result.score,
          comment: result.comment,
          confidence,
          matched: result.matched,
        });
      }

      const judged = lines.filter((line) => line.score !== null);
      const confidence =
        judged.length === 0 ? 0 : judged.reduce((sum, line) => sum + line.confidence, 0) / judged.length;

      return {
        lines,
        feedback:
          judged.length === 0
            ? '本次没有可以自动判分的题目。'
            : `已自动判分 ${judged.length}/${lines.length} 题；其余需老师复核。`,
        confidence: Math.round(confidence * 100) / 100,
        message: STATE,
      };
    },

    async ask(request) {
      const parts: string[] = [];
      if (request.focus) {
        parts.push(`这道题考查的是「${request.focus.stem}」。`);
        const reference = describeReference(
          request.focus.type,
          request.focus.reference,
          request.focus.options,
        );
        if (reference && reference !== '(未设置)') {
          parts.push(`参考答案是：${reference}。`);
        }
      }
      if (request.studentAnswer.trim()) {
        parts.push(`你写的是「${request.studentAnswer.trim()}」，可以先对照参考答案检查一下。`);
      }
      if (request.teacherFeedback?.trim()) {
        parts.push(`老师给你的评语是：${request.teacherFeedback.trim()}。`);
      }
      parts.push(`关于你的问题「${request.studentQuestion}」：${STATE}`);

      return {
        text: parts.join(''),
        confidence: null,
        message: STATE,
      };
    },

    /**
     * The mock *refuses* to generate, and that is the whole design of this method.
     *
     * Grading and asking each had a deterministic fallback: the objective grader is exact, and an
     * answer is composed from rows that already exist. Generation has neither. Template filler
     * (「请在此填写题干」) would produce rows that *look* like a paper, pass every validation, and be
     * one click from being published to a class - the single most damaging thing this provider could
     * do, and the same reason it refuses to score a photograph.
     *
     * The cost is that the default installation cannot demo 出题 without configuring a model. That is
     * the honest trade: the operator is told exactly what to turn on, in the console the message
     * names, instead of being handed placeholders that quietly become homework.
     */
    async generateQuestions() {
      return {
        questions: [],
        skipped: 0,
        message:
          '当前未接入外部模型：AI 出题没有可依赖的本地规则，为避免生成占位题目被发布，这里不会编造题目。请在后台「系统设置 → AI 判分与问答」里配置接口地址、API 密钥与模型名称后再试。',
      };
    },

    /**
     * The mock has no model to borrow, so it declines - and says exactly what to configure.
     *
     * Same posture as `generateQuestions`, for the same reason: a fabricated "re-ranking" would be
     * indistinguishable from a real one at the call site, and the caller would present a rule result
     * as a model's judgement. The message is the one the console field names, so the operator who
     * reads it knows where to go.
     */
    async complete() {
      return {
        text: null,
        source: 'mock',
        available: false,
        message:
          '当前未接入外部模型：智选结果由本地规则打分产生。请在后台「系统设置 → AI 判分与问答」里配置接口地址、API 密钥与模型名称后，模型才会参与重排并给出理由。',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP provider

export interface HttpProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/**
 * The OpenAI-compatible provider.
 *
 * Off unless configured, and it fails closed: `createHttpProvider` throws when the base URL or the
 * key is missing, so a misconfigured deployment gets an actionable 503 rather than requests to
 * `undefined/chat/completions`.
 *
 * The model is asked for a single JSON object and the reply is parsed strictly. A reply that does
 * not parse becomes `score: null, confidence: 0` with the raw text in the comment - never a
 * guessed number. That is the failure mode that matters: an unparseable reply from a real model is
 * common, and the tempting shortcut (regex the first integer out of it) is how a grader ends up
 * inventing marks.
 */
export function createHttpProvider(config: HttpProviderConfig): HomeworkAiProvider {
  const base = config.baseUrl.replace(/\/+$/, '');
  if (!base) throw new ApiError(503, 'AI 服务未配置：缺少 ai_base_url', { code: 'AI_NOT_CONFIGURED' });
  if (!config.apiKey) throw new ApiError(503, 'AI 服务未配置：缺少 ai_api_key', { code: 'AI_NOT_CONFIGURED' });

  const endpoint = `${base}/chat/completions`;

  async function complete(
    system: string,
    user: string,
    options: { maxTokens?: number; timeoutMs?: number } = {},
  ): Promise<string> {
    const controller = new AbortController();
    // The operator's `ai_timeout_ms` is the ceiling; a caller with a shorter deadline (a student
    // watching a spinner for their practice set) may wait less, never longer.
    const budget =
      options.timeoutMs === undefined ? config.timeoutMs : Math.min(config.timeoutMs, options.timeoutMs);
    const timer = setTimeout(() => controller.abort(), budget);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          // Low temperature: a grader that varies run to run is a grader nobody can appeal, and a
          // draft set that varies run to run is one a teacher cannot review against the last attempt.
          temperature: 0,
          // Omitted rather than defaulted for the calls that have no budget of their own (a
          // connection test is one short reply): `max_tokens: undefined` is dropped by
          // `JSON.stringify`, so the field only appears where a caller set a ceiling for it.
          ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new ApiError(502, `AI 服务返回 ${response.status}：${body.slice(0, 200)}`, {
          code: 'AI_UPSTREAM_ERROR',
        });
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return payload.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    source: 'http',
    available: () => true,
    state: () => `已接入模型 ${config.model}（${base}）。`,

    async testConnection() {
      try {
        await complete('你是测试助手。', '回复 OK');
        return { ok: true, message: `模型 ${config.model} 连接正常。` };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },

    async grade(request) {
      const lines: AiGradeLine[] = [];

      for (const question of request.questions) {
        const answer = request.answers.find((entry) => entry.question_id === question.question_id);
        try {
          const raw = await complete(AI_SYSTEM_PROMPT, buildGradePrompt(question, answer));
          lines.push(parseGradeReply(question, raw));
        } catch (error) {
          // One question failing must not lose the others' grades: the marks already proposed are
          // still worth showing, and the failure is recorded against the question it happened on.
          lines.push({
            question_id: question.question_id,
            score: null,
            comment: `AI 判分失败：${error instanceof Error ? error.message : String(error)}`,
            confidence: 0,
            matched: [],
          });
        }
      }

      const judged = lines.filter((line) => line.score !== null);
      const confidence =
        judged.length === 0 ? 0 : judged.reduce((sum, line) => sum + line.confidence, 0) / judged.length;

      return {
        lines,
        feedback: judged.length === 0 ? '本次没有可以自动判分的题目。' : `已批改 ${judged.length}/${lines.length} 题。`,
        confidence: Math.round(confidence * 100) / 100,
        message: this.state(),
      };
    },

    async ask(request) {
      const history = request.history
        .slice(-8)
        .map((entry) => `${entry.role === 'student' ? '学生' : '老师'}：${entry.content}`)
        .join('\n');
      const user = [history, buildAskPrompt(request)].filter(Boolean).join('\n\n');
      try {
        const text = await complete(AI_ASK_SYSTEM_PROMPT, user);
        return { text: text.trim() || '（模型没有返回内容）', confidence: null, message: this.state() };
      } catch (error) {
        // Rethrown rather than swallowed: unlike grading, an answer is the whole point of the
        // request, and the route turns this into an `available: false` payload for the client.
        throw error;
      }
    },

    /**
     * One completion for a whole paper.
     *
     * Unlike grading - which asks per question so one bad reply cannot cost the others' marks - a
     * generation is a *set*: five questions on one topic is one act of authoring, and splitting it
     * into five calls would cost five times as much and produce five questions that ignore each
     * other's content (so "第三题" could mean anything, and repeated stems stop being avoidable).
     *
     * A thrown error becomes a refusal in the payload rather than a 5xx: the teacher pressed a button
     * in a dialog they are still holding, and the useful outcome is a sentence in that dialog, not a
     * failed request that discards what they had typed.
     */
    async generateQuestions(request) {
      try {
        // The type the prompt asked for, so a reply that ignores the template is caught here rather
        // than reaching a paper. `null` means 混合, where any of the three is a valid answer.
        const requestedType = isGeneratableType(request.type) ? request.type : null;
        const raw = await complete(AI_GENERATE_SYSTEM_PROMPT, buildGeneratePrompt(request), {
          // The output cap is half the token budget: without it a model asked for five questions can
          // emit a page of reasoning, and the bill is per token generated.
          maxTokens: maxTokensFor(request.count),
        });
        const { questions, skipped, unparsed } = parseGenerateReply(raw, request.count, requestedType);

        if (unparsed || questions.length === 0) {
          // The raw text is quoted (truncated) rather than summarised: "the model did not return
          // questions" is not actionable, and the first 200 characters usually say why - a prose
          // answer, a refusal, or a truncation mid-object.
          return {
            questions: [],
            skipped,
            message: `模型没有返回可用的题目，请换个说法或稍后重试。原始返回：${raw.trim().slice(0, 200) || '（空）'}`,
          };
        }

        return {
          questions,
          skipped,
          message:
            skipped > 0
              ? `已生成 ${questions.length} 道题，另有 ${skipped} 道不合格已丢弃，请逐题核对后再发布。`
              : `已生成 ${questions.length} 道题，请逐题核对后再发布。`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { questions: [], skipped: 0, message: `AI 出题失败：${message}` };
      }
    },

    /**
     * The borrowed completion, and the one place a caller's own failure policy is *not* imposed.
     *
     * It never throws, because the port's contract says so and because both known callers have a
     * deterministic result to show: `plugins/ai-study` keeps its rule ranking and prints `message`.
     * The upstream text is normalised to `''` -> `null` so a caller cannot mistake "the model said
     * nothing" for an answer, and an aborted timeout arrives here as the controller's error - again
     * a message, not a throw.
     */
    async complete(request) {
      try {
        const text = (
          await complete(request.system, request.user, {
            ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
            ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
          })
        ).trim();
        if (!text) {
          return { text: null, source: 'http', available: false, message: '模型没有返回内容。' };
        }
        return { text, source: 'http', available: true, message: this.state() };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { text: null, source: 'http', available: false, message: `AI 服务调用失败：${message}` };
      }
    },
  };
}

/** Parse one model reply into a grade line, refusing to invent a score. */
export function parseGradeReply(question: AiQuestionInput, raw: string): AiGradeLine {
  const trimmed = raw.trim();
  // Tolerate a fenced block: models emit them constantly, and rejecting one would be pedantry
  // rather than safety. Anything else unparseable is refused below.
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return {
      question_id: question.question_id,
      score: null,
      comment: `AI 返回内容无法解析，需老师批改：${trimmed.slice(0, 200)}`,
      confidence: 0,
      matched: [],
    };
  }

  const record = (parsed ?? {}) as Record<string, unknown>;
  const rawScore = record.score;
  const score = rawScore === null || rawScore === undefined ? null : Number(rawScore);
  const valid = score !== null && Number.isFinite(score);

  const rawConfidence = Number(record.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0;

  return {
    question_id: question.question_id,
    // Clamped to the question's own value: a model that answers "7" for a 5-point question must not
    // be able to put 7 on a grade sheet.
    score: valid ? Math.min(Math.max(0, Math.round(score as number)), question.points) : null,
    comment: typeof record.comment === 'string' ? record.comment : '',
    // A declared score with no confidence is treated as maximum doubt, not maximum certainty.
    confidence: valid ? (confidence === 0 ? 0 : confidence) : 0,
    matched: Array.isArray(record.matched_points)
      ? record.matched_points.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

// ---------------------------------------------------------------------------
// Resolution

/**
 * The narrow slice of `ctx.settings` this file needs.
 *
 * `getPlatform` is optional on the SDK's `SettingsApi` (a hand-built test host may not provide one),
 * so it is declared optional here too and every read is null-safe. A host without a settings store
 * therefore degrades to the mock provider rather than throwing at boot.
 */
export interface AiSettingsReader {
  getPlatform?<T = unknown>(key: string): T | undefined;
}

export interface ResolvedAiProvider {
  provider: HomeworkAiProvider;
  /** Why the provider could not be built, when `provider` is the mock fallback. */
  reason: string | null;
}

/** The canonical setting keys, exported so the admin console and this file cannot drift. */
export const AI_SETTING_KEYS = {
  provider: 'ai_provider',
  baseUrl: 'ai_base_url',
  apiKey: 'ai_api_key',
  model: 'ai_model',
  timeoutMs: 'ai_timeout_ms',
} as const;

/**
 * Pick the provider from platform settings, falling back to the mock.
 *
 * A misconfigured `http` provider degrades to the mock *with a reason attached* rather than failing
 * the request: a teacher pressing 「AI 判分」 with a broken key should still get the objective
 * questions graded and a line saying the model is unreachable, not a 503 and no marks at all.
 */
export function resolveHomeworkProvider(settings: AiSettingsReader | undefined): ResolvedAiProvider {
  const read = (key: string): string | undefined => {
    try {
      const value = settings?.getPlatform?.(key);
      return value === undefined || value === null ? undefined : String(value);
    } catch {
      // `getPlatform` throws when the host has no settings store. That is not a reason to lose the
      // feature - it is the same "no store" case the mock exists for.
      return undefined;
    }
  };

  const requested = (read(AI_SETTING_KEYS.provider) ?? 'mock').trim().toLowerCase();
  if (requested !== 'http') {
    return { provider: createMockProvider(), reason: null };
  }

  try {
    const provider = createHttpProvider({
      baseUrl: read(AI_SETTING_KEYS.baseUrl) ?? '',
      apiKey: read(AI_SETTING_KEYS.apiKey) ?? '',
      model: read(AI_SETTING_KEYS.model) ?? 'deepseek-chat',
      // A model call is on a request's critical path, so the ceiling is deliberately modest; an
      // AbortController in `complete()` enforces it.
      timeoutMs: Number(read(AI_SETTING_KEYS.timeoutMs)) || 20_000,
    });
    return { provider, reason: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { provider: createMockProvider(), reason };
  }
}
