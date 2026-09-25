import { useNavigate } from "react-router-dom";
import { BarChart3, Layout, Settings, Shield, Smartphone, Star, Users, Zap } from "lucide-react";
import { motion } from "framer-motion";

import PortalShell from "@/features/portal/components/PortalShell";
import { Button } from "@/components/ui/button";

/**
 * 产品服务.
 *
 * The eight service tiles used to name eight different Tailwind colours between them
 * (indigo, amber, emerald, violet, rose, cyan, emerald, slate) - a rainbow that
 * belonged to no palette the product owns. They cycle through the four accents the
 * design system actually has, which is what makes a grid of eight read as one page.
 *
 * Public site, so it wears no console page scaffold: these routes have no console shell
 * and the page keeps its own `PortalShell` chrome and `<h1>`. Only the vocabulary moved.
 */
const TONES = ["bg-role", "bg-warning", "bg-success", "bg-info"] as const;

const SERVICES = [
  { icon: Users, title: "多角色管理", description: "支持超级管理员、教师、学生和家长等多种角色，各司其职，权限分明，满足不同使用场景需求。" },
  { icon: Star, title: "科学评价体系", description: "提供光荣榜、积分系统和排行榜，通过正向激励激发学生的学习兴趣和良好习惯养成。" },
  { icon: Smartphone, title: "家校无缝沟通", description: "内置消息通知、班级公告和家校本功能，让家长随时掌握孩子在校表现，打破信息壁垒。" },
  { icon: Layout, title: "数字大屏展示", description: "支持班级数字大屏展示，实时更新班级动态、表扬信息和光荣榜，打造现代化智慧教室。" },
  { icon: Zap, title: "趣味互动体验", description: "集成幸运抽奖、积分商城兑换、互动墙等趣味功能，让班级管理和学习过程更加生动有趣。" },
  { icon: BarChart3, title: "数据统计分析", description: "多维度的数据报表，直观展示班级整体情况和学生个体发展轨迹，辅助教师科学决策。" },
  { icon: Shield, title: "安全可靠护航", description: "采用企业级数据加密和权限控制技术，确保学校、老师和学生的隐私数据绝对安全。" },
  { icon: Settings, title: "高度可定制化", description: "灵活的系统设置，支持自定义班级信息、评价标准和奖励规则，适应不同学校的管理特色。" },
];

export default function ServicesPage() {
  const navigate = useNavigate();

  return (
    <PortalShell title="产品服务" icon={Layout} mainClassName="max-w-6xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-14 text-center">
        <h1 className="mb-4 text-3xl font-bold text-fg-1 md:text-4xl">全方位的智慧班级解决方案</h1>
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-fg-3">
          我们提供了一套完整的教育管理工具，旨在减轻教师负担，促进家校合作，助力学生全面发展。
        </p>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((service, index) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            key={service.title}
            className="flex flex-col items-center rounded-panel border border-line-1 bg-surface-2 p-6 text-center shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-raised"
          >
            <div
              className={`mb-4 flex size-12 items-center justify-center rounded-card text-role-contrast ${TONES[index % TONES.length]}`}
            >
              <service.icon className="size-6" />
            </div>
            <h3 className="mb-2 text-base font-semibold text-fg-1">{service.title}</h3>
            <p className="text-sm leading-relaxed text-fg-3">{service.description}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4 }}
        className="relative mt-20 overflow-hidden rounded-panel border border-role/10 bg-gradient-to-br from-role/5 to-role-soft p-12 text-center md:p-14"
      >
        <h2 className="mb-4 text-2xl font-bold text-fg-1 md:text-3xl">准备好开启您的教育故事了吗？</h2>
        <p className="mx-auto mb-8 max-w-xl text-fg-3">
          立即注册体验所有功能，或者联系我们的团队获取详细的演示和解决方案。
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" onClick={() => navigate("/login")} className="w-full sm:w-auto">
            立即体验系统
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => navigate("/contact")}
            className="w-full bg-surface-2 sm:w-auto"
          >
            联系我们
          </Button>
        </div>
      </motion.div>
    </PortalShell>
  );
}
