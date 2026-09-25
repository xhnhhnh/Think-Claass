/**
 * homework grading and AI provider tests.
 *
 * Two layers, both about the same claim: **the AI is an assist and never invents a mark.**
 *
 *   1. the pure graders in `homework.grading.ts`, which decide the objectively checkable half. They
 *      are the source of truth the mock provider reuses, so `score: null` ("I decline to judge") has
 *      to be distinguishable from `score: 0` ("this is worth nothing") at this level or the
 *      distinction cannot survive further up;
 *   2. the provider port - the mock's determinism, and the HTTP provider's refusal to produce a score
 *      from a reply it could not parse. The second is the dangerous case: an unparseable model reply
 *      is common, and the tempting shortcut (regex the first integer out of it) is how a grader ends
 *      up putting marks on a sheet that the model never gave.
 *
 * `resolveHomeworkProvider` is asserted to degrade to the mock *with a reason* rather than throw,
 * because a teacher pressing 「AI 判分」 with a broken key should still get the objective questions
 * graded and a line explaining what is missing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@thinkclass/kernel';

import {
  AI_GENERATE_SYSTEM_PROMPT,
  AI_SETTING_KEYS,
  buildGeneratePrompt,
  buildGradePrompt,
  createHttpProvider,
  createMockProvider,
  normaliseCandidateQuestion,
  parseGenerateReply,
  parseGradeReply,
  resolveHomeworkProvider,
  type AiGenerateRequest,
  type AiQuestionInput,
} from '../../plugins/homework/src/homework.ai.js';
import {
  describeReference,
  gradeObjectiveAnswer,
  gradeShortAnswer,
  isObjectiveType,
} from '../../plugins/homework/src/homework.grading.js';
import {
  AI_GENERATE_SYSTEM_PROMPT,
  GENERATABLE_TYPES,
  QUESTION_TEMPLATES,
  TEMPLATE_MAX_TOKENS,
  maxTokensFor,
  renderGeneratePrompt,
} from '../../plugins/homework/src/homework.templates.js';

/** A choice question worth 5, correct answer `b`. */
function singleChoice(): AiQuestionInput {
  return {
    question_id: 1,
    type: 'single',
    stem: '下列哪个是质数？',
    options: [
      { id: 'a', text: '4' },
      { id: 'b', text: '7' },
      { id: 'c', text: '9' },
    ],
    reference: { choice: ['b'] },
    rubric: [],
    points: 5,
  };
}

/** A blank question worth 3 accepting two spellings. */
function blankQuestion(): AiQuestionInput {
  return {
    question_id: 2,
    type: 'blank',
    stem: '中国的首都是____。',
    options: [],
    reference: { accept: ['北京', 'Beijing'] },
    rubric: [],
    points: 3,
  };
}

/** A short question worth 6 with a two-line rubric. */
function shortQuestion(): AiQuestionInput {
  return {
    question_id: 3,
    type: 'short',
    stem: '说明水的三态变化。',
    options: [],
    reference: { text: '固态、液态、气态之间相互转化', rubric: [{ label: '固态', points: 2 }, { label: '液态', points: 2 }, { label: '气态', points: 2 }] } as never,
    rubric: [
      { label: '固态', points: 2 },
      { label: '液态', points: 2 },
      { label: '气态', points: 2 },
    ],
    points: 6,
  };
}

describe('isObjectiveType', () => {
  it('classifies short answers as the non-objective type', () => {
    expect(isObjectiveType('single')).toBe(true);
    expect(isObjectiveType('multiple')).toBe(true);
    expect(isObjectiveType('blank')).toBe(true);
    // The one type whose correctness needs judgement - what the rubric and the AI are for.
    expect(isObjectiveType('short')).toBe(false);
  });
});

