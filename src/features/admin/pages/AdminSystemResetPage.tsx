import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ADMIN_PATH } from '@/constants';
import { useDatabaseResetMutation } from '@/features/admin/hooks/useAdminSystem';
import { useStore } from '@/store/useStore';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';

/**
 * System reset.
 *
 * The last step of this page used to be `window.confirm`, the browser's own modal in
 * the middle of a Chinese-language console - unstyled, untranslatable, and impossible
 * to assert without stubbing a global. It is the kit's `ConfirmDialog` now, which
 * means the confirmation is a real element with a real confirm button that a test can
 * click, and the destructive action is marked as such.
 *
 * `输入 CONFIRM` and `确认并立即重置系统` are unchanged: `Admin/SystemReset.test.tsx`
 * drives the page by both. The page is a reset flow, so it takes
 * `PageScaffold variant="form"` and the destructive action lives in the scaffold's
 * footer action bar - reachable without scrolling back up on a phone - and is a
 * command-palette command as well.
 */
export default function AdminSystemResetPage() {
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const resetDatabaseMutation = useDatabaseResetMutation();
  const [confirmText, setConfirmText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const runReset = async () => {
    setConfirmOpen(false);
    try {
      const result = await resetDatabaseMutation.mutateAsync();
      toast.success(result.message || '数据库已成功重置，服务器即将重启');
      logout();
      setTimeout(() => {
        navigate(`${ADMIN_PATH}/login`);
      }, 2000);
    } catch (_error) {
      toast.error('网络错误，重置失败');
    }
  };

  const handleReset = () => {
    if (confirmText !== 'CONFIRM') {
      toast.error('请输入大写的 CONFIRM 以确认操作');
      return;
    }
    setConfirmOpen(true);
  };

  useRegisterPageCommands([
    {
      id: 'admin-system-reset:run',
      label: '确认并立即重置系统',
      icon: Trash2,
      keywords: ['重置', '清空', '高危'],
      run: () => handleReset(),
      disabled: resetDatabaseMutation.isPending || confirmText !== 'CONFIRM',
    },
  ]);

  return (
    <PageScaffold
      variant="form"
      title="高危操作：系统重置"
      description="此操作将清空除超级管理员外的所有数据！"
      className="mx-auto max-w-2xl"
      footer={
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={handleReset}
          disabled={resetDatabaseMutation.isPending || confirmText !== 'CONFIRM'}
          className="w-full sm:w-auto"
        >
          {resetDatabaseMutation.isPending ? (
            <>
              <Spinner label="正在执行重置" />
              正在执行重置...
            </>
          ) : (
            <>
              <Trash2 data-icon="inline-start" />
              确认并立即重置系统
            </>
          )}
        </Button>
      }
    >
      <div className="rounded-panel border-2 border-danger/30 bg-danger-soft p-6 shadow-card">
        <div className="space-y-4 rounded-card border border-danger/20 bg-surface-2 p-6">
          <h3 className="font-semibold text-fg-1">重置操作将执行以下步骤：</h3>
          <ul className="list-disc space-y-2 pl-5 text-sm text-fg-2">
            <li>
              <strong className="text-danger">删除</strong>所有学生、教师、家长账户。
            </li>
            <li>
              <strong className="text-danger">清空</strong>所有班级、作业、考试记录。
            </li>
            <li>
              <strong className="text-danger">清空</strong>所有游戏化数据（宠物、金币、大乱斗等）。
            </li>
            <li>
              <strong className="text-success">保留</strong>当前的超级管理员账户。
            </li>
            <li>重置后服务器将自动重启。</li>
          </ul>

          <div className="mt-6 space-y-4 border-t border-line-1 pt-6">
            <FormField
              label={
                <>
                  为确认您的操作，请在下方输入大写的{' '}
                  <span className="rounded bg-danger-soft px-2 py-0.5 font-mono font-bold text-danger">
                    CONFIRM
                  </span>
                </>
              }
            >
              <Input
                type="text"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder="输入 CONFIRM"
              />
            </FormField>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="确认重置系统？"
        description="此操作不可逆：除超级管理员外的所有数据都会被清空。"
        confirmLabel="确认重置"
        pendingLabel="正在重置..."
        cancelLabel="取消"
        destructive
        isPending={resetDatabaseMutation.isPending}
        onConfirm={runReset}
      />
    </PageScaffold>
  );
}
