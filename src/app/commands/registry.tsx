import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';

import { visibleNavItems } from '@/app/nav/navRegistry';
import { useShellStore } from '@/app/shell/shellStore';
import type { ClassFeatures } from '@/lib/classFeatures.generated';

/**
 * The command registry.
 *
 * ## Why navigation is a command and not only a menu
 *
 * The teacher console has 25 destinations and the student area 22. A rail is a good way
 * to show what exists and a poor way to reach one specific thing: the reader scans, finds,
 * clicks. `⌘K` plus three characters reaches any of them, and the palette is also the one
 * input from which the whole console is searchable.
 *
 * ## Three sources, one list
 *
 *   1. **Destinations** - straight from the route table, so the palette can never offer a
 *      page that does not exist nor miss one that does. Gated by the same feature flags
 *      the rail uses, so it cannot offer a page the reader has switched off: a command
 *      that navigates into a `FeatureRouteGuard` is a command that visibly does nothing.
 *   2. **Page actions** - a page says what it can do ("新建班级", "导出") and the palette
 *      becomes a place to act, not only to go somewhere.
 *   3. **Recents** - what the reader did last, which is usually what they want next.
 *
 * ## Matching
 *
 * CJK has no word boundaries, so substring matching on the label is the primary mechanism
 * and a route's `aliases` are the escape hatch for a page whose label does not contain the
 * word a reader would type. Ranking prefers a prefix match, then a label match, then an
 * alias match, so typing 班 does not put 功能开关 first.
 */

export interface Command {
  id: string;
  label: string;
  /** Section heading in the palette. */
  group: '最近使用' | '前往' | '操作';
  icon?: LucideIcon;
  /** Extra strings that should match this command. */
  keywords?: string[];
  /** Where it goes, for a navigation command. */
  to?: string;
  /** What it does, for an action command. */
  run?: () => void;
  /** A short string shown at the right edge: the path. */
  hint?: string;
  disabled?: boolean;
}

/** What a page registers. Narrower than `Command`: a page does not choose its own group. */
export interface PageCommand {
  id: string;
  label: string;
  icon?: LucideIcon;
  keywords?: string[];
  run: () => void;
  disabled?: boolean;
}

interface CommandRegistryValue {
  /** The command list, resolved fresh on every call so callbacks are never stale. */
  pageCommands: () => PageCommand[];
  register: (commands: PageCommand[]) => void;
  /** Called during render by `useRegisterPageCommands`; never triggers a re-render. */
  setLatest: (commands: PageCommand[]) => void;
}

/**
 * The default is an inert registry, so a page mounted standalone still renders.
 *
 * `setLatest` is a no-op here on purpose: a page outside a shell has no palette to feed, and
 * making the default throw would turn "a page test mounted a page" into a crash.
 */
const CommandRegistryContext = createContext<CommandRegistryValue>({
  pageCommands: () => [],
  register: () => {},
  setLatest: () => {},
});

/**
 * The registry, provided once by the shell, above the routed content.
 *
 * A context rather than a store, because the list belongs to exactly one page at a time:
 * a page registers on mount and clears on unmount, so navigating replaces the actions
 * rather than accumulating them. `register` has a stable identity, so a page can list it
 * as an effect dependency without re-registering on every render - which is what would
 * otherwise loop between the page's effect and the provider's state.
 */
export function CommandRegistryProvider({ children }: { children: ReactNode }) {
  /*
   * Both halves live in refs, and that is the whole design.
   *
   * The obvious version keeps the command list in state and returns it through context. It
   * cannot work: a provider's context value is shared by all of its children and is computed
   * before them, while the page that registers the commands is one of those children. So the
   * value the palette reads is always one render behind the page - which is exactly the
   * stale-callback bug, just harder to see than the version that stored the callbacks.
   *
   * One ref holds the current commands; the selector derives both the identity (which ids
   * exist, in which order - what the palette needs to know the list changed) and the callbacks
   * (which are always the latest render's) from it at the moment the palette asks. That moment
   * is the only one that matters, and it is why there is no state here at all: state would
   * schedule a re-render the provider cannot deliver before its own children finish rendering.
   */
  const registered = useRef<PageCommand[]>([]);

  const register = useCallback((commands: PageCommand[]) => {
    registered.current = commands;
  }, []);

  const setLatest = useCallback((commands: PageCommand[]) => {
    registered.current = commands;
  }, []);

  const value = useMemo<CommandRegistryValue>(
    () => ({ pageCommands: () => registered.current, register, setLatest }),
    [register, setLatest],
  );

  return <CommandRegistryContext.Provider value={value}>{children}</CommandRegistryContext.Provider>;
}

export function usePageCommands(): PageCommand[] {
  return useContext(CommandRegistryContext).pageCommands();
}

