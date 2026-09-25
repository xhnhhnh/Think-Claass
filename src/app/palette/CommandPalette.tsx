import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { toast } from 'sonner';

import {
  rankCommands,
  useCommandRunner,
  useNavigationCommands,
  usePageCommands,
  type Command,
} from '@/app/commands/registry';
import { usePageMeta } from '@/app/nav/usePageMeta';
import { useShellStore } from '@/app/shell/shellStore';
import { useIsDesktop } from '@/app/shell/useMediaQuery';
import { Kbd } from '@/components/ui/kbd';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import type { ClassFeatures } from '@/lib/classFeatures.generated';
import { cn } from '@/lib/utils';

/**
 * The command palette.
 *
 * `⌘K` / `Ctrl K`. Navigation, the current page's own actions, and what the reader did
 * last, in one input.
 *
 * ## Why it is a sheet on a phone and a sheet on a desktop
 *
 * The same list in the same place does not work at both sizes. On a desktop the palette
 * belongs near the top, over the page, where the eye already is; on a phone it belongs at
 * the bottom, under the thumb, with the input next to the keyboard. Both use the same
 * ranking, the same data and the same keyboard contract - so this is one component with
 * two placements rather than two features.
 *
 * ## The accessible-name contract
 *
 * The input is labelled 「搜索或跳转」 and each result is a `role="option"` inside a
 * `role="listbox"`, with the active option marked `aria-selected` and pointed at by
 * `aria-activedescendant`. The results are deliberately *not* a set of buttons: a screen
 * reader should announce "listbox, 26 items, 考试与成绩 selected", which is the listbox
 * pattern and not something a row of buttons can produce.
 */
export interface CommandPaletteProps {
  features: ClassFeatures;
  /** Destinations this console hides; see the note on `AppShellProps.hiddenPaths`. */
  hiddenPaths?: ReadonlySet<string>;
}

export function CommandPalette({ features, hiddenPaths }: CommandPaletteProps) {
  const open = useShellStore((state) => state.paletteOpen);
  const setOpen = useShellStore((state) => state.setPaletteOpen);
  const isDesktop = useIsDesktop();

  // Mounted only while open: the palette owns an input, a listbox and a screen-reader
  // announcement, and keeping all of that in the document on every route for a feature
  // used occasionally is a cost with no benefit.
  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side={isDesktop ? 'top' : 'bottom'}
        title="搜索或跳转"
        hideTitle
        showCloseButton={false}
        className={cn(
          isDesktop && 'mx-auto mt-[10vh] max-h-[70dvh] w-[min(40rem,calc(100vw-2rem))] rounded-panel border',
        )}
      >
        <PaletteBody features={features} hiddenPaths={hiddenPaths} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function PaletteBody({
  features,
  hiddenPaths,
  onDone,
}: {
  features: ClassFeatures;
  hiddenPaths?: ReadonlySet<string>;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const meta = usePageMeta('搜索或跳转');
  const initialQuery = useShellStore((state) => state.paletteQuery);
  const recentCommands = useShellStore((state) => state.recentCommands);
  const rememberCommand = useShellStore((state) => state.rememberCommand);

  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);

  const navigation = useNavigationCommands(meta.layoutPath, features, hiddenPaths);
  const pageCommands = usePageCommands();
  const runPageCommand = useCommandRunner();

  const commands = useMemo<Command[]>(() => {
    const actions: Command[] = pageCommands.map((command) => ({
      id: command.id,
      label: command.label,
      group: '操作' as const,
      icon: command.icon,
      keywords: command.keywords,
      disabled: command.disabled,
      /*
       * The indirection that keeps a page's command honest.
       *
       * `command.run` is a snapshot from the page's render; routing through the registry by id
       * means the palette executes the version that exists at the moment of the Enter key. The
       * difference is invisible until a command reads state the reader changed while the palette
       * was open - at which point the direct call submits the wrong thing.
       */
      run: () => runPageCommand(command.id),
    }));
    return [...navigation, ...actions];
  }, [navigation, pageCommands, runPageCommand]);

  const results = useMemo(
    () => rankCommands(commands, query, recentCommands).slice(0, 60),
    [commands, query, recentCommands],
  );

  // Reset the cursor when the result set changes: keeping index 7 across a new query
  // highlights an item the reader never looked at.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const run = useCallback(
    (command: Command) => {
      if (command.disabled) return;
      rememberCommand(command.id);

      if (command.to) {
        navigate(command.to);
      } else if (command.run) {
        command.run();
      } else {
        // A command with neither a destination nor an action is a registry mistake.
        // Saying so beats a palette entry that silently does nothing.
        toast.error(`「${command.label}」没有可执行的动作`);
      }
      onDone();
    },
    [navigate, onDone, rememberCommand],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = results[activeIndex];
      if (command) run(command);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line-1 px-3">
        <Search aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="搜索或跳转"
          aria-controls="command-list"
          aria-activedescendant={results[activeIndex] ? `command-${results[activeIndex].id}` : undefined}
          placeholder="搜索页面或操作…"
          className="h-bar w-full min-w-0 border-0 bg-transparent text-sm text-fg-1 outline-none placeholder:text-fg-3"
        />
        <Kbd className="hidden sm:inline-flex">Esc</Kbd>
      </div>

      <ul
        id="command-list"
        role="listbox"
        aria-label="搜索结果"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
      >
        {results.map((command, index) => (
          <PaletteRow
            key={command.id}
            command={command}
            active={index === activeIndex}
            onHover={() => setActiveIndex(index)}
            onRun={() => run(command)}
            showGroup={index === 0 || results[index - 1].group !== command.group}
          />
        ))}

        {results.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-fg-3">
            没有匹配「{query}」的页面或操作。
          </li>
        ) : null}
      </ul>

      <footer className="hidden shrink-0 items-center gap-3 border-t border-line-1 px-3 py-2 text-[0.6875rem] text-fg-3 sm:flex">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> 选择
        </span>
        <span className="flex items-center gap-1">
          <CornerDownLeft aria-hidden="true" className="size-3" /> 打开
        </span>
        <span className="ml-auto">共 {results.length} 项</span>
      </footer>
    </div>
  );
}

function PaletteRow({
  command,
  active,
  showGroup,
  onHover,
  onRun,
}: {
  command: Command;
  active: boolean;
  showGroup: boolean;
  onHover: () => void;
  onRun: () => void;
}) {
  const Icon = command.icon;

  return (
    <>
      {showGroup ? (
        <li
          role="presentation"
          className="px-3 pb-1 pt-3 text-[0.6875rem] font-bold uppercase tracking-wider text-fg-3"
        >
          {command.group}
        </li>
      ) : null}
      <li
        id={`command-${command.id}`}
        role="option"
        aria-selected={active}
        aria-disabled={command.disabled}
        onMouseEnter={onHover}
        onClick={onRun}
        className={cn(
          'flex h-control cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm',
          active ? 'bg-role-soft text-role-ink' : 'text-fg-2',
          command.disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
        <span className="min-w-0 flex-1 truncate">{command.label}</span>
        {command.hint ? (
          <span className="hidden shrink-0 truncate text-xs text-fg-3 sm:inline">{command.hint}</span>
        ) : null}
      </li>
    </>
  );
}

export default CommandPalette;
