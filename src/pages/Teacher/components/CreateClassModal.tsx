import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CreateClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  submitting: boolean;
}

export function CreateClassModal({ isOpen, onClose, onSubmit, submitting }: CreateClassModalProps) {
  const [name, setName] = React.useState('');

  /**
   * Clear only once the dialog is closed - i.e. on success or on cancel, never merely because the
   * teacher pressed 确认. The request can fail while the dialog stays open (the parent closes it
   * only on success), and wiping the field there made them retype the class name for nothing.
   */
  React.useEffect(() => {
    if (!isOpen) setName('');
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-surface-2/90 backdrop-blur-xl border-line-1">
        <DialogHeader>
          <DialogTitle className="text-fg-1 text-xl font-bold">新建班级</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="class-name">班级名称</Label>
            <Input
              id="class-name"
              placeholder="例如：三年级二班"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>取消</Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? '创建中...' : '确认'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