describe('gradeObjectiveAnswer', () => {
  it('scores a correct single choice as full marks', () => {
    const result = gradeObjectiveAnswer({ type: 'single', points: 5, reference: { choice: ['b'] } }, { choice: ['b'] });
    expect(result).toMatchObject({ score: 5, isCorrect: true });
  });

  it('scores a wrong single choice as zero', () => {
    const result = gradeObjectiveAnswer({ type: 'single', points: 5, reference: { choice: ['b'] } }, { choice: ['a'] });
    expect(result).toMatchObject({ score: 0, isCorrect: false });
  });

  it('declines an unanswered question instead of calling it wrong', () => {
    // The distinction the whole file protects: a skipped question is not a wrong one, and scoring it
    // 0 would publish a fail the pupil never earned.
    const result = gradeObjectiveAnswer({ type: 'single', points: 5, reference: { choice: ['b'] } }, undefined);
    expect(result.score).toBeNull();
    expect(result.isCorrect).toBeNull();
    expect(result.comment).toBe('未作答');
  });

  it('declines when the question has no reference answer configured', () => {
    const result = gradeObjectiveAnswer({ type: 'blank', points: 3, reference: {} }, { text: '北京' });
    expect(result.score).toBeNull();
    expect(result.comment).toContain('未设置参考答案');
  });

  it('requires an exact option set for a multiple choice', () => {
    const reference = { choice: ['a', 'c'] };
    expect(
      gradeObjectiveAnswer({ type: 'multiple', points: 4, reference }, { choice: ['a', 'c'] }).score,
    ).toBe(4);
    // A superset is wrong, not partially right: partial credit is the rubric's job and a choice
    // question has no rubric.
    expect(
      gradeObjectiveAnswer({ type: 'multiple', points: 4, reference }, { choice: ['a', 'c', 'b'] }).score,
    ).toBe(0);
    expect(gradeObjectiveAnswer({ type: 'multiple', points: 4, reference }, { choice: ['a'] }).score).toBe(0);
  });

  it('ignores option order for a multiple choice', () => {
    const result = gradeObjectiveAnswer(
      { type: 'multiple', points: 4, reference: { choice: ['a', 'c'] } },
      { choice: ['c', 'a'] },
    );
    expect(result.score).toBe(4);
  });

  it('folds case and whitespace for a blank answer, but not for a choice', () => {
    const blank = { type: 'blank', points: 3, reference: { accept: ['Beijing'] } };
    // A blank answer is text a pupil typed, so these are the same answer.
    expect(gradeObjectiveAnswer(blank, { text: '  beijing ' }).score).toBe(3);
    expect(gradeObjectiveAnswer(blank, { text: 'BEIJING' }).score).toBe(3);

    // A choice answer is an option id the UI produced, so folding case would only hide a bug in
    // whichever layer built the list.
    expect(
      gradeObjectiveAnswer({ type: 'single', points: 5, reference: { choice: ['b'] } }, { choice: ['B'] }).score,
    ).toBe(0);
  });

  it('accepts either spelling of a blank answer', () => {
    const blank = { type: 'blank', points: 3, reference: { accept: ['北京', 'Beijing'] } };
    expect(gradeObjectiveAnswer(blank, { text: '北京' }).score).toBe(3);
    expect(gradeObjectiveAnswer(blank, { text: 'Beijing' }).score).toBe(3);
    expect(gradeObjectiveAnswer(blank, { text: '上海' }).score).toBe(0);
  });
});

describe('gradeShortAnswer', () => {
  it('scores the share of rubric points the answer hits', () => {
    const rubric = [{ label: '固态', points: 2 }, { label: '液态', points: 2 }, { label: '气态', points: 2 }];
    const { result, confidence } = gradeShortAnswer(
      { type: 'short', points: 6, reference: {}, rubric },
      { text: '水有固态和液态' },
    );
    expect(result.score).toBe(4);
    expect(result.matched).toEqual(['固态', '液态']);
    // Never a boolean: "partially right" is not a yes/no, and marking prose as one makes the grade
    // sheet claim more than it knows.
    expect(result.isCorrect).toBeNull();
    expect(confidence).toBeGreaterThan(0);
    // Capped below certainty: keyword matching cannot tell "because" from "because of".
    expect(confidence).toBeLessThan(1);
  });

  it('declines, with zero confidence, when there is no rubric', () => {
    const { result, confidence } = gradeShortAnswer(
      { type: 'short', points: 6, reference: {}, rubric: [] },
      { text: '一些答案' },
    );
    expect(result.score).toBeNull();
    expect(confidence).toBe(0);
    expect(result.comment).toContain('需要老师批改');
  });

  it('declines a rubric whose lines carry no points', () => {
    const { result, confidence } = gradeShortAnswer(
      { type: 'short', points: 6, reference: {}, rubric: [{ label: '固态', points: 0 }] },
      { text: '固态' },
    );
    expect(result.score).toBeNull();
    expect(confidence).toBe(0);
  });

  it('declines an unanswered short question with full confidence in the refusal', () => {
    const { result, confidence } = gradeShortAnswer(
      { type: 'short', points: 6, reference: {}, rubric: [{ label: '固态', points: 2 }] },
      undefined,
    );
    expect(result.score).toBeNull();
    expect(result.comment).toBe('未作答');
    expect(confidence).toBe(1);
  });
});

