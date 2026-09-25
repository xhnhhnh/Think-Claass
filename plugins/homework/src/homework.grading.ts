/**
 * Deterministic grading primitives for the homework question types.
 *
 * Everything here is a pure function of (question, reference answer, student answer). That is the
 * whole point of the module: it is what makes the mock AI provider reproducible, what makes the
 * service's objective-question scoring testable without a model, and what gives the AI provider a
 * verified baseline to agree or disagree with rather than something to replace.
 *
 * ## These helpers are copied from `plugins/learning`, not imported
 *
 * `normalizeAnswer` and `parseJsonMaybe` have the same bodies as the ones in
 * `plugins/learning/src/learning.service.ts`, where they grade the paper engine's questions.
 * Guardrail G1 forbids a plugin reaching into another plugin's internals, so the twenty lines are
 * replicated instead of shared - the same choice `plugins/system` and `plugins/assignments` each
 * record for their own copy of the authorization helper.
 *
 * The important consequence is that the two domains agree on what "the same answer" means. If they
 * ever need to diverge, that divergence should be a deliberate edit here with a test, not an
 * accident of one of them being refactored.
 *
 * ## Blank questions are compared case- and whitespace-insensitively, choices are not
 *
 * A blank answer is text a pupil typed, so `" Beijing "` and `"beijing"` are the same answer. A
 * choice answer is an option **id** the UI produced (`"a"`, `"b"`), so it is compared exactly -
 * folding case there would only ever hide a bug in whichever layer built the list.
 */

import type {
  HomeworkAnswerValue,
  HomeworkOption,
  HomeworkQuestionType,
  HomeworkReferenceAnswer,
} from '@thinkclass/contracts/domains/homework';

/**
 * The objectively gradable question types.
 *
 * `short` is the one type whose correctness needs judgement, which is exactly what the AI grader
 * and the teacher's rubric exist for. Kept as a runtime set here rather than in the contracts
 * package because guardrail G6 keeps that package type-only.
 */
const OBJECTIVE_TYPES: ReadonlySet<string> = new Set(['single', 'multiple', 'blank']);

export function isObjectiveType(type: string): boolean {
  return OBJECTIVE_TYPES.has(type);
}

