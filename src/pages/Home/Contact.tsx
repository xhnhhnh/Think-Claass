import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Send, Mail, Phone, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function HomeContact() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.message.trim()) {
      toast.error('姓名和留言内容为必填项');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/website/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success('留言提交成功，我们会尽快与您联系！');
        setFormData({ name: '', email: '', message: '' });
      } else {
        toast.error(data.message || '提交失败，请重试');
      }
    } catch (error) {
      toast.error('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfaf5] text-[#5c4b3a] selection:bg-[#f2c779] selection:text-white font-sans overflow-hidden relative flex flex-col">
      {/* Background Texture Overlay */}
      <div 
        className="fixed inset-0 opacity-[0.03] pointer-events-none z-0" 
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />

      {/* Header */}
      <header className="relative z-10 bg-white/50 backdrop-blur-md border-b border-[#f0e6d3] sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center space-x-2 text-[#d97757]"
          >
            <MessageSquare className="w-6 h-6" />
            <span className="text-xl font-bold tracking-wide">联系我们</span>
          </motion.div>
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate(-1)}
            className="flex items-center text-[#7d6b5a] hover:text-[#d97757] transition-colors font-medium bg-white px-4 py-2 rounded-full shadow-sm border border-[#f0e6d3]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </motion.button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 py-12 md:py-20">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-extrabold text-[#4a3b2c] mb-6">与我们取得联系</h1>
          <p className="text-lg text-[#7d6b5a] max-w-2xl mx-auto leading-relaxed">
            如果您有任何问题、建议或合作意向，欢迎随时与我们联系。我们的团队将尽快给您回复，为您解答每一个疑问。
          </p>
        </motion.div>

        <div className="grid md:grid-cols-5 gap-8">
          {/* Contact Info */}
          <div className="md:col-span-2 space-y-6">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white p-8 rounded-3xl shadow-sm border border-[#f0e6d3] flex items-start space-x-5 hover:shadow-md transition-shadow"
            >
              <div className="bg-[#fdf4f1] p-4 rounded-full text-[#d97757]">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#4a3b2c] mb-2">公司地址</h3>
                <p className="text-[#7d6b5a] leading-relaxed">
                  北京市海淀区中关村大街1号<br />
                  教育科技创新园区 A座 808室
                </p>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white p-8 rounded-3xl shadow-sm border border-[#f0e6d3] flex items-start space-x-5 hover:shadow-md transition-shadow"
            >
              <div className="bg-[#f1f8f5] p-4 rounded-full text-[#8fb9a8]">
                <Phone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#4a3b2c] mb-2">联系电话</h3>
                <p className="text-[#7d6b5a] leading-relaxed">
                  工作日 09:00 - 18:00<br />
                  400-123-4567
                </p>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white p-8 rounded-3xl shadow-sm border border-[#f0e6d3] flex items-start space-x-5 hover:shadow-md transition-shadow"
            >
              <div className="bg-[#fcf8f0] p-4 rounded-full text-[#e8b560]">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#4a3b2c] mb-2">电子邮箱</h3>
                <p className="text-[#7d6b5a] leading-relaxed">
                  商务合作: business@edustory.com<br />
                  技术支持: support@edustory.com
                </p>
              </div>
            </motion.div>
          </div>

          {/* Contact Form */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="md:col-span-3"
          >
            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl border border-[#f0e6d3] relative overflow-hidden">
              {/* Decorative shapes */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#fdf4f1] rounded-full blur-2xl opacity-50"></div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-[#f1f8f5] rounded-full blur-2xl opacity-50"></div>
              
              <h2 className="text-3xl font-extrabold text-[#4a3b2c] mb-8 relative z-10">在线留言</h2>
              <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                <div>
                  <label className="block text-[15px] font-medium text-[#7d6b5a] mb-2">
                    您的姓名 <span className="text-[#d97757]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-5 py-4 bg-[#fcfaf5] border border-[#f0e6d3] rounded-2xl focus:bg-white focus:ring-2 focus:ring-[#d97757]/20 focus:border-[#d97757] outline-none transition-all text-[#5c4b3a] placeholder:text-[#bbaea0]"
                    placeholder="请输入您的称呼"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-[15px] font-medium text-[#7d6b5a] mb-2">
                    联系邮箱
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-5 py-4 bg-[#fcfaf5] border border-[#f0e6d3] rounded-2xl focus:bg-white focus:ring-2 focus:ring-[#d97757]/20 focus:border-[#d97757] outline-none transition-all text-[#5c4b3a] placeholder:text-[#bbaea0]"
                    placeholder="请输入您的电子邮箱地址"
                  />
                </div>
                
                <div>
                  <label className="block text-[15px] font-medium text-[#7d6b5a] mb-2">
                    留言内容 <span className="text-[#d97757]">*</span>
                  </label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-5 py-4 bg-[#fcfaf5] border border-[#f0e6d3] rounded-2xl focus:bg-white focus:ring-2 focus:ring-[#d97757]/20 focus:border-[#d97757] outline-none transition-all resize-none text-[#5c4b3a] placeholder:text-[#bbaea0]"
                    rows={5}
                    placeholder="请输入您的留言内容..."
                    required
                  />
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center px-6 py-4 bg-[#d97757] text-white font-medium rounded-2xl hover:bg-[#c26649] transition-colors shadow-lg shadow-[#d97757]/20 disabled:opacity-70 disabled:cursor-not-allowed text-lg mt-4"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Send className="w-5 h-5 mr-2" />
                  )}
                  {loading ? '提交中...' : '提交留言'}
                </motion.button>
              </form>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 bg-white/80 border-t border-[#f0e6d3] text-[#7d6b5a] py-8 text-center mt-auto">
        <p>© {new Date().getFullYear()} Think-Class. 保留所有权利。</p>
      </footer>
    </div>
  );
}
