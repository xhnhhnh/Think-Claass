/**
 * The command registry: filter/rank behaviour, and the stale-callback trap.
 *
 * The ranking assertions are pure functions and cheap to pin. The third test is the one that
 * matters, because it covers a defect that was reported by an agent rather than found by a
 * test: a registered command whose `run` reads mutable page state used to execute the closure
 * from the render that *registered* it, so "submit the answers so far" would submit the answers
 * as they were when the page first mounted. The agent that hit it worked around it by holding
 * its handlers in a ref; that workaround is now unnecessary, and this test is what keeps it
 * unnecessary.
 */

import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  CommandRegistryProvider,
  rankCommands,
  scoreCommand,
  useCommandRunner,
  usePageCommands,
  useRegisterPageCommands,
  type Command,
} from '@/app/commands/registry';

const command = (overrides: Partial<Command> & { id: string; label: string }): Command => ({
  group: '前往',
  ...overrides,
});

describe('scoreCommand', () => {
  it('prefers an exact match, then a prefix, then a substring', () => {
    const target = command({ id: 'nav:/a', label: '考试成绩' });

    expect(scoreCommand(target, '考试成绩')).toBe(0);
    expect(scoreCommand(target, '考试')).toBe(1);
    expect(scoreCommand(target, '成绩')).toBe(2);
  });

  it('falls back to keywords, then to the id', () => {
    const withKeyword = command({ id: 'nav:/a', label: '考试与成绩', keywords: ['score'] });
    expect(scoreCommand(withKeyword, 'score')).toBe(3);

    const byPath = command({ id: 'nav:/student/papers', label: '试卷练习' });
    expect(scoreCommand(byPath, '/student/papers')).toBe(5);
  });

  it('reports no match as -1', () => {
    expect(scoreCommand(command({ id: 'nav:/a', label: '班级管理' }), 'zzz')).toBe(-1);
  });

  it('matches nothing against an empty query, so an empty palette lists everything', () => {
    expect(scoreCommand(command({ id: 'nav:/a', label: '班级管理' }), '  ')).toBe(0);
  });
});

describe('rankCommands', () => {
  const commands = [
    command({ id: 'nav:/teacher/exams', label: '考试与成绩' }),
    command({ id: 'nav:/teacher/classes', label: '班级与学生管理' }),
    command({ id: 'nav:/teacher/features', label: '功能开关' }),
  ];

  it('sorts by score and drops non-matches', () => {
    const results = rankCommands(commands, '班');
    expect(results.map((entry) => entry.label)).toContain('班级与学生管理');
    expect(results.map((entry) => entry.label)).not.toContain('考试与成绩');
  });

  it('puts recents first when the query is empty, without duplicating them', () => {
    const results = rankCommands(commands, '', ['nav:/teacher/features']);
    expect(results[0].id).toBe('nav:/teacher/features');
    expect(results.filter((entry) => entry.id === 'nav:/teacher/features')).toHaveLength(1);
    expect(results[0].group).toBe('最近使用');
  });
});

/**
 * A page whose command list is rebuilt on every render, with a callback that reads state.
 *
 * This is the realistic shape the trap appeared in - a page with an input and a command that
 * acts on what has been typed.
 */
function PageWithStatefulCommand({ onRead }: { onRead: (value: string) => void }) {
  const [value, setValue] = useState('first');

  useRegisterPageCommands([
    { id: 'page:submit', label: '提交', run: () => onRead(value) },
  ]);

  return (
    <button type="button" onClick={() => setValue('second')}>
      改变
    </button>
  );
}

/** Reads whatever the registry currently holds, and the runner the palette uses. */
function RegistryProbe({
  onCommands,
  onRunner,
}: {
  onCommands: (commands: ReturnType<typeof usePageCommands>) => void;
  onRunner: (run: ReturnType<typeof useCommandRunner>) => void;
}) {
  onCommands(usePageCommands());
  onRunner(useCommandRunner());
  return null;
}

describe('useRegisterPageCommands', () => {
  it('publishes the page\'s commands and clears them on unmount', () => {
    let seen: ReturnType<typeof usePageCommands> = [];

    const { unmount } = render(
      <CommandRegistryProvider>
        <PageWithStatefulCommand onRead={() => {}} />
        <RegistryProbe onCommands={(commands) => (seen = commands)} onRunner={() => {}} />
      </CommandRegistryProvider>,
    );

    expect(seen.map((entry) => entry.id)).toEqual(['page:submit']);

    unmount();
  });

  it('runs the latest callback, not the one from the render that registered it', () => {
    /*
     * The regression, and the reason `useCommandRunner` exists.
     *
     * The command object the palette holds is a snapshot from the page's render, so calling
     * `command.run` directly executes the closure from that render. A palette that stays open
     * while the page underneath changes - a form being filled in, a rating being chosen - would
     * submit what was true when the palette opened. The runner resolves by id at call time.
     *
     * Both halves are asserted: the naive call is stale (which is what makes this a real
     * regression test rather than a restatement of the implementation), and the runner is not.
     */
    const reads: string[] = [];
    let seen: ReturnType<typeof usePageCommands> = [];
    let run: ReturnType<typeof useCommandRunner> = () => {};

    const { getByRole } = render(
      <CommandRegistryProvider>
        <PageWithStatefulCommand onRead={(value) => reads.push(value)} />
        <RegistryProbe
          onCommands={(commands) => (seen = commands)}
          onRunner={(runner) => (run = runner)}
        />
      </CommandRegistryProvider>,
    );

    act(() => {
      getByRole('button', { name: '改变' }).click();
    });

    // The snapshot the palette captured is stale...
    act(() => {
      seen[0].run();
    });
    expect(reads).toEqual(['first']);

    // ...and the runner, which is what the palette actually calls, is not.
    act(() => {
      run('page:submit');
    });
    expect(reads).toEqual(['first', 'second']);
  });
});