/** Stable string form of any answer value, as `plugins/learning` computes it. */
export function normalizeAnswer(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Parse a JSON column that may also hold plain text, as `plugins/learning` does. */
export function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/** Text comparison for blank answers: case-insensitive, whitespace-collapsed, trimmed. */
function foldText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The option ids of an answer, tolerating a bare string for a single-choice answer. */
function choiceIdsOf(value: HomeworkAnswerValue | undefined): string[] {
  const raw = value?.choice;
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.map((entry) => String(entry));
  return [String(raw)];
}

/** The text of an answer, tolerating a number. */
function textOf(value: HomeworkAnswerValue | undefined): string {
  const raw = value?.text;
  return raw === undefined || raw === null ? '' : String(raw);
}

export interface GradeQuestionInput {
  type: HomeworkQuestionType | string;
  points: number;
  reference: HomeworkReferenceAnswer;
  /** The rubric lines, used only for `short` questions. */
  rubric?: Array<{ label: string; points: number }>;
}

export interface GradeQuestionResult {
  /**
   * Null means "this grader declines to judge" - a short answer with no rubric, or an empty
   * answer that should be left to the teacher rather than silently scored 0.
   *
   * It is deliberately not 0. A 0 is a claim ("this is worth nothing"); null is the absence of a
   * claim, and the difference is what stops an ungraded question from being published as a fail.
   */
  score: number | null;
  isCorrect: boolean | null;
  comment: string;
  /** Which rubric lines the answer matched, for the UI to show its work. */
  matched: string[];
}

/**
 * Grade one answer where the answer is objectively checkable.
 *
 * An empty answer is `null`, not 0: a pupil who skipped a question has not answered it wrongly,
 * they have not answered it, and the teacher decides what that is worth. A blank question with no
 * accepted spellings is also `null` - there is nothing to compare against, and scoring every
 * answer 0 because the reference is missing would be a confidently wrong answer.
 */
export function gradeObjectiveAnswer(
  input: GradeQuestionInput,
  value: HomeworkAnswerValue | undefined,
): GradeQuestionResult {
  const points = Number.isFinite(input.points) ? input.points : 0;

  if (input.type === 'blank') {
    const actual = foldText(textOf(value));
    if (!actual) return { score: null, isCorrect: null, comment: '未作答', matched: [] };

    const accepted = (input.reference.accept ?? []).map((entry) => foldText(entry)).filter(Boolean);
    if (accepted.length === 0) {
      return {
        score: null,
        isCorrect: null,
        comment: '该题未设置参考答案，无法自动判定',
        matched: [],
      };
    }

    const hit = accepted.includes(actual);
    return {
      score: hit ? points : 0,
      isCorrect: hit,
      comment: hit ? '与参考答案一致' : '与参考答案不一致',
      matched: [],
    };
  }

  // single / multiple
  const actual = choiceIdsOf(value).slice().sort();
  if (actual.length === 0) return { score: null, isCorrect: null, comment: '未作答', matched: [] };

  const expected = (input.reference.choice ?? []).map((entry) => String(entry)).sort();
  if (expected.length === 0) {
    return { score: null, isCorrect: null, comment: '该题未设置参考答案，无法自动判定', matched: [] };
  }

  // Set equality, not a prefix match: a multiple-choice answer that includes an extra wrong option
  // is wrong, and one that misses an option is wrong. Partial credit is the rubric's job, and a
  // choice question has no rubric.
  const hit = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
  return {
    score: hit ? points : 0,
    isCorrect: hit,
    comment: hit ? '选项完全正确' : `正确选项为 ${expected.join('、')}`,
    matched: [],
  };
}

/**
 * Grade a short answer against its rubric.
 *
 * The rubric is a list of things the answer should contain, each worth some points, and the score
 * is the share of those points whose keywords appear in the answer. This is a *keyword* grader and
 * says so in its comment: it is what makes the no-model default useful ("you mentioned 3 of the 4
 * expected points") without pretending to understand the prose.
 *
 * Confidence is reported so callers can decide whether to trust it. A rubric with no usable
 * keywords yields 0 confidence and a null score, because a rubric line nobody can match against is
 * a configuration problem, not a wrong answer - and the teacher needs to be told which it is.
 */
export function gradeShortAnswer(
  input: GradeQuestionInput,
  value: HomeworkAnswerValue | undefined,
): { result: GradeQuestionResult; confidence: number } {
  const text = foldText(textOf(value));
  if (!text) {
    return {
      result: { score: null, isCorrect: null, comment: '未作答', matched: [] },
      confidence: 1,
    };
  }

  const rubric = (input.rubric ?? []).filter((entry) => entry && String(entry.label).trim() !== '');
  if (rubric.length === 0) {
    return {
      result: {
        score: null,
        isCorrect: null,
        comment: '简答题未设置评分要点，需要老师批改',
        matched: [],
      },
      confidence: 0,
    };
  }

  const matched: string[] = [];
  let earned = 0;
  let possible = 0;
  for (const entry of rubric) {
    const points = Number.isFinite(entry.points) ? Number(entry.points) : 0;
    possible += points;
    if (text.includes(foldText(entry.label))) {
      matched.push(entry.label);
      earned += points;
    }
  }

  if (possible <= 0) {
    return {
      result: { score: null, isCorrect: null, comment: '评分要点未设置分值', matched: [] },
      confidence: 0,
    };
  }

  const share = matched.length / rubric.length;
  return {
    result: {
      score: Math.round((earned / possible) * (Number.isFinite(input.points) ? input.points : possible)),
      // `isCorrect` stays null for a short answer whatever the score: "partially right" is not a
      // boolean, and marking a prose answer as a yes/no is the kind of simplification that makes a
      // grade sheet lie.
      isCorrect: null,
      comment:
        matched.length === 0
          ? `未命中评分要点（${rubric.map((entry) => entry.label).join('、')}）`
          : `命中 ${matched.length}/${rubric.length} 个评分要点：${matched.join('、')}`,
      matched,
    },
    // Keyword matching against a rubric a human wrote is a real signal, but a coarse one: it
    // cannot tell "because" from "because of". Capped below 1 so nothing downstream treats it as
    // a verified grade, and scaled by how much of the rubric was actually matchable.
    confidence: Math.min(0.6, 0.2 + share * 0.4),
  };
}

/** A reference answer's human-readable form, for prompts and for the teacher's review. */
export function describeReference(
  type: HomeworkQuestionType | string,
  reference: HomeworkReferenceAnswer,
  options: HomeworkOption[] = [],
): string {
  if (type === 'blank') return (reference.accept ?? []).join(' / ') || '(未设置)';
  if (type === 'short') return reference.text?.trim() || '(未设置)';
  const ids = reference.choice ?? [];
  if (ids.length === 0) return '(未设置)';
  const labels = ids.map((id) => options.find((option) => option.id === id)?.text ?? id);
  return labels.join('、');
}
