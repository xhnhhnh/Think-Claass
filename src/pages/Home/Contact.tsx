import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MessageSquare, Send, Mail, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

import { portalApi } from "@/features/portal/api/portalApi";

export default function HomeContact() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.message.trim()) { toast.error("姓名和留言内容为必填项"); return; }
    setLoading(true);
    try {
      const data = await portalApi.submitContact(formData);
      if (data.success) { toast.success("留言提交成功，我们会尽快与您联系！"); setFormData({ name: "", email: "", message: "" }); }
      else { toast.error(data.message || "提交失败，请重试"); }
    } catch { toast.error("网络错误，请稍后再试"); }
    finally { setLoading(false); }
  };

  const contactItems = [
    { icon: Mail, label: "邮箱", value: "contact@thinkclass.cn", color: "text-white", bg: "bg-indigo-500" },
    { icon: Phone, label: "电话", value: "400-XXX-XXXX", color: "text-white", bg: "bg-emerald-500" },
    { icon: MapPin, label: "地址", value: "中国，北京", color: "text-white", bg: "bg-amber-500" },
  ];

  return (
    <div className="public-campus-page flex min-h-screen flex-col bg-[var(--campus-canvas)] text-slate-800 selection:bg-emerald-100 selection:text-emerald-700 font-sans">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold text-slate-900">联系我们</span>
          </motion.div>
          <motion.button initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} onClick={() => navigate(-1)}
            className="flex items-center text-sm text-slate-500 hover:text-indigo-600 transition-colors font-medium bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> 返回首页
          </motion.button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12 md:py-20">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-14">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">与我们取得联系</h1>
          <p className="text-base text-slate-500 max-w-xl mx-auto">如果您有任何问题、建议或合作意向，欢迎随时与我们联系。</p>
        </motion.div>

        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-3 gap-4 mb-10">
            {contactItems.map((item, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
                className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col items-center text-center gap-1.5">
                <div className={`h-10 w-10 rounded-lg ${item.bg} flex items-center justify-center mb-1`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <span className="text-xs text-slate-400">{item.label}</span>
                <span className="text-sm font-medium text-slate-700">{item.value}</span>
              </motion.div>
            ))}
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="bg-white p-8 md:p-10 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">在线留言</h2>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">您的姓名 <span className="text-indigo-500">*</span></label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-800 placeholder:text-slate-400 text-sm"
                    placeholder="请输入您的称呼" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">联系邮箱</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-slate-800 placeholder:text-slate-400 text-sm"
                    placeholder="请输入您的电子邮箱地址" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">留言内容 <span className="text-indigo-500">*</span></label>
                  <textarea value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none text-slate-800 placeholder:text-slate-400 text-sm"
                    rows={5} placeholder="请输入您的留言内容..." required />
                </div>
                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={loading}
                  className="w-full flex justify-center items-center px-6 py-3.5 bg-indigo-500 text-white font-semibold rounded-xl hover:bg-indigo-600 transition-colors shadow-sm shadow-indigo-500/20 disabled:opacity-60 disabled:cursor-not-allowed text-sm mt-2">
                  {loading ? (<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />) : (<Send className="w-4 h-4 mr-2" />)}
                  {loading ? "提交中..." : "提交留言"}
                </motion.button>
              </form>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="border-t border-slate-100 bg-white py-6 text-center">
        <p className="text-sm text-slate-400">&copy; {new Date().getFullYear()} Think-Class. 保留所有权利。</p>
      </footer>
    </div>
  );
}
