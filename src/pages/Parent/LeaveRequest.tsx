import { useState } from 'react';
import { Calendar, Clock, FileText, CheckCircle2, XCircle, Clock4, PlusCircle, Heart } from 'lucide-react';
import { toast } from 'sonner';

interface LeaveRequest {
  id: number;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

export default function ParentLeaveRequest() {
  const [requests, setRequests] = useState<LeaveRequest[]>([
    {
      id: 1,
      startDate: '2023-11-20',
      endDate: '2023-11-21',
      reason: '感冒发烧，需要去医院就诊',
      status: 'approved',
      submittedAt: '2023-11-19 08:30'
    },
    {
      id: 2,
      startDate: '2023-12-05',
      endDate: '2023-12-05',
      reason: '参加亲戚婚礼',
      status: 'pending',
      submittedAt: '2023-11-28 14:20'
    }
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({
    startDate: '',
    endDate: '',
    reason: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.startDate || !newRequest.endDate || !newRequest.reason) {
      toast.error('请填写完整的假条信息');
      return;
    }

    if (new Date(newRequest.endDate) < new Date(newRequest.startDate)) {
      toast.error('结束日期不能早于开始日期哦');
      return;
    }

    const newReq: LeaveRequest = {
      id: Date.now(),
      ...newRequest,
      status: 'pending',
      submittedAt: new Date().toLocaleString().slice(0, 16).replace('T', ' ')
    };

    setRequests([newReq, ...requests]);
    setIsModalOpen(false);
    setNewRequest({ startDate: '', endDate: '', reason: '' });
    toast.success('假条已经交给老师啦');
  };

  const getStatusIcon = (status: LeaveRequest['status']) => {
    switch (status) {
      case 'approved': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'rejected': return <XCircle className="w-5 h-5 text-coral-500" />;
      case 'pending': return <Clock4 className="w-5 h-5 text-amber-500" />;
    }
  };

  const getStatusText = (status: LeaveRequest['status']) => {
    switch (status) {
      case 'approved': return <span className="text-green-600 bg-green-50 px-3 py-1 rounded-xl text-sm font-bold border border-green-100">老师已同意</span>;
      case 'rejected': return <span className="text-coral-600 bg-coral-50 px-3 py-1 rounded-xl text-sm font-bold border border-coral-100">需要再沟通</span>;
      case 'pending': return <span className="text-amber-600 bg-amber-50 px-3 py-1 rounded-xl text-sm font-bold border border-amber-100">老师查看中</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-[#fffdfa] rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-stone-800 mb-2 flex items-center tracking-wide">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-400 rounded-2xl flex items-center justify-center mr-4 shadow-inner">
              <Calendar className="w-6 h-6" />
            </div>
            请假假条
          </h1>
          <p className="text-stone-500 ml-16">为宝贝向老师请个假，记录缺席的日子</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center px-5 py-3 bg-coral-400 text-white rounded-2xl font-bold hover:bg-coral-500 transition-all duration-300 shadow-md hover:shadow-lg hover:shadow-coral-500/30 hover:-translate-y-0.5 tracking-wide"
        >
          <PlusCircle className="w-5 h-5 mr-2" />
          写新假条
        </button>
      </div>

      {/* Request List */}
      <div className="bg-[#fffdfa] rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 overflow-hidden">
        <div className="p-6 border-b border-amber-50 bg-white/50 backdrop-blur-sm">
          <h2 className="text-xl font-bold text-stone-800 flex items-center tracking-wide pl-2">
            <div className="w-8 h-8 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center mr-3">
              <Clock className="w-4 h-4" />
            </div>
            假条记录
          </h2>
        </div>
        <div className="divide-y divide-amber-50/50 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] relative">
          <div className="absolute inset-0 bg-gradient-to-b from-[#fffdfa]/80 to-[#fffdfa]/40 pointer-events-none"></div>
          <div className="relative z-10">
            {requests.length > 0 ? (
              requests.map((request) => (
                <div key={request.id} className="p-8 hover:bg-white/60 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="space-y-4 flex-1">
                      <div className="flex items-center space-x-4">
                        {getStatusIcon(request.status)}
                        {getStatusText(request.status)}
                        <span className="text-sm text-stone-400 font-medium tracking-wider">提交于 {request.submittedAt}</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-stone-50/50 p-5 rounded-2xl border border-stone-100/50">
                        <div>
                          <span className="text-xs text-stone-400 font-bold tracking-widest block mb-2 uppercase">请假时间</span>
                          <p className="text-[15px] font-bold text-stone-700">
                            {request.startDate} <span className="text-stone-400 font-normal mx-2">至</span> {request.endDate}
                          </p>
                        </div>
                      </div>
                      
                      <div>
                        <span className="text-xs text-stone-400 font-bold tracking-widest block mb-2 uppercase flex items-center">
                          <FileText className="w-3.5 h-3.5 mr-1.5" />
                          请假事由
                        </span>
                        <p className="text-[15px] text-stone-700 bg-white p-4 rounded-2xl border border-amber-100/50 shadow-sm leading-relaxed">
                          {request.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-16 text-center text-stone-400">
                <div className="w-24 h-24 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Calendar className="w-10 h-10 text-stone-300" />
                </div>
                <p className="font-medium tracking-wide">还没有请假记录哦</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#fffdfa] rounded-[2.5rem] max-w-md w-full shadow-2xl border border-amber-100/50 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-100/50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            
            <div className="relative z-10">
              <div className="p-8 border-b border-amber-50 flex items-center justify-between bg-white/50 backdrop-blur-sm">
                <h3 className="text-2xl font-bold text-stone-800 flex items-center tracking-wide">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-400 rounded-xl flex items-center justify-center mr-3">
                    <PlusCircle className="w-6 h-6" />
                  </div>
                  写新假条
                </h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[15px] font-bold text-stone-700 mb-2">开始日期</label>
                    <input
                      type="date"
                      required
                      value={newRequest.startDate}
                      onChange={(e) => setNewRequest({ ...newRequest, startDate: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-amber-100 rounded-2xl focus:ring-4 focus:ring-indigo-100/50 focus:border-indigo-300 outline-none transition-all text-stone-700 shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[15px] font-bold text-stone-700 mb-2">结束日期</label>
                    <input
                      type="date"
                      required
                      value={newRequest.endDate}
                      onChange={(e) => setNewRequest({ ...newRequest, endDate: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-amber-100 rounded-2xl focus:ring-4 focus:ring-indigo-100/50 focus:border-indigo-300 outline-none transition-all text-stone-700 shadow-sm"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-[15px] font-bold text-stone-700 mb-2">请假事由</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="跟老师说明一下原因吧..."
                    value={newRequest.reason}
                    onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-amber-100 rounded-2xl focus:ring-4 focus:ring-indigo-100/50 focus:border-indigo-300 outline-none transition-all text-stone-700 shadow-sm resize-none leading-relaxed"
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3 text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-2xl font-bold transition-colors tracking-wide"
                  >
                    不请了
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-coral-400 text-white rounded-2xl font-bold hover:bg-coral-500 transition-all duration-300 shadow-md hover:shadow-lg hover:shadow-coral-500/30 hover:-translate-y-0.5 tracking-wide"
                  >
                    交给老师
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
