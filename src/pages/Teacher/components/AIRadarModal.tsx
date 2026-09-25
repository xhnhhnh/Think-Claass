import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BrainCircuit, XCircle } from 'lucide-react';
import { Student } from '@/hooks/queries/useStudents';

interface AIReport {
  strengths: string[];
  weaknesses: string[];
  advice: string;
}

interface AIRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  stage: number;
  report: AIReport | null;
}

export function AIRadarModal({ isOpen, onClose, student, stage, report }: AIRadarModalProps) {
  if (!student) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-fg-1/95 backdrop-blur-2xl border-role/30 shadow-glow-role">
        <DialogHeader>
          <DialogTitle className="text-fg-inverse text-xl font-bold flex justify-between items-center w-full">
            <div className="flex items-center">
              <BrainCircuit className="h-6 w-6 mr-2 text-role/80" />
              AI 学情雷达
            </div>
            <Button variant="ghost" onClick={onClose} className="text-fg-3 hover:text-fg-inverse transition-colors">
              <XCircle className="h-6 w-6" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="py-8 px-4 text-center">
          <div className="relative w-48 h-48 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border border-role/20" />
            <div className="absolute inset-4 rounded-full border border-role/40" />
            <div className="absolute inset-8 rounded-full border border-role/60" />
            
            {stage < 3 && (
              <div className="absolute inset-0 border-t-2 border-role rounded-full animate-[spin_2s_linear_infinite]" />
            )}
            
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold text-fg-inverse mb-1">{student.name}</div>
                <div className="text-role/80 text-sm font-mono">ID: {student.user_id}</div>
              </div>
            </div>
          </div>

          <div className="h-16 flex items-center justify-center">
            {stage === 0 && <div className="text-role/60 animate-pulse">初始化神经链路...</div>}
            {stage === 1 && <div className="text-info animate-pulse">提取历史学习轨迹...</div>}
            {stage === 2 && <div className="text-role-ink/80 animate-pulse">正在生成多维能力模型...</div>}
            
            {stage === 3 && report && (
              <div className="text-left w-full space-y-4 animate-slide-in-bottom">
                <div className="bg-surface-3/50 p-4 rounded-card border border-line-1">
                  <h4 className="text-success font-semibold mb-2 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-success mr-2" />
                    优势表现
                  </h4>
                  <ul className="list-disc list-inside text-fg-3/70 text-sm pl-4 space-y-1">
                    {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                
                <div className="bg-surface-3/50 p-4 rounded-card border border-line-1">
                  <h4 className="text-warning font-semibold mb-2 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-warning mr-2" />
                    待提升项
                  </h4>
                  <ul className="list-disc list-inside text-fg-3/70 text-sm pl-4 space-y-1">
                    {report.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>

                <div className="bg-role/10 p-4 rounded-card border border-role/30">
                  <h4 className="text-role/60 font-semibold mb-2">AI 智能建议</h4>
                  <p className="text-fg-3/70 text-sm leading-relaxed">{report.advice}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {stage === 3 && (
          <div className="mt-4 flex justify-center pb-4">
            <Button 
              onClick={onClose}
              className="bg-role hover:bg-role/90 text-role-contrast shadow-glow-role transition-all hover:shadow-floating"
            >
              分析完毕，关闭面板
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
