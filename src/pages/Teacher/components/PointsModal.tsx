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
    const amount = Number(customAmount);
    if (Number.isInteger(amount) && amount >= -5 && amount <= 5 && amount !== 0) {
      onSubmitPoints(amount, customReason);
    }
  };

  const handleAddPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetLabel.trim() || !newPresetAmount) return;
    const amount = Number(newPresetAmount);
    if (!Number.isInteger(amount) || amount < -5 || amount > 5 || amount === 0) return;
    onAddPreset(newPresetLabel.trim(), amount);
    setNewPresetLabel('');
    setNewPresetAmount('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-md bg-surface-2/90 backdrop-blur-xl border-line-1">
        <DialogHeader>
          <DialogTitle className="text-fg-1 text-xl font-bold">
            {targetCount > 1 ? `批量评分 (${targetCount}人)` : '积分管理'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-medium text-fg-2">快捷评分</h4>
              <Button variant="ghost" 
                onClick={() => setIsEditingPresets(!isEditingPresets)}
                className="text-xs text-role hover:text-role/80 flex items-center transition-colors"
              >
                {isEditingPresets ? <><CheckCircle className="w-3 h-3 mr-1" /> 完成编辑</> : <><Edit2 className="w-3 h-3 mr-1" /> 编辑预设</>}
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {presets.filter((preset) => Number.isInteger(preset.amount) && preset.amount >= -5 && preset.amount <= 5 && preset.amount !== 0).map((preset) => (
                <div key={preset.id} className="relative group">
                  <Button
                    variant={preset.amount > 0 ? "default" : "destructive"}
                    onClick={() => !isEditingPresets && onSubmitPoints(preset.amount, preset.label)}
                    disabled={submitting || isEditingPresets}
                    className={`w-full justify-between h-auto py-3 px-4 ${preset.amount > 0 ? 'bg-role hover:bg-role/90' : ''}`}
                  >
                    <span className="font-medium truncate mr-2">{preset.label}</span>
                    <span className="font-bold flex-shrink-0">{preset.amount > 0 ? `+${preset.amount}` : preset.amount}</span>
                  </Button>
                  {isEditingPresets && (
                    <Button variant="ghost"
                      onClick={() => onDeletePreset(preset.id)}
                      className="absolute -top-2 -right-2 bg-danger/20 text-danger rounded-full p-1.5 hover:bg-danger/30 transition-colors z-10 shadow-sm"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {isEditingPresets && (
              <form onSubmit={handleAddPreset} className="mt-4 p-4 bg-surface-3/50 rounded-card border border-dashed border-line-1">
                <h5 className="text-xs font-medium text-fg-2 mb-3">添加新预设</h5>
                <div className="flex space-x-2">
                  <Input
                    placeholder="理由 (如: 表现优异)"
                    value={newPresetLabel}
                    onChange={(e) => setNewPresetLabel(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={-5}
                    max={5}
                    step={1}
                    placeholder="分数"
                    value={newPresetAmount}
                    onChange={(e) => setNewPresetAmount(e.target.value)}
                    className="w-20"
                  />
                  <Button type="submit" disabled={!newPresetLabel || !newPresetAmount} size="sm">
                    添加
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="border-t border-line-1/60 pt-6">
            <h4 className="text-sm font-medium text-fg-2 mb-3">自定义评分</h4>
            <form onSubmit={handleCustomSubmit} className="space-y-4">
              <div className="flex space-x-3">
                <div className="flex-1">
                  <Label htmlFor="custom-amount" className="sr-only">分数</Label>
                  <Input
                    id="custom-amount"
                    type="number"
                    min={-5}
                    max={5}
                    step={1}
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
              <p className="text-xs text-fg-3">每次可评整数 −5 至 +5；正向评分每日最多获得 20 可用积分。</p>
              <Button type="submit" disabled={submitting || !Number.isInteger(Number(customAmount)) || Number(customAmount) === 0 || Number(customAmount) < -5 || Number(customAmount) > 5} className="w-full">
                {submitting ? '提交中...' : '确认评分'}
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
