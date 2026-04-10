import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Edit2, CheckCircle } from 'lucide-react';
import { Preset } from '@/hooks/queries/usePresets';

interface PointsModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetCount: number;
  presets: Preset[];
  isEditingPresets: boolean;
  setIsEditingPresets: (val: boolean) => void;
  onAddPreset: (label: string, amount: number) => void;
  onDeletePreset: (id: number) => void;
  onSubmitPoints: (amount: number, reason: string) => void;
  submitting: boolean;
}

export function PointsModal({
  isOpen,
  onClose,
  targetCount,
  presets,
  isEditingPresets,
  setIsEditingPresets,
  onAddPreset,
  onDeletePreset,
  onSubmitPoints,
  submitting
}: PointsModalProps) {
  const [customAmount, setCustomAmount] = React.useState('');
  const [customReason, setCustomReason] = React.useState('');
  const [newPresetLabel, setNewPresetLabel] = React.useState('');
  const [newPresetAmount, setNewPresetAmount] = React.useState('');

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(customAmount, 10);
    if (!isNaN(amount) && amount !== 0) {
      onSubmitPoints(amount, customReason);
    }
  };

  const handleAddPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetLabel.trim() || !newPresetAmount) return;
    onAddPreset(newPresetLabel.trim(), parseInt(newPresetAmount, 10));
    setNewPresetLabel('');
    setNewPresetAmount('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white/90 backdrop-blur-xl border-white/60">
        <DialogHeader>
          <DialogTitle className="text-slate-800 text-xl font-bold">
            {targetCount > 1 ? `批量评分 (${targetCount}人)` : '积分管理'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-medium text-slate-700">快捷评分</h4>
              <button 
                onClick={() => setIsEditingPresets(!isEditingPresets)}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center transition-colors"
              >
                {isEditingPresets ? <><CheckCircle className="w-3 h-3 mr-1" /> 完成编辑</> : <><Edit2 className="w-3 h-3 mr-1" /> 编辑预设</>}
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {presets.map((preset) => (
                <div key={preset.id} className="relative group">
                  <Button
                    variant={preset.amount > 0 ? "default" : "destructive"}
                    onClick={() => !isEditingPresets && onSubmitPoints(preset.amount, preset.label)}
                    disabled={submitting || isEditingPresets}
                    className={`w-full justify-between h-auto py-3 px-4 ${preset.amount > 0 ? 'bg-indigo-500 hover:bg-indigo-600' : ''}`}
                  >
                    <span className="font-medium truncate mr-2">{preset.label}</span>
                    <span className="font-bold flex-shrink-0">{preset.amount > 0 ? `+${preset.amount}` : preset.amount}</span>
                  </Button>
                  {isEditingPresets && (
                    <button
                      onClick={() => onDeletePreset(preset.id)}
                      className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1.5 hover:bg-red-200 transition-colors z-10 shadow-sm"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isEditingPresets && (
              <form onSubmit={handleAddPreset} className="mt-4 p-4 bg-slate-50/80 rounded-xl border border-dashed border-slate-300">
                <h5 className="text-xs font-medium text-slate-600 mb-3">添加新预设</h5>
                <div className="flex space-x-2">
                  <Input
                    placeholder="理由 (如: 表现优异)"
                    value={newPresetLabel}
                    onChange={(e) => setNewPresetLabel(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="分数"
                    value={newPresetAmount}
                    onChange={(e) => setNewPresetAmount(e.target.value)}
                    className="w-20"
                  />
                  <Button type="submit" disabled={!newPresetLabel || !newPresetAmount} size="sm" className="bg-slate-800">
                    添加
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="border-t border-slate-200/60 pt-6">
            <h4 className="text-sm font-medium text-slate-700 mb-3">自定义评分</h4>
            <form onSubmit={handleCustomSubmit} className="space-y-4">
              <div className="flex space-x-3">
                <div className="flex-1">
                  <Label htmlFor="custom-amount" className="sr-only">分数</Label>
                  <Input
                    id="custom-amount"
                    type="number"
                    placeholder="输入分数 (如: 5 或 -3)"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="custom-reason" className="sr-only">理由</Label>
                  <Input
                    id="custom-reason"
                    type="text"
                    placeholder="选填理由"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" disabled={submitting || !customAmount || parseInt(customAmount) === 0} className="w-full bg-slate-800">
                {submitting ? '提交中...' : '确认评分'}
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
