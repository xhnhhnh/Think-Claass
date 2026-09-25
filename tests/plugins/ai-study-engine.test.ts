/**
 * The 智选 rule, as a pure function.
 *
 * `ai-study.engine.ts` has no `ctx`, no database and no clock of its own, which is what makes this
 * file possible and what makes it worth writing: the ranking arithmetic is the part most likely to be
 * wrong and least likely to be noticed, because a set that is merely mediocre looks exactly like a
 * set that is good. So the assertions here are about *properties a set must have* rather than about a
 * frozen expected output:
 *
 *   - the same input produces the same set, twice;
 *   - a question the student has missed outranks one they have not, with everything else equal;
 *   - a lower mastery outranks a higher one;
 *   - a weak knowledge node pulls its questions up;
 *   - difficulty fit follows the student's own accuracy, including the "no data" case, which must not
 *     collapse into "start with the easiest questions in the bank";
 *   - no single question type may fill a set;
 *   - the reasons are not empty and not all identical.
 *
 * A frozen snapshot would pass all of those and still be wrong the moment the weights were tuned -
 * and the weights are a product judgement that is expected to be tuned. These assertions survive that.
 */

import { describe, expect, it } from 'vitest';

import {
  ENGINE_VERSION,
  SET_SIZE_DEFAULT,
  SET_SIZE_MAX,
  SET_SIZE_MIN,
  clampSize,
  rankCandidates,
  targetDifficulty,
} from '../../plugins/ai-study/src/ai-study.engine.js';
import type { EngineCandidate, EngineInput } from '../../plugins/ai-study/src/ai-study.types.js';

/** A candidate with everything optional left neutral, so one difference is the only difference. */
function candidate(id: number, overrides: Partial<EngineCandidate> = {}): EngineCandidate {
  return {
    questionId: id,
    type: 'single',
    difficulty: 3,
    points: 5,
    subjectId: 1,
    nodeIds: [],
    isSubjective: false,
    ...overrides,
  };
}

function input(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    candidates: [],
    wrongQuestions: [],
    weakNodes: [],
    accuracy: { correct: 0, total: 0 },
    excludeQuestionIds: [],
    size: SET_SIZE_DEFAULT,
    ...overrides,
  };
}

describe('the ranking is deterministic', () => {
  it('the same input produces the same order twice', () => {
    const payload = input({
      candidates: [
        candidate(5, { difficulty: 2 }),
        candidate(3, { difficulty: 4 }),
        candidate(9, { difficulty: 3 }),
        candidate(1, { difficulty: 3 }),
      ],
      accuracy: { correct: 7, total: 10 },
    });

    const first = rankCandidates(payload).map((item) => item.questionId);
    const second = rankCandidates(payload).map((item) => item.questionId);

    expect(first).toEqual(second);
  });

  it('ties are broken by question id, not by the order the bank returned', () => {
    // Every candidate scores identically, so the only thing that can order them is the tie-break.
    const ranked = rankCandidates(
      input({ candidates: [candidate(30), candidate(10), candidate(20)], size: 3 }),
    );

    expect(ranked.map((item) => item.questionId)).toEqual([10, 20, 30]);
  });
});

describe('the factors that decide a set', () => {
  it('a previously missed question outranks an identical fresh one', () => {
    const ranked = rankCandidates(
      input({
        candidates: [candidate(1), candidate(2)],
        wrongQuestions: [{ questionId: 1, wrongCount: 2, masteryScore: 0.2, nodeIds: [] }],
        size: 2,
      }),
    );

    expect(ranked[0].questionId).toBe(1);
    expect(ranked[0].factors.masteryGap).toBeGreaterThan(0);
    expect(ranked[0].factors.repeatMiss).toBe(16);
  });

  it('lower mastery outranks higher mastery', () => {
    const ranked = rankCandidates(
      input({
        candidates: [candidate(1), candidate(2)],
        wrongQuestions: [
          { questionId: 1, wrongCount: 1, masteryScore: 0.1, nodeIds: [] },
          { questionId: 2, wrongCount: 1, masteryScore: 0.8, nodeIds: [] },
        ],
        size: 2,
      }),
    );

    expect(ranked[0].questionId).toBe(1);
  });

  it('a weak knowledge node pulls its questions up', () => {
    const ranked = rankCandidates(
      input({
        candidates: [candidate(1, { nodeIds: [7] }), candidate(2, { nodeIds: [8] })],
        weakNodes: [{ nodeId: 7, name: '分数加减法', importance: 5, wrongCount: 4 }],
        size: 2,
      }),
    );

    expect(ranked[0].questionId).toBe(1);
    expect(ranked[0].factors.weakNode).toBe(5 * 4 + 4);
    expect(ranked[0].reason).toContain('分数加减法');
  });

  it('the weak-node term takes the best matching node rather than summing them', () => {
    const one = rankCandidates(
      input({
        candidates: [candidate(1, { nodeIds: [7] })],
        weakNodes: [{ nodeId: 7, name: 'A', importance: 3, wrongCount: 1 }],
        size: 1,
      }),
    );
    const two = rankCandidates(
      input({
        candidates: [candidate(1, { nodeIds: [7, 8, 9] })],
        weakNodes: [
          { nodeId: 7, name: 'A', importance: 3, wrongCount: 1 },
          { nodeId: 8, name: 'B', importance: 1, wrongCount: 1 },
          { nodeId: 9, name: 'C', importance: 1, wrongCount: 1 },
        ],
        size: 1,
      }),
    );

    expect(two[0].factors.weakNode).toBe(one[0].factors.weakNode);
  });

  it('excluded questions never appear in the set', () => {
    const ranked = rankCandidates(
      input({
        candidates: [candidate(1), candidate(2), candidate(3)],
        excludeQuestionIds: [1, 2],
        size: 3,
      }),
    );

    expect(ranked.map((item) => item.questionId)).toEqual([3]);
  });
});