describe('describeReference', () => {
  it('renders option text rather than the ids an answer is stored as', () => {
    expect(describeReference('single', { choice: ['b'] }, singleChoice().options)).toBe('7');
  });

  it('says so when nothing is configured', () => {
    expect(describeReference('short', {})).toBe('(未设置)');
    expect(describeReference('blank', { accept: [] })).toBe('(未设置)');
  });
});

describe('mock provider', () => {
  it('is deterministic across runs', async () => {
    const provider = createMockProvider();
    const request = {
      questions: [singleChoice(), blankQuestion(), shortQuestion()],
      answers: [
        { question_id: 1, value: { choice: ['b'] }, photoCount: 0 },
        { question_id: 2, value: { text: 'beijing' }, photoCount: 0 },
        { question_id: 3, value: { text: '固态和液态之间转化' }, photoCount: 0 },
      ],
    };

    const first = await provider.grade(request);
    const second = await provider.grade(request);
    expect(second).toEqual(first);
  });

  it('agrees with the pure grader on an objective question', async () => {
    const provider = createMockProvider();
    const outcome = await provider.grade({
      questions: [singleChoice()],
      answers: [{ question_id: 1, value: { choice: ['b'] }, photoCount: 0 }],
    });
    const expected = gradeObjectiveAnswer({ type: 'single', points: 5, reference: { choice: ['b'] } }, { choice: ['b'] });
    expect(outcome.lines[0].score).toBe(expected.score);
    // Full confidence, because objective grading is exact rather than a judgement.
    expect(outcome.lines[0].confidence).toBe(1);
  });

  it('declines a photo-only answer instead of scoring it as blank', async () => {
    const provider = createMockProvider();
    const outcome = await provider.grade({
      questions: [shortQuestion()],
      answers: [{ question_id: 3, value: {}, photoCount: 2 }],
    });
    expect(outcome.lines[0].score).toBeNull();
    expect(outcome.lines[0].confidence).toBe(0);
    // It has to say *why*: an empty cell with no explanation is the thing this replaces.
    expect(outcome.lines[0].comment).toContain('照片');
  });

  it('reports a whole-paper message and says it is not a real model', async () => {
    const provider = createMockProvider();
    expect(provider.source).toBe('mock');
    expect(provider.state()).toContain('未接入外部模型');
    const outcome = await provider.grade({ questions: [singleChoice()], answers: [] });
    expect(outcome.message).toBe(provider.state());
    expect(outcome.feedback).toBeTruthy();
  });

  it('answers a question deterministically and names the reference', async () => {
    const provider = createMockProvider();
    const outcome = await provider.ask({
      homeworkTitle: '第三章练习',
      focus: singleChoice(),
      studentAnswer: '4',
      teacherFeedback: null,
      history: [],
      studentQuestion: '为什么不是 4？',
    });
    expect(outcome.text).toContain('7');
    expect(outcome.text).toContain('为什么不是 4');
    expect(outcome.message).toBe(provider.state());
  });
});

