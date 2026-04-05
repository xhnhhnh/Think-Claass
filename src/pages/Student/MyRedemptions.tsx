import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Ticket, CheckCircle2, Clock, Loader2, Gift } from 'lucide-react';
import { motion } from 'framer-motion';

interface RedemptionTicket {
  id: number;
  item_name: string;
  code: string;
  status: 'pending' | 'used';
  created_at: string;
  used_at: string | null;
}

export default function StudentMyRedemptions() {
  const user = useStore((state) => state.user);
  const [tickets, setTickets] = useState<RedemptionTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTickets = async () => {
      if (!user?.studentId) return;
      try {
        const res = await fetch(`/api/redemption/my?studentId=${user.studentId}`);
        const data = await res.json();
        if (data.success) {
          setTickets(data.tickets);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-12 h-12 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto space-y-8"
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="bg-white rounded-[2rem] p-10 shadow-xl border-b-8 border-teal-200 flex flex-col md:flex-row justify-between items-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-emerald-400 opacity-10 pointer-events-none"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-teal-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        
        <div className="relative z-10 mb-6 md:mb-0 text-center md:text-left">
          <h2 className="text-5xl font-black text-gray-900 mb-4 drop-shadow-sm flex items-center justify-center md:justify-start">
            <Ticket className="w-12 h-12 text-teal-500 mr-4" />
            我的兑换
          </h2>
          <p className="text-xl text-gray-600 font-bold">查看你的实物奖品兑换券，向老师出示核销码即可领取奖品！</p>
        </div>
      </motion.div>

      {tickets.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-[3rem] p-16 text-center border-8 border-dashed border-gray-200 shadow-sm"
        >
          <div className="inline-flex items-center justify-center p-8 bg-gray-100 rounded-full mb-6 shadow-inner">
            <Ticket className="h-16 w-16 text-gray-400" />
          </div>
          <h3 className="text-3xl font-black text-gray-600">暂无兑换记录</h3>
          <p className="text-xl font-bold text-gray-400 mt-4">快去积分商城或抽奖获取奖品吧！</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {tickets.map((ticket, index) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              key={ticket.id} 
              whileHover={ticket.status === 'pending' ? { scale: 1.02, y: -5 } : {}}
              className={`relative bg-white rounded-[2rem] p-8 border-b-8 border-r-4 border-l-4 border-t-4 transition-all shadow-lg flex flex-col ${
                ticket.status === 'used' 
                  ? 'border-gray-200 opacity-80 grayscale-[0.3]' 
                  : 'border-teal-300 hover:border-teal-500 hover:shadow-2xl'
              }`}
            >
              {/* Decorative ticket cutout */}
              <div className="absolute top-1/2 -left-4 w-8 h-8 bg-[#F0FDF4] rounded-full transform -translate-y-1/2 border-r-4 border-t-4 border-b-4 border-teal-300"></div>
              <div className="absolute top-1/2 -right-4 w-8 h-8 bg-[#F0FDF4] rounded-full transform -translate-y-1/2 border-l-4 border-t-4 border-b-4 border-teal-300"></div>
              
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center">
                  <div className={`p-3 rounded-full mr-4 shadow-inner ${ticket.status === 'used' ? 'bg-gray-100' : 'bg-teal-100'}`}>
                    <Gift className={`w-8 h-8 ${ticket.status === 'used' ? 'text-gray-400' : 'text-teal-500'}`} />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900">{ticket.item_name}</h3>
                </div>
                {ticket.status === 'used' ? (
                  <span className="flex items-center px-4 py-2 bg-gray-100 text-gray-600 rounded-full text-base font-black border-2 border-gray-200 shadow-sm">
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    已核销
                  </span>
                ) : (
                  <span className="flex items-center px-4 py-2 bg-teal-100 text-teal-700 rounded-full text-base font-black border-2 border-teal-200 shadow-sm animate-pulse">
                    <Clock className="w-5 h-5 mr-2" />
                    待核销
                  </span>
                )}
              </div>
              
              <div className={`mt-auto p-6 rounded-[1.5rem] text-center border-4 border-dashed relative overflow-hidden ${
                ticket.status === 'used' ? 'bg-gray-50 border-gray-300' : 'bg-teal-50 border-teal-300'
              }`}>
                {ticket.status === 'used' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="border-4 border-red-500/50 text-red-500/50 text-4xl font-black px-6 py-2 rounded-2xl transform -rotate-12 select-none">
                      已使用
                    </div>
                  </div>
                )}
                <p className="text-base text-gray-500 font-bold mb-2">向老师出示此核销码</p>
                <p className={`text-4xl font-black font-mono tracking-[0.25em] ${
                  ticket.status === 'used' ? 'text-gray-400 line-through decoration-red-500/50 decoration-4' : 'text-teal-600 drop-shadow-sm'
                }`}>
                  {ticket.code}
                </p>
              </div>

              <div className="mt-6 text-sm font-bold text-gray-400 text-center flex flex-col gap-1">
                <span>兑换时间: {new Date(ticket.created_at).toLocaleString()}</span>
                {ticket.used_at && (
                  <span className="text-gray-500">核销时间: {new Date(ticket.used_at).toLocaleString()}</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
