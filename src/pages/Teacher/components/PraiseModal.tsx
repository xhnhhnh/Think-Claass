import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PraiseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string, color: string) => void;
  submitting: boolean;
}

export function PraiseModal({ isOpen, onClose, onSubmit, submitting }: PraiseModalProps) {
  const [content, setContent] = React.useState('');
  const [color, setColor] = React.useState('bg-yellow-100');

  const colors = [
    { id: 'bg-yellow-100', label: '温馨黄' },
    { id: 'bg-blue-100', label: '沉稳蓝' },
    { id: 'bg-green-100', label: '活力绿' },
    { id: 'bg-pink-100', label: '浪漫粉' },
    { id: 'bg-purple-100', label: '神秘紫' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      onSubmit(content.trim(), color);
      setContent('');
      setColor('bg-yellow-100');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white/90 backdrop-blur-xl border-white/60">
        <DialogHeader>
          <DialogTitle className="text-slate-800 text-xl font-bold">发送表扬信</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="praise-content">表扬内容</Label>
            <Input
              id="praise-content"
              placeholder="写下你想对学生说的话..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              autoFocus
            />
          </div>
          
          <div className="space-y-3 pt-2">
            <Label>信纸颜色</Label>
            <div className="flex gap-3 flex-wrap">
              {colors.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  className={`w-8 h-8 rounded-full shadow-sm border-2 transition-all ${c.id.replace('bg-', 'bg-').replace('-100', '-300')} ${
                    color === c.id ? 'border-gray-800 scale-110 ring-2 ring-gray-400/20' : 'border-transparent hover:scale-105'
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>取消</Button>
            <Button type="submit" disabled={submitting || !content.trim()} className="bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-semibold">
              {submitting ? '发送中...' : '发送表扬信'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
