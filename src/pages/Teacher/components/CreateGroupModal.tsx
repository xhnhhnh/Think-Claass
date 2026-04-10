import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  submitting: boolean;
}

export function CreateGroupModal({ isOpen, onClose, onSubmit, submitting }: CreateGroupModalProps) {
  const [name, setName] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
      setName('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white/90 backdrop-blur-xl border-white/60">
        <DialogHeader>
          <DialogTitle className="text-slate-800 text-xl font-bold">新建小组</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">小组名称</Label>
            <Input
              id="group-name"
              placeholder="例如：第一小队"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>取消</Button>
            <Button type="submit" disabled={submitting || !name.trim()} className="bg-blue-600 hover:bg-blue-700">
              {submitting ? '创建中...' : '确认'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