describe('http provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses to construct without a base url or key', () => {
    expect(() => createHttpProvider({ baseUrl: '', apiKey: 'k', model: 'm', timeoutMs: 1000 })).toThrow(ApiError);
    expect(() => createHttpProvider({ baseUrl: 'https://x', apiKey: '', model: 'm', timeoutMs: 1000 })).toThrow(
      /ai_api_key/,
    );
  });

  it('sends an OpenAI-compatible request and parses a score', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"score": 4, "confidence": 0.7, "comment": "基本正确", "matched_points": ["固态"]}' } }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createHttpProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'deepseek-chat',
      timeoutMs: 5000,
    });

    const outcome = await provider.grade({
      questions: [shortQuestion()],
      answers: [{ question_id: 3, value: { text: '固态' }, photoCount: 0 }],
    });

    expect(outcome.lines[0]).toMatchObject({ score: 4, confidence: 0.7, matched: ['固态'] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer secret');
    const body = JSON.parse(init.body) as { model: string; temperature: number };
    expect(body.model).toBe('deepseek-chat');
    // Temperature 0: a grader that varies run to run is a grader nobody can appeal.
    expect(body.temperature).toBe(0);
  });

  it('never turns an unparseable reply into a score', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '我觉得大概是 4 分吧' } }] }),
      })),
    );

    const provider = createHttpProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'k',
      model: 'm',
      timeoutMs: 5000,
    });
    const outcome = await provider.grade({
      questions: [shortQuestion()],
      answers: [{ question_id: 3, value: { text: '固态' }, photoCount: 0 }],
    });

    // The failure mode that matters: prose contains "4", and extracting it would be inventing a mark.
    expect(outcome.lines[0].score).toBeNull();
    expect(outcome.lines[0].confidence).toBe(0);
    expect(outcome.lines[0].comment).toContain('无法解析');
  });

  it('records a transport failure against the question without losing the others', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"score": 5, "confidence": 1}' } }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createHttpProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'k',
      model: 'm',
      timeoutMs: 5000,
    });
    const outcome = await provider.grade({
      questions: [singleChoice(), blankQuestion()],
      answers: [
        { question_id: 1, value: { choice: ['b'] }, photoCount: 0 },
        { question_id: 2, value: { text: '北京' }, photoCount: 0 },
      ],
    });

    expect(outcome.lines[0].score).toBeNull();
    expect(outcome.lines[0].comment).toContain('AI 判分失败');
    // The second question's grade survives the first one's failure - and it is clamped to that
    // question's own 3 points even though the model answered "5", which is the other half of the
    // guarantee this fixture happens to exercise.
    expect(outcome.lines[1].score).toBe(3);
  });

  it('reports an upstream error rather than a silent empty grade', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, text: async () => 'invalid api key' })),
    );

    const provider = createHttpProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'bad',
      model: 'm',
      timeoutMs: 5000,
    });
    const outcome = await provider.grade({
      questions: [singleChoice()],
      answers: [{ question_id: 1, value: { choice: ['b'] }, photoCount: 0 }],
    });
    expect(outcome.lines[0].score).toBeNull();
    expect(outcome.lines[0].comment).toContain('401');
  });
});

describe('parseGradeReply', () => {
  it('clamps a score to the question maximum', () => {
    // A model answering "7" for a 5-point question must not be able to put 7 on a grade sheet.
    const line = parseGradeReply(singleChoice(), '{"score": 7, "confidence": 1, "comment": "ok"}');
    expect(line.score).toBe(5);
  });

  it('clamps a negative score to zero', () => {
    expect(parseGradeReply(singleChoice(), '{"score": -3, "confidence": 1}').score).toBe(0);
  });

  it('tolerates a fenced json block', () => {
    const line = parseGradeReply(singleChoice(), '```json\n{"score": 5, "confidence": 0.9, "comment": "对"}\n```');
    expect(line).toMatchObject({ score: 5, confidence: 0.9, comment: '对' });
  });

  it('treats a declared score with no confidence as maximum doubt', () => {
    const line = parseGradeReply(singleChoice(), '{"score": 5}');
    expect(line.score).toBe(5);
    expect(line.confidence).toBe(0);
  });

  it('keeps a null score null', () => {
    const line = parseGradeReply(singleChoice(), '{"score": null, "confidence": 0.1, "comment": "无法判断"}');
    expect(line.score).toBeNull();
    expect(line.comment).toBe('无法判断');
  });
});

describe('resolveHomeworkProvider', () => {
  /** A settings reader over a plain record, as `ctx.settings.getPlatform` behaves. */
  function settingsOf(values: Record<string, string>) {
    return { getPlatform: <T,>(key: string) => values[key] as T | undefined };
  }

  it('defaults to the mock provider with no reason', () => {
    const resolved = resolveHomeworkProvider(settingsOf({}));
    expect(resolved.provider.source).toBe('mock');
    expect(resolved.reason).toBeNull();
  });

  it('builds the http provider when configured', () => {
    const resolved = resolveHomeworkProvider(
      settingsOf({
        [AI_SETTING_KEYS.provider]: 'http',
        [AI_SETTING_KEYS.baseUrl]: 'https://api.example.com/v1',
        [AI_SETTING_KEYS.apiKey]: 'secret',
        [AI_SETTING_KEYS.model]: 'deepseek-chat',
      }),
    );
    expect(resolved.provider.source).toBe('http');
    expect(resolved.reason).toBeNull();
  });

  it('degrades to the mock WITH A REASON when the http config is incomplete', () => {
    // The behaviour that matters operationally: a teacher pressing 「AI 判分」 with a broken key still
    // gets the objective questions graded and a line saying what is missing, rather than a 503 and no
    // marks at all.
    const resolved = resolveHomeworkProvider(
      settingsOf({ [AI_SETTING_KEYS.provider]: 'http', [AI_SETTING_KEYS.baseUrl]: 'https://api.example.com/v1' }),
    );
    expect(resolved.provider.source).toBe('mock');
    expect(resolved.reason).toContain('ai_api_key');
  });

  it('degrades rather than throwing when the host has no settings store', () => {
    // `getPlatform` is optional on the SDK's SettingsApi, so a hand-built test host has none.
    expect(resolveHomeworkProvider(undefined).provider.source).toBe('mock');
    expect(resolveHomeworkProvider({}).provider.source).toBe('mock');
    const throwing = {
      getPlatform: () => {
        throw new Error('this host has no settings store');
      },
    };
    expect(resolveHomeworkProvider(throwing).provider.source).toBe('mock');
  });
});

