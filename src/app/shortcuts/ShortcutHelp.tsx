import { useShellStore } from '@/app/shell/shellStore';
import { CommandHint, Kbd, useIsApplePlatform } from '@/components/ui/kbd';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsDesktop } from '@/app/shell/useMediaQuery';

/**
 * The shortcut reference.
 *
 * Opened with `?`, and linked from the account menu. A shortcut nobody can discover is a
 * shortcut that does not exist - the previous shell had none at all, which was at least
 * honest, and the tempting mistake here would be to bind six and document none.
 *
 * The list is written next to the bindings' implementation rather than generated from it:
 * three bindings do not justify a registry, and a generated list that silently misses one
 * is worse than a hand-written list a reviewer can check against `useGlobalShortcuts`.
 * If a binding is added there without a row here, that is the review's job.
 */
export function ShortcutHelp() {
  const sidebarOpen = useShellStore((state) => state.shortcutHelpOpen);
  const setOpen = useShellStore((state) => state.setShortcutHelpOpen);
  const isApple = useIsApplePlatform();
  const isDesktop = useIsDesktop();

  if (!sidebarOpen) return null;

  return (
    <Sheet open={sidebarOpen} onOpenChange={setOpen}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        title="键盘快捷键"
        showCloseButton
        className="w-[min(24rem,100vw)]"
      >
        <dl className="space-y-3 p-4 text-sm">
          <Row
            label="打开搜索与跳转"
            keys={
              <>
                <Kbd>{isApple ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd>K</Kbd>
              </>
            }
          />
          <Row
            label={isDesktop ? '折叠或展开侧栏' : '打开导航菜单'}
            keys={
              <>
                <Kbd>{isApple ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd>B</Kbd>
              </>
            }
          />
          <Row label="关闭当前面板" keys={<Kbd>Esc</Kbd>} />
          <Row label="在搜索里上下移动" keys={<><Kbd>↑</Kbd><Kbd>↓</Kbd></>} />
          <Row label="打开选中的页面或操作" keys={<Kbd>Enter</Kbd>} />
        </dl>

        <p className="px-4 pb-4 text-xs text-fg-3">
          在输入框里打字时，除 Esc 之外的快捷键都会被输入框接管。
        </p>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, keys }: { label: string; keys: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-fg-2">{label}</dt>
      <dd className="flex shrink-0 items-center gap-1">{keys}</dd>
    </div>
  );
}

/** A one-line hint for a button or menu row that opens the palette. */
export { CommandHint };

export default ShortcutHelp;
