import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Shell interaction state.
 *
 * Separate from `src/store/useStore.ts`, which is *identity* - who is signed in
 * and what token proves it. This store is presentation: whether the rail is
 * collapsed, which mobile drawer is open, what the command palette is doing.
 * They are split because they have different lifetimes and different persistence
 * rules: identity is a security boundary, this is a preference.
 *
 * Persisted: only the parts a reader would be annoyed to lose on reload (rail
 * collapse, theme mode, recent commands). NOT persisted: anything about the
 * current screen - a drawer that reopens itself after a refresh is a bug, and a
 * palette that restores its query is worse than one that starts empty.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

interface ShellState {
  /** The desktop rail. Collapsed is the reader's choice and survives reloads. */
  railCollapsed: boolean;
  toggleRail: () => void;
  setRailCollapsed: (collapsed: boolean) => void;

  /** Mobile navigation drawer. Never persisted - see the note above. */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /**
   * What the drawer is showing.
   *
   * `tabs` is the dock's 「更多」: the destinations that did not earn a tab, so the
   * reader gets a short list. `all` is the drawer handle in the top bar: the whole
   * console, grouped, with the sections they can fold. One drawer, two entry points,
   * and the mode is which one was pressed rather than a second component.
   */
  drawerMode: 'tabs' | 'all';
  setDrawerMode: (mode: 'tabs' | 'all') => void;

  /** The ⌘K layer. Never persisted. */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** Prefills the palette query, for a command opened from a button. */
  paletteQuery: string;
  openPalette: (query?: string) => void;
  closePalette: () => void;

  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;

  /** The keyboard-shortcut reference sheet. Never persisted. */
  shortcutHelpOpen: boolean;
  setShortcutHelpOpen: (open: boolean) => void;

  /**
   * Which rail sections the reader has folded away, per console.
   *
   * Keyed by console path rather than by section alone: 「游戏化玩法」 collapsed in the
   * teacher console must not also fold the student area's identically-named section, and
   * the storage shape is the cheapest place to guarantee that.
   */
  collapsedSections: Record<string, string[]>;
  toggleSection: (layoutKey: string, sectionKey: string) => void;

  /**
   * Recently used command ids, most recent first.
   *
   * The palette's first section is "what you were just doing" rather than an
   * alphabetical list of 40 destinations, which is the whole reason a palette
   * beats a sidebar for a reader who already knows where they are going.
   */
  recentCommands: string[];
  rememberCommand: (id: string) => void;
}

const RECENT_LIMIT = 6;

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      railCollapsed: false,
      toggleRail: () => set((state) => ({ railCollapsed: !state.railCollapsed })),
      setRailCollapsed: (collapsed) => set({ railCollapsed: collapsed }),

      drawerOpen: false,
      setDrawerOpen: (open) => set({ drawerOpen: open }),
      drawerMode: 'all',
      setDrawerMode: (mode) => set({ drawerMode: mode }),

      paletteOpen: false,
      paletteQuery: '',
      openPalette: (query = '') => set({ paletteOpen: true, paletteQuery: query }),
      setPaletteOpen: (open) => set({ paletteOpen: open, ...(open ? {} : { paletteQuery: '' }) }),
      closePalette: () => set({ paletteOpen: false, paletteQuery: '' }),

      theme: 'light',
      setTheme: (theme) => set({ theme }),

      shortcutHelpOpen: false,
      setShortcutHelpOpen: (open) => set({ shortcutHelpOpen: open }),

      collapsedSections: {},
      toggleSection: (layoutKey, sectionKey) =>
        set((state) => {
          const current = state.collapsedSections[layoutKey] ?? [];
          const next = current.includes(sectionKey)
            ? current.filter((key) => key !== sectionKey)
            : [...current, sectionKey];
          return { collapsedSections: { ...state.collapsedSections, [layoutKey]: next } };
        }),

      recentCommands: [],
      rememberCommand: (id) =>
        set((state) => ({
          recentCommands: [id, ...state.recentCommands.filter((existing) => existing !== id)].slice(
            0,
            RECENT_LIMIT,
          ),
        })),
    }),
    {
      name: 'thinkclass-shell',
      partialize: (state) => ({
        railCollapsed: state.railCollapsed,
        theme: state.theme,
        recentCommands: state.recentCommands,
        collapsedSections: state.collapsedSections,
      }),
    },
  ),
);