describe('buildGradePrompt', () => {
  it('carries the reference answer and warns about photos it cannot see', () => {
    const prompt = buildGradePrompt(blankQuestion(), { question_id: 2, value: { text: '上海' }, photoCount: 1 });
    expect(prompt).toContain('中国的首都是');
    expect(prompt).toContain('北京');
    expect(prompt).toContain('上海');
    // Without this line the model would score the text and ignore the photograph.
    expect(prompt).toContain('照片');
  });
});

/** The generation request the prompt builder and the provider both take. */
function generateRequest(overrides: Partial<AiGenerateRequest> = {}): AiGenerateRequest {
  return {
    topic: '分数的加减法',
    type: null,
    count: 3,
    grade: null,
    hint: null,
    contextTitle: null,
    avoid: [],
    ...overrides,
  };
}

describe('question generation - the mock refuses', () => {
  it('returns no questions and says which console field to fill in', async () => {
    const outcome = await createMockProvider().generateQuestions(generateRequest());

    // The whole point of the mock's behaviour: grading and asking have deterministic fallbacks,
    // generation has none, and template filler would be placeholders one click from publication.
    expect(outcome.questions).toEqual([]);
    expect(outcome.skipped).toBe(0);
    expect(outcome.message).toContain('未接入外部模型');
    // Actionable, not just honest: the message has to name where the model is configured.
    expect(outcome.message).toContain('AI 判分与问答');
  });
});

describe('buildGeneratePrompt', () => {
  it('carries the topic, one template and the stems already in the paper', () => {
    const prompt = buildGeneratePrompt(
      generateRequest({
        type: 'single',
        grade: '五年级',
        hint: '每题 5 分',
        contextTitle: '第三章练习',
        avoid: ['1+1=?', '2+3=?'],
      }),
    );

    expect(prompt).toContain('分数的加减法');
    expect(prompt).toContain('五年级');
    expect(prompt).toContain('每题 5 分');
    expect(prompt).toContain('第三章练习');
    // Without the avoid list a second run re-emits the first run's questions, and the teacher has to
    // delete duplicates - which is not help.
    expect(prompt).toContain('1+1=?');
    expect(prompt).toContain('2+3=?');

    // The token saving, asserted: a request for one type carries *one* template, not the description
    // of all four shapes.
    expect(prompt).toContain('[single]');
    expect(prompt).not.toContain('[multiple]');
    expect(prompt).not.toContain('[blank]');
  });

  it('carries all three templates - and no 简答 template - when the type is 混合', () => {
    const prompt = buildGeneratePrompt(generateRequest({ type: null }));

    for (const type of ['single', 'multiple', 'blank']) {
      expect(prompt).toContain(`[${type}]`);
    }
    // `short` is not generatable: its answer is prose and its marking is a rubric, which is what a
    // template cannot pin down. A prompt that offered one would be asking for text to throw away.
    expect(prompt).not.toContain('[short]');
    expect(prompt).not.toContain('"type":"short"');
    expect(prompt).not.toContain('已有题目，不要重复');
  });

  it('says which fields a question may use, so the reply needs no post-processing', () => {
    const prompt = buildGeneratePrompt(generateRequest());
    expect(prompt).toContain('type, stem, options, reference, points');
  });

  it('caps what it spends on the avoid list, because every stem is billed', () => {
    const prompt = buildGeneratePrompt(
      generateRequest({ avoid: Array.from({ length: 40 }, (_entry, index) => `第 ${index} 题：${'很长的题干'.repeat(30)}`) }),
    );

    // 15 stems of 60 characters, not 40 of 200: a duplicate is recognised from the opening words, and
    // the rest is tokens paid for nothing.
    const listed = prompt.split('已有题目，不要重复：')[1] ?? '';
    expect(listed.split(' | ')).toHaveLength(15);
    expect(Math.max(...listed.split(' | ').map((stem) => stem.length))).toBeLessThanOrEqual(60);
  });
});

