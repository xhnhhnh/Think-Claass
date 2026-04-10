import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Award, Trophy, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

import { apiGet } from "@/lib/api";

interface Certificate {
  id: number;
  title: string;
  description: string;
  created_at: string;
}

export default function StudentCertificates() {
  const user = useStore((state) => state.user);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.studentId) {
      fetchCertificates();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchCertificates = async () => {
    try {
      const data = await apiGet(`/api/certificates?studentId=${user?.studentId}`);
      if (data.success) {
        setCertificates(data.certificates);
      }
    } catch (error) {
      console.error('获取奖状失败', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-12 h-12 text-yellow-500 animate-spin" />
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
        className="bg-white rounded-[2rem] p-10 shadow-xl border-b-8 border-yellow-200 flex flex-col md:flex-row justify-between items-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-400 opacity-10 pointer-events-none"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-orange-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-yellow-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        
        <div className="relative z-10 mb-6 md:mb-0 text-center md:text-left">
          <h2 className="text-5xl font-black text-gray-900 mb-4 drop-shadow-sm flex items-center justify-center md:justify-start">
            <Award className="w-12 h-12 text-yellow-500 mr-4" />
            荣誉奖状
          </h2>
          <p className="text-xl text-gray-600 font-bold">快来看看你都获得了哪些闪亮的荣誉吧！</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {certificates.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="col-span-full bg-white rounded-[3rem] p-16 text-center border-8 border-dashed border-gray-200 shadow-sm"
          >
            <div className="inline-flex items-center justify-center p-8 bg-gray-100 rounded-full mb-6 shadow-inner">
              <Trophy className="h-16 w-16 text-gray-400" />
            </div>
            <h3 className="text-3xl font-black text-gray-600">荣誉墙空空如也</h3>
            <p className="text-xl font-bold text-gray-400 mt-4">继续努力学习，争取早日拿到你的第一张奖状吧！</p>
          </motion.div>
        ) : (
          certificates.map((cert, index) => (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: index * 0.1, type: "spring", stiffness: 200 }}
              whileHover={{ scale: 1.05, rotate: index % 2 === 0 ? 2 : -2 }}
              key={cert.id} 
              className="bg-white rounded-[2rem] shadow-2xl overflow-hidden relative group border-4 border-yellow-300 transform transition-transform"
            >
              {/* 金边质感背景 */}
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-100 via-orange-50 to-yellow-200 opacity-80"></div>
              
              <div className="relative z-10 p-8 flex flex-col h-full items-center text-center">
                <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mb-6 shadow-lg border-4 border-white">
                  <Award className="w-12 h-12 text-white" />
                </div>
                
                <h3 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600 mb-2 drop-shadow-sm leading-tight">
                  {cert.title}
                </h3>
                
                <div className="w-16 h-1 bg-yellow-400 rounded-full my-4"></div>
                
                <p className="text-gray-700 font-medium text-lg mb-6 flex-1 leading-relaxed">
                  {cert.description || '表现优异，特发此状，以资鼓励。'}
                </p>
                
                <div className="mt-auto pt-6 border-t-2 border-dashed border-yellow-300/50 w-full">
                  <p className="text-sm font-bold text-orange-400 uppercase tracking-widest">
                    授予日期
                  </p>
                  <p className="text-gray-600 font-bold mt-1">
                    {new Date(cert.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
}