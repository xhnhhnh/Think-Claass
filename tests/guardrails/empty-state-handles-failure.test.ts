/**
 * G24: a failed read must not be rendered as an empty result.
 *
 * This round's whole subject was closure, and the defect it kept finding was not a missing feature -
 * it was a page answering the wrong question. `useQuery` hands back `isError` next to `data`, and 30
 * pages read only the second one, so a broken request rendered 「暂时没有作业」, 「本周的任务都完成
 * 啦！」, 「班级还没有学生，点击"添加学生"开始」, 「暂未配置抽奖」, 「还没有约定哦」. Each of those is
 * an assertion about the world made from a request that never arrived - and two of them are actively
 * harmful: the teacher's empty roster invites re-adding pupils who exist, the parent's invites a
 * duplicate agreement.
 *
 * The rule this file enforces is deliberately narrow and mechanical, so it cannot drift into taste:
 *
 *   **A file that renders `<EmptyState>` and reads data through a hook must also handle failure.**
 *
 * "Handle" means one of the four shapes the codebase actually uses:
 *   - React Query: `isError` (destructured or read off the query object);
 *   - a manual fetch: a `load*Error` state flag;
 *   - `error` from `useStudentReport`-style hooks that answer a discriminated `error`;
 *   - an `error=` prop passed down to a component that owns the state (`DataTable`, `CrudPage`).
 *
 * False positives were the reason this could not be written earlier (a page can be empty for reasons
 * that have nothing to do with a request), so the check is paired with a small allowance list, and
 * the allowance is a ratchet: it may only shrink. Every entry names why that page's emptiness is
 * genuine.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROOT } from './lib/paths.mjs';

/** Files allowed to render an empty state with no failure branch, each with its reason. */
const EMPTY_WITHOUT_ERROR_ALLOWANCE: Record<string, string> = {
  /*
    Empty on purpose, and the point is to keep it that way: the pages that motivated this check now
    carry a failure branch. An entry belongs here only when the emptiness is about the *data* rather
    than about effort - e.g. a page whose empty state comes from local state (a filter, a search box,
    a wizard step) and which reads nothing at all.
  */
};

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__snapshots__') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/** Every `.tsx` under `src/`, relative to the repo root, as `src/...`. */
function clientFiles(): string[] {
  return walk(path.join(ROOT, 'src'))
    .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))
    .sort();
}

/** `true` when the file handles a failed read in one of the shapes the codebase uses. */
function handlesFailure(source: string): boolean {
  return (
    // React Query: `isError`, or the per-query alias the page destructured (`questionsError`).
    /\bisError\b/.test(source) ||
    /\b[a-z]\w*Error\b/.test(source) ||
    // A manual fetch's own state flag, whether it is set or read (`loadError`, `bigscreenError`).
    /\bset[A-Z]\w*Error\b/.test(source) ||
    // A discriminated `error` handed back by an analytics-style hook.
    /\berror\s*&&/.test(source) ||
    /&&\s*error\b/.test(source) ||
    /\bif\s*\(\s*error\b/.test(source) ||
    /\berror\s*\?/.test(source) ||
    // Passed down to a component that owns the state (`DataTable`, `CrudPage`).
    /\berror=\{/.test(source)
  );
}

/** `true` when the file reads data through a hook (`useSomething(`). */
function readsThroughAHook(source: string): boolean {
  return /\buse[A-Z]\w*\s*\(/.test(source);
}

describe('G24: an empty state is never a stand-in for a failed read', () => {
  it('every page with an empty state also handles the failure of the read behind it', () => {
    const allowance = new Set(Object.keys(EMPTY_WITHOUT_ERROR_ALLOWANCE));
    const offenders: string[] = [];

    for (const file of clientFiles()) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      if (!source.includes('<EmptyState')) continue;
      if (!readsThroughAHook(source)) continue;
      if (allowance.has(file)) continue;
      if (!handlesFailure(source)) offenders.push(file);
    }

    expect(
      offenders,
      'These files render <EmptyState> and read data, but never handle a failed read - so a broken\n' +
        'request renders as "there is nothing here". Add an `isError` branch (and a retry) before the\n' +
        'empty state, or record the file in EMPTY_WITHOUT_ERROR_ALLOWANCE with its reason:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('keeps the allowance honest: an entry that gained a failure branch leaves the list', () => {
    const stale = Object.keys(EMPTY_WITHOUT_ERROR_ALLOWANCE).filter((file) => {
      const full = path.join(ROOT, file);
      if (!fs.existsSync(full)) return true; // the file is gone: the entry must go too
      const source = fs.readFileSync(full, 'utf8');
      // Still allowed while it renders an empty state without a failure branch; stale otherwise.
      return !(source.includes('<EmptyState') && readsThroughAHook(source) && !handlesFailure(source));
    });

    expect(
      stale,
      `these entries are no longer needed and must leave EMPTY_WITHOUT_ERROR_ALLOWANCE:\n${stale.join('\n')}`,
    ).toEqual([]);
  });

  it('the detector discriminates, so a green run means something', () => {
    // Without this, a regex that matched every file would make the check above vacuous - the classic
    // way a guardrail turns into decoration.
    const ignored = [
      'const { data, isLoading } = useThing();',
      'return isLoading ? <Spinner /> : data.length === 0 ? <EmptyState title="暂时没有" /> : <List />;',
    ].join('\n');
    const handled = [
      'const { data, isLoading, isError, refetch } = useThing();',
      'if (isError) return <ErrorBlock onRetry={refetch} />;',
      'return isLoading ? <Spinner /> : data.length === 0 ? <EmptyState title="暂时没有" /> : <List />;',
    ].join('\n');

    expect(handlesFailure(ignored), 'the detector matches a page that ignores failure').toBe(false);
    expect(handlesFailure(handled)).toBe(true);
  });

  it('covers the client it claims to cover', () => {
    // A guardrail that silently stopped walking the tree would pass forever.
    const files = clientFiles();
    expect(files.length).toBeGreaterThan(150);
    // 108 of them live under `src/features/`; the floor is a "the walk still works" tripwire, not a
    // target, so it sits well below the real number.
    expect(files.filter((file) => file.startsWith('src/features/')).length).toBeGreaterThan(90);
  });
});