describe('the generation templates', () => {
  it('covers exactly the three generatable types, each with its own skeleton and rules', () => {
    expect([...GENERATABLE_TYPES]).toEqual(['single', 'multiple', 'blank']);

    for (const type of GENERATABLE_TYPES) {
      const template = QUESTION_TEMPLATES[type];
      expect(template.type).toBe(type);
      expect(template.label).toBeTruthy();
      // The skeleton is what makes the reply parseable, so it must name the type and the answer field
      // the grader for that type reads.
      expect(template.skeleton).toContain(`"type":"${type}"`);
      expect(template.rules.length).toBeGreaterThan(0);
    }

    // The answer field each type's grader actually reads - `reference.choice` for the choice types,
    // `reference.accept` for a blank. A template pointing at the wrong one would produce questions
    // that no grader can mark.
    expect(QUESTION_TEMPLATES.single.skeleton).toContain('"reference":{"choice"');
    expect(QUESTION_TEMPLATES.multiple.skeleton).toContain('"reference":{"choice"');
    expect(QUESTION_TEMPLATES.blank.skeleton).toContain('"reference":{"accept"');
  });

  it('keeps the prompt small enough that the templates are a saving rather than a second copy', () => {
    const single = renderGeneratePrompt(generateRequest({ type: 'single' }));
    const mixed = renderGeneratePrompt(generateRequest({ type: null }));

    // Roughly a token per three characters of Chinese; the numbers are generous ceilings so this
    // fails only on a real regression (a restated type description, an example block, a greeting).
    expect(single.length).toBeLessThan(900);
    expect(mixed.length).toBeLessThan(1500);
    expect(AI_GENERATE_SYSTEM_PROMPT.length).toBeLessThan(220);
  });

  it('caps the output tokens the request may spend', () => {
    // The other half of the budget: a model asked for five questions must not be able to answer with
    // a page of reasoning and bill for it.
    expect(maxTokensFor(5)).toBe(800);
    expect(maxTokensFor(1)).toBe(TEMPLATE_MAX_TOKENS.floor);
    expect(maxTokensFor(100)).toBe(TEMPLATE_MAX_TOKENS.ceiling);
  });
});

describe('normaliseCandidateQuestion - one definition of a usable candidate', () => {
  it('accepts a choice question and defaults a missing mark to the editor default', () => {
    const question = normaliseCandidateQuestion({
      type: 'single',
      stem: ' 下列哪个是质数？ ',
      options: [{ id: 'a', text: '4' }, { id: 'b', text: '7' }],
      reference: { choice: ['b'] },
    });

    expect(question).toMatchObject({ type: 'single', stem: '下列哪个是质数？', points: 5 });
    expect(question?.reference).toEqual({ choice: ['b'] });
    expect(question?.explanation).toBeNull();
  });

  it('repairs an option id the model left out and a bare string choice', () => {
    const question = normaliseCandidateQuestion({
      type: 'multiple',
      stem: '偶数有？',
      options: [{ text: '2' }, { text: '3' }, { text: '4' }],
      reference: { choice: 'a' },
      points: 4,
    });

    expect(question?.options.map((option) => option.id)).toEqual(['a', 'b', 'c']);
    // A bare scalar where a list belongs is a common model slip, and the intent is unambiguous here.
    expect(question?.reference).toEqual({ choice: ['a'] });
    expect(question?.points).toBe(4);
  });

  it('drops what has no intent behind it rather than guessing', () => {
    // No stem.
    expect(normaliseCandidateQuestion({ type: 'single', options: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }], reference: { choice: ['a'] } })).toBeNull();
    // A choice question with fewer than two options.
    expect(normaliseCandidateQuestion({ type: 'single', stem: 'x', options: [{ id: 'a', text: '1' }], reference: { choice: ['a'] } })).toBeNull();
    // A reference naming an option that does not exist, leaving nothing correct.
    expect(normaliseCandidateQuestion({ type: 'single', stem: 'x', options: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }], reference: { choice: ['z'] } })).toBeNull();
    // Two answers on a single-choice question.
    expect(normaliseCandidateQuestion({ type: 'single', stem: 'x', options: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }], reference: { choice: ['a', 'b'] } })).toBeNull();
    // A blank question with nothing accepted.
    expect(normaliseCandidateQuestion({ type: 'blank', stem: 'x', reference: {} })).toBeNull();
    // An unknown type.
    expect(normaliseCandidateQuestion({ type: 'essay', stem: 'x' })).toBeNull();
    // And `short`, which is a real question type but not a generatable one - there is no template for
    // it, so a candidate of that type is not something this request can have produced.
    expect(normaliseCandidateQuestion({ type: 'short', stem: 'x', reference: { text: 'y' } })).toBeNull();
  });
});

