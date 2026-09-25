import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useShellStore } from '@/app/shell/shellStore';

/**
 * The shell's global keyboard shortcuts.
 *
 * Bound once, by the shell, rather than by each page: a page that bound `⌘K` itself
 * would fight the shell's binding, and the count of pages that would need to is 76.
 *
 * ## The three rules
 *
 *   1. **Never fire while the reader is typing.** An input, a textarea, a select or a
 *      `contenteditable` element owns the keystroke. Without this check, `⌘B` in a
 *      password field would fold the sidebar - which is the kind of bug that makes a
 *      keyboard shortcut feel broken rather than useful.
 *   2. **`⌘` or `Ctrl` for the shell's own shortcuts.** `⌘K` and `⌘B` are what every
 *      editor and console binds; a bare letter would collide with typing.
 *   3. **`Escape` closes whatever is open, outermost first.** The palette and the drawer
 *      are both modal, so exactly one of them can be open; this closes the palette if it
 *      is up, otherwise the drawer.
 *
 * The `g`-prefix sequence shortcuts (`g` then `s` for settings) are deliberately **not**
 * here. They are undiscoverable without a help surface, and the palette covers the same
 * ground in a way a reader can find. `ShortcutHelp` lists what actually exists.
 */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return target.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const store = useShellStore.getState();
      const withMeta = event.metaKey || event.ctrlKey;

      // Escape is checked first: it must work while a field has focus, which is exactly
      // when a reader wants to back out of the palette.
      if (event.key === 'Escape') {
        if (store.paletteOpen) {
          event.preventDefault();
          store.closePalette();
          return;
        }
        if (store.shortcutHelpOpen) {
          event.preventDefault();
          store.setShortcutHelpOpen(false);
          return;
        }
        if (store.drawerOpen) {
          event.preventDefault();
          store.setDrawerOpen(false);
        }
        return;
      }

      if (isTypingTarget(event.target)) return;

      if (withMeta && event.key.toLowerCase() === 'k') {
        // `preventDefault` because the browser's own `⌘K` is "search the web" in some
        // configurations, and a palette that opens the address bar instead is a shortcut
        // that never worked.
        event.preventDefault();
        if (store.paletteOpen) store.closePalette();
        else store.openPalette();
        return;
      }

      if (withMeta && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        store.toggleRail();
        return;
      }

      if (withMeta && event.key === '/') {
        event.preventDefault();
        navigate('/');
        return;
      }

      // `?` is Shift+/ on most layouts, so `event.key` is already the character.
      if (event.key === '?') {
        event.preventDefault();
        store.setShortcutHelpOpen(!store.shortcutHelpOpen);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}

export default useGlobalShortcuts;
