import { useState } from "react";
import { Mail, MapPin, MessageSquare, Phone, Send } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

import { portalApi } from "@/features/portal/api/portalApi";
import PortalShell from "@/features/portal/components/PortalShell";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/**
 * 联系我们.
 *
 * The form's three fields were hand-styled `<input>`/`<textarea>` with an indigo
 * focus ring and labels that were not associated with their controls; they are
 * `Input`/`Textarea` behind `FormField` now, so clicking a label focuses its field
 * and the focus ring follows the theme.
 */
const CONTACT_ITEMS = [
  { icon: Mail, label: "邮箱", value: "contact@thinkclass.cn", tone: "bg-primary" },
  { icon: Phone, label: "电话", value: "400-XXX-XXXX", tone: "bg-success" },
  { icon: MapPin, label: "地址", value: "中国，北京", tone: "bg-warning" },
];

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.message.trim()) {
      toast.error("姓名和留言内容为必填项");
      return;
    }
    setLoading(true);
    try {
      const data = await portalApi.submitContact(formData);
      if (data.success) {
        toast.success("留言提交成功，我们会尽快与您联系！");
        setFormData({ name: "", email: "", message: "" });
      } else {
        toast.error(data.message || "提交失败，请重试");
      }
    } catch {
      toast.error("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalShell title="联系我们" icon={MessageSquare} mainClassName="max-w-6xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-14 text-center">
        <h1 className="mb-4 text-3xl font-bold text-ink-1 md:text-4xl">与我们取得联系</h1>
        <p className="mx-auto max-w-xl text-base text-ink-3">
          如果您有任何问题、建议或合作意向，欢迎随时与我们联系。
        </p>
      </motion.div>

      <div className="mx-auto max-w-3xl">
        <div className="mb-10 grid grid-cols-3 gap-4">
          {CONTACT_ITEMS.map((item, idx) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="flex flex-col items-center gap-1.5 rounded-panel border border-border bg-paper p-5 text-center shadow-sm"
            >
              <div
                className={`mb-1 flex size-10 items-center justify-center rounded-card text-primary-foreground ${item.tone}`}
              >
                <item.icon className="size-5" />
              </div>
              <span className="text-xs text-ink-3">{item.label}</span>
              <span className="text-sm font-medium text-ink-2">{item.value}</span>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="rounded-panel border border-border bg-paper p-8 shadow-card md:p-10">
            <h2 className="mb-6 text-xl font-semibold text-ink-1">在线留言</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <FormField label="您的姓名" required>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入您的称呼"
                  required
                />
              </FormField>

              <FormField label="联系邮箱">
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="请输入您的电子邮箱地址"
                />
              </FormField>

              <FormField label="留言内容" required>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={5}
                  placeholder="请输入您的留言内容..."
                  className="resize-none"
                  required
                />
              </FormField>

              <Button type="submit" size="lg" disabled={loading} className="mt-2 w-full">
                {loading ? (
                  <>
                    <Spinner label="正在提交留言" className="text-primary-foreground" />
                    提交中...
                  </>
                ) : (
                  <>
                    <Send data-icon="inline-start" />
                    提交留言
                  </>
                )}
              </Button>
            </form>
          </div>
        </motion.div>
      </div>
    </PortalShell>
  );
}