describe('parseGenerateReply', () => {
  it('keeps the usable candidates and counts the rest instead of failing the batch', () => {
    const reply = JSON.stringify({
      questions: [
        { type: 'blank', stem: '1+1=?', reference: { accept: ['2'] }, points: 2 },
        { type: 'single', stem: '坏题', options: [{ id: 'a', text: '1' }], reference: { choice: ['a'] } },
        { type: 'nonsense', stem: '更坏' },
        // `short` is no longer generatable at all - its answer is prose and its marking is a rubric,
        // which is what a template cannot pin down. A model that emits one is answering a question
        // nobody asked, so it is dropped and counted like any other unusable candidate.
        { type: 'short', stem: '说说光合作用', reference: { text: '光能转化学能' }, points: 5 },
      ],
    });

    const parsed = parseGenerateReply(reply, 10);
    expect(parsed.unparsed).toBe(false);
    expect(parsed.questions.map((question) => question.type)).toEqual(['blank']);
    // One malformed question out of four must not discard the others - and the loss is reported.
    expect(parsed.skipped).toBe(3);
  });

  it('drops a candidate whose type is not the one the prompt asked for', () => {
    const reply = JSON.stringify({
      questions: [
        { type: 'single', stem: 'asked for blank', options: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }], reference: { choice: ['a'] } },
        { type: 'blank', stem: '1+1=?', reference: { accept: ['2'] } },
      ],
    });

    // A teacher who picked 填空 and gets a choice question back has been handed a paper they did not
    // ask for, so the mismatch is dropped and counted rather than quietly mixed in.
    const filtered = parseGenerateReply(reply, 10, 'blank');
    expect(filtered.questions.map((question) => question.type)).toEqual(['blank']);
    expect(filtered.skipped).toBe(1);

    // 混合 (`null`) accepts any of the three, which is what the console's default sends.
    expect(parseGenerateReply(reply, 10, null).questions).toHaveLength(2);
  });

  it('tolerates a fenced block and a preamble', () => {
    const reply = '好的，这是题目：\n```json\n{"questions":[{"type":"blank","stem":"2+2=?","reference":{"accept":["4"]}}]}\n```';
    const parsed = parseGenerateReply(reply, 5);
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].points).toBe(5);
  });

  it('reports prose or an empty list as unparsed rather than as zero questions', () => {
    expect(parseGenerateReply('我建议你去问老师', 5)).toMatchObject({ questions: [], unparsed: true });
    expect(parseGenerateReply('{"questions": []}', 5)).toMatchObject({ questions: [], unparsed: true });
  });

  it('never returns more than was asked for', () => {
    const questions = Array.from({ length: 8 }, (_entry, index) => ({
      type: 'blank',
      stem: `第 ${index} 题`,
      reference: { accept: ['x'] },
    }));
    const parsed = parseGenerateReply(JSON.stringify({ questions }), 3);
    expect(parsed.questions).toHaveLength(3);
    // Over-delivery is dropped silently: the extras are exactly what was not asked for.
    expect(parsed.skipped).toBe(0);
  });
});

describe('http provider: question generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function provider() {
    return createHttpProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'deepseek-chat',
      timeoutMs: 5000,
    });
  }

  it('asks for JSON, parses candidates and reports what it dropped', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [
                  { type: 'single', stem: '下列哪个是质数？', options: [{ id: 'a', text: '4' }, { id: 'b', text: '7' }], reference: { choice: ['b'] }, points: 5 },
                  { type: 'broken' },
                ],
              }),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await provider().generateQuestions(generateRequest({ count: 2 }));

    expect(outcome.questions).toHaveLength(1);
    expect(outcome.skipped).toBe(1);
    expect(outcome.message).toContain('另有 1 道');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(init.body) as { messages: Array<{ role: string; content: string }>; temperature: number };
    expect(body.messages[0].content).toBe(AI_GENERATE_SYSTEM_PROMPT);
    expect(body.messages[1].content).toContain('分数的加减法');
    // Temperature 0 for the same reason grading uses it: reproducible drafts are reviewable drafts.
    expect(body.temperature).toBe(0);
  });

  it('turns a prose reply into a refusal rather than an invented question', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '我觉得可以出这样几道题：……' } }] }),
      })),
    );

    const outcome = await provider().generateQuestions(generateRequest());
    expect(outcome.questions).toEqual([]);
    // The raw text is quoted so the operator can see *why* - a refusal, a truncation or prose.
    expect(outcome.message).toContain('没有返回可用的题目');
    expect(outcome.message).toContain('我觉得可以出这样几道题');
  });

  it('reports a transport failure as a refusal, not as a thrown error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    );

    // The teacher is holding a dialog with a half-written paper in it: the useful outcome is a
    // sentence in that dialog, not an exception that discards their work.
    const outcome = await provider().generateQuestions(generateRequest());
    expect(outcome.questions).toEqual([]);
    expect(outcome.message).toContain('AI 出题失败');
    expect(outcome.message).toContain('socket hang up');
  });
});

