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
      <DialogContent className="sm:max-w-lg bg-slate-900/95 backdrop-blur-2xl border-indigo-500/30 shadow-[0_0_50px_rgba(99,102,241,0.2)]">
        <DialogHeader>
          <DialogTitle className="text-white text-xl font-bold flex justify-between items-center w-full">
            <div className="flex items-center">
              <BrainCircuit className="h-6 w-6 mr-2 text-indigo-400" />
              AI 学情雷达
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <XCircle className="h-6 w-6" />
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="py-8 px-4 text-center">
          <div className="relative w-48 h-48 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border border-indigo-500/20" />
            <div className="absolute inset-4 rounded-full border border-indigo-500/40" />
            <div className="absolute inset-8 rounded-full border border-indigo-500/60" />
            
            {stage < 3 && (
              <div className="absolute inset-0 border-t-2 border-indigo-400 rounded-full animate-[spin_2s_linear_infinite]" />
            )}
            
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">{student.name}</div>
                <div className="text-indigo-400 text-sm font-mono">ID: {student.user_id}</div>
              </div>
            </div>
          </div>

          <div className="h-16 flex items-center justify-center">
            {stage === 0 && <div className="text-indigo-300 animate-pulse">初始化神经链路...</div>}
            {stage === 1 && <div className="text-cyan-300 animate-pulse">提取历史学习轨迹...</div>}
            {stage === 2 && <div className="text-purple-300 animate-pulse">正在生成多维能力模型...</div>}
            
            {stage === 3 && report && (
              <div className="text-left w-full space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                  <h4 className="text-green-400 font-semibold mb-2 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-green-400 mr-2" />
                    优势表现
                  </h4>
                  <ul className="list-disc list-inside text-slate-300 text-sm pl-4 space-y-1">
                    {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                  <h4 className="text-orange-400 font-semibold mb-2 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-orange-400 mr-2" />
                    待提升项
                  </h4>
                  <ul className="list-disc list-inside text-slate-300 text-sm pl-4 space-y-1">
                    {report.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>

                <div className="bg-indigo-900/30 p-4 rounded-xl border border-indigo-500/30">
                  <h4 className="text-indigo-300 font-semibold mb-2">AI 智能建议</h4>
                  <p className="text-slate-300 text-sm leading-relaxed">{report.advice}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {stage === 3 && (
          <div className="mt-4 flex justify-center pb-4">
            <Button 
              onClick={onClose}
              className="bg-indigo-500 hover:bg-indigo-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all hover:shadow-[0_0_25px_rgba(99,102,241,0.6)]"
            >
              分析完毕，关闭面板
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