describe('difficulty follows the student', () => {
  it('no history answers the neutral band rather than the easiest one', () => {
    expect(targetDifficulty({ correct: 0, total: 0 })).toBe(3);
  });

  it('accuracy picks the band', () => {
    expect(targetDifficulty({ correct: 9, total: 10 })).toBe(4);
    expect(targetDifficulty({ correct: 7, total: 10 })).toBe(3);
    expect(targetDifficulty({ correct: 2, total: 10 })).toBe(2);
  });

  it('a question at the target difficulty outranks one two bands away', () => {
    const ranked = rankCandidates(
      input({
        candidates: [candidate(1, { difficulty: 2 }), candidate(2, { difficulty: 4 })],
        accuracy: { correct: 9, total: 10 },
        size: 2,
      }),
    );

    expect(ranked[0].questionId).toBe(2);
  });

  it('a question with no difficulty set is scored as the neutral band', () => {
    const explicit = rankCandidates(input({ candidates: [candidate(1, { difficulty: 3 })], size: 1 }));
    const missing = rankCandidates(input({ candidates: [candidate(1, { difficulty: null })], size: 1 }));

    expect(missing[0].score).toBe(explicit[0].score);
  });
});

describe('a set is varied and bounded', () => {
  it('no single type fills the set', () => {
    const candidates = Array.from({ length: 10 }, (_, index) => candidate(index + 1, { type: 'single' }));
    const mixed = [
      ...candidates,
      ...Array.from({ length: 4 }, (_, index) => candidate(100 + index, { type: 'blank' })),
    ];

    const ranked = rankCandidates(input({ candidates: mixed, size: 5 }));
    const singles = ranked.filter((item) => item.type === 'single').length;

    // ceil(5 * 0.6) === 3.
    expect(singles).toBeLessThanOrEqual(3);
    expect(ranked).toHaveLength(5);
  });

  it('a bank with only one type still fills the set from the reserve', () => {
    const candidates = Array.from({ length: 6 }, (_, index) => candidate(index + 1, { type: 'single' }));
    const ranked = rankCandidates(input({ candidates, size: 5 }));

    expect(ranked).toHaveLength(5);
    expect(ranked.every((item) => item.type === 'single')).toBe(true);
  });

  it('a pool smaller than the requested size returns what there is', () => {
    const ranked = rankCandidates(input({ candidates: [candidate(1), candidate(2)], size: 5 }));

    expect(ranked).toHaveLength(2);
  });
});

describe('size clamping', () => {
  it('holds between the bounds and defaults on garbage', () => {
    expect(clampSize(0)).toBe(SET_SIZE_MIN);
    expect(clampSize(500)).toBe(SET_SIZE_MAX);
    expect(clampSize('abc')).toBe(SET_SIZE_DEFAULT);
    expect(clampSize(undefined)).toBe(SET_SIZE_DEFAULT);
    expect(clampSize(4.7)).toBe(4);
  });
});

describe('reasons', () => {
  it('every item carries one, and they are not all the same sentence', () => {
    const ranked = rankCandidates(
      input({
        candidates: [
          candidate(1, { nodeIds: [7], difficulty: 2 }),
          candidate(2, { difficulty: 4 }),
          candidate(3, { difficulty: 3 }),
        ],
        wrongQuestions: [{ questionId: 3, wrongCount: 3, masteryScore: 0.2, nodeIds: [] }],
        weakNodes: [{ nodeId: 7, name: '分数加减法', importance: 5, wrongCount: 4 }],
        size: 3,
      }),
    );

    const reasons = ranked.map((item) => item.reason);
    expect(reasons.every((reason) => reason.trim().length > 0)).toBe(true);
    expect(new Set(reasons).size).toBeGreaterThan(1);
  });

  it('the version constant is an integer, because stored sets are read against it', () => {
    expect(Number.isInteger(ENGINE_VERSION)).toBe(true);
  });
});
