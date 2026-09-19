/**
 * Answer/row mapping helpers, moved unchanged from
 * `api/modules/challenge/challenge.mappers.ts`.
 *
 * Pure functions with no storage or port dependency, so they are the one part of the
 * domain that did not have to change shape during the plugin migration - kept in
 * their own file for exactly that reason.
 */

import type { ChallengeAnswerInput, ChallengeQuestionDto } from '@thinkclass/contracts/domains/challenge';

import type { ChallengeQuestionRow } from './challenge.types.js';

export function parseMaybeJson(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function mapQuestionRow(row: ChallengeQuestionRow): ChallengeQuestionDto {
  return {
    id: row.id,
    title: row.title,
    type: row.type as ChallengeQuestionDto['type'],
    options: parseMaybeJson(row.options) as string[] | string,
  };
}

export function toAnswerList(answers: Record<number, unknown> | ChallengeAnswerInput[]) {
  if (Array.isArray(answers)) return answers;
  return Object.entries(answers).map(([questionId, answer]) => ({ questionId: Number(questionId), answer }));
}

function normalizeAnswer(value: unknown) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) {
    return [...parsed].map(String).sort();
  }
  return String(parsed);
}

export function isAnswerCorrect(userAnswer: unknown, correctAnswer: unknown) {
  const normalizedUser = normalizeAnswer(userAnswer);
  const normalizedCorrect = normalizeAnswer(correctAnswer);
  return JSON.stringify(normalizedUser) === JSON.stringify(normalizedCorrect);
}