/**
 * `complete` - the one generic model call another plugin borrows.
 *
 * `plugins/ai-study` uses it to re-rank practice candidates, which is why the assertions here are
 * about the *boundary* rather than about a prompt: the caller's own system and user text must reach
 * the model unchanged (so homework learns nothing about 智学), an unconfigured or failing provider
 * must answer with `text: null` and a reason rather than throwing (the caller has a deterministic
 * result to fall back on), and a caller-supplied deadline may shorten the operator's patience but
 * never extend it.
 */
describe('the borrowed completion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the mock has no model to lend, and says which console field to fill in', async () => {
    const outcome = await createMockProvider().complete({ system: 's', user: 'u' });

    expect(outcome.text).toBeNull();
    expect(outcome.available).toBe(false);
    expect(outcome.source).toBe('mock');
    expect(outcome.message).toContain('系统设置');
  });

  it('sends the caller\'s own prompts untouched and returns the reply', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"items":[]}' } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createHttpProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'deepseek-chat',
      timeoutMs: 5000,
    });
    const outcome = await provider.complete({ system: '你是智选助手', user: '候选题如下', maxTokens: 300 });

    expect(outcome).toMatchObject({ text: '{"items":[]}', available: true, source: 'http' });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(init.body) as {
      messages: Array<{ role: string; content: string }>;
      max_tokens?: number;
      temperature: number;
    };
    // The prompt is the caller's, verbatim: nothing 判分/出题 is imposed on it.
    expect(body.messages[0].content).toBe('你是智选助手');
    expect(body.messages[1].content).toBe('候选题如下');
    expect(body.max_tokens).toBe(300);
    expect(body.temperature).toBe(0);
  });

  it('omits max_tokens when the caller has no budget of its own', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createHttpProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'm',
      timeoutMs: 5000,
    });
    await provider.complete({ system: 's', user: 'u' });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).not.toHaveProperty('max_tokens');
  });

  it('turns an empty reply and a transport failure into a refusal, never a throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '   ' } }] }) })),
    );
    const provider = createHttpProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'm',
      timeoutMs: 5000,
    });

    // "The model said nothing" is not an answer: a caller must not mistake `''` for one.
    expect(await provider.complete({ system: 's', user: 'u' })).toMatchObject({
      text: null,
      available: false,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    );
    const failed = await provider.complete({ system: 's', user: 'u' });
    expect(failed.available).toBe(false);
    expect(failed.message).toContain('socket hang up');
  });

  it('a caller may shorten the deadline but not extend it', async () => {
    const timeouts: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { signal: AbortSignal }) => {
        // The abort signal is the only observable of the budget: `setTimeout` fires it. Reading the
        // delay back is done by stubbing timers instead - see the assertion below.
        timeouts.push(init.signal ? 1 : 0);
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
      }),
    );

    const provider = createHttpProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'm',
      timeoutMs: 20_000,
    });

    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.stubGlobal('setTimeout', ((fn: () => void, delay?: number) => {
      delays.push(Number(delay));
      return realSetTimeout(fn, delay);
    }) as unknown as typeof setTimeout);

    await provider.complete({ system: 's', user: 'u', timeoutMs: 3_000 });
    // The operator said "wait up to 20s", the caller said "I can only wait 3s": the shorter wins.
    expect(delays[0]).toBe(3_000);

    delays.length = 0;
    await provider.complete({ system: 's', user: 'u', timeoutMs: 60_000 });
    // And a caller asking for longer than the deployment allows does not get it.
    expect(delays[0]).toBe(20_000);

    expect(timeouts).toHaveLength(2);
  });
});