/**
 * Run the current version of a registered command, by id.
 *
 * ## Why this exists rather than `command.run()`
 *
 * A command object is a snapshot: it carries the closure from the render that produced it. The
 * palette captures those objects when it renders, so calling `command.run` directly executes
 * whatever the page's state was at *that* moment - and a palette that stays open while the page
 * underneath changes (a form being filled in, a rating being selected) would submit stale data.
 *
 * Returning the command array fresh is not enough on its own: the array is fresh for the
 * palette's render, not for the moment of the click. The lookup has to happen at call time,
 * which is what this indirection buys. The palette therefore renders `onClick={() => run(id)}`
 * and never touches `command.run`.
 *
 * The id is the contract: a page that changes a command's id mid-life is registering a different
 * command, which is correct - the palette's list changes with it.
 */
export function useCommandRunner(): (id: string) => void {
  const { pageCommands } = useContext(CommandRegistryContext);

  return useCallback(
    (id: string) => {
      pageCommands().find((command) => command.id === id)?.run();
    },
    [pageCommands],
  );
}

/** The command a registered id currently resolves to. Used for the palette's disabled state. */
export function useCommandLookup(): (id: string) => PageCommand | undefined {
  const { pageCommands } = useContext(CommandRegistryContext);
  return useCallback((id: string) => pageCommands().find((command) => command.id === id), [pageCommands]);
}

/**
 * Register a page's own commands with the palette.
 *
 * ## Why the callbacks are read from a ref
 *
 * A `run` callback closes over the render that created it. If the registry stored the array
 * from the render that registered it, then a command whose behaviour depends on mutable page
 * state - "submit the answers so far", "send the rating I have selected" - would execute the
 * *first* render's closure and act on stale data. The bug is invisible in a test that clicks
 * immediately and obvious to a reader who types something first.
 *
 * So the effect below registers the *array identity* (which is what the palette needs in order
 * to know the command list changed), while the callbacks always come from the latest render.
 * A page therefore does not have to wrap its handlers in refs itself, which was the workaround
 * the first agent to hit this had to invent.
 *
 * The effect depends on a structural key rather than the array identity: a page that builds
 * its command list inline on every render would otherwise re-register constantly.
 */
export function useRegisterPageCommands(commands: PageCommand[]): void {
  const { register, setLatest } = useContext(CommandRegistryContext);

  // Written during render, not in an effect: the palette may execute a command before this
  // page's effects have run (a navigation and a palette keystroke in the same tick), and a
  // stale callback is exactly the failure being prevented.
  setLatest(commands);

  const key = commands.map((command) => `${command.id}:${command.disabled ? '0' : '1'}`).join('|');

  useEffect(() => {
    register(commands);
    return () => register([]);
    // `key` is the structural identity of `commands`; `register` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, register]);
}

/**
 * The navigation commands for a console.
 *
 * Built from the route table and filtered by the same feature flags the rail uses.
 */
export function useNavigationCommands(
  layoutPath: string | null,
  features: ClassFeatures,
  hidden?: ReadonlySet<string>,
): Command[] {
  const remember = useShellStore((state) => state.rememberCommand);

  return useMemo(() => {
    if (!layoutPath) return [];

    return visibleNavItems(layoutPath, features, hidden).map((item) => ({
      id: `nav:${item.path}`,
      label: item.label,
      group: '前往' as const,
      icon: item.icon,
      to: item.path,
      hint: item.path,
      run: () => remember(`nav:${item.path}`),
    }));
  }, [features, hidden, layoutPath, remember]);
}

/**
 * Rank a command against a query.
 *
 * Returns `-1` for no match, otherwise a score where lower is better. Deliberately a plain
 * function rather than a fuzzy-match library: the corpus is a few dozen short labels, and
 * a fuzzy matcher over CJK labels produces matches nobody asked for.
 */
export function scoreCommand(command: Command, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') return 0;

  const label = command.label.toLowerCase();

  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 2;

  for (const keyword of command.keywords ?? []) {
    const value = keyword.toLowerCase();
    if (value.startsWith(query)) return 3;
    if (value.includes(query)) return 4;
  }

  // The id carries the path for a navigation command, so typing `/student/sh` finds it.
  if (command.id.toLowerCase().includes(query)) return 5;

  return -1;
}

/** Filter and sort. Exported so the palette's behaviour is testable without a DOM. */
export function rankCommands(commands: Command[], query: string, recents: string[] = []): Command[] {
  if (query.trim() === '') {
    const byId = new Map(commands.map((command) => [command.id, command]));
    const recent = recents
      .map((id) => byId.get(id))
      .filter((command): command is Command => command !== undefined);

    const recentIds = new Set(recent.map((command) => command.id));
    const rest = commands.filter((command) => !recentIds.has(command.id));

    return [...recent.map((command) => ({ ...command, group: '最近使用' as const })), ...rest];
  }

  return commands
    .map((command) => ({ command, score: scoreCommand(command, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.command.label.localeCompare(b.command.label, 'zh'))
    .map((entry) => entry.command);
}
