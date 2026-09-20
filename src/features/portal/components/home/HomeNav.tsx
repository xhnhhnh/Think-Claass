import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import WebsiteIcon from "@/components/WebsiteIcon";

interface HomeNavProps {
  onNavigateHome: () => void;
}

/**
 * Sticky navigation bar.
 *
 * The wordmark stays a `motion.div` driven by a click handler rather than becoming a
 * `Link`: it has always been that element on this page, so turning it into an anchor
 * would change the rendered DOM and the slide-in animation along with it.
 */
export default function HomeNav({ onNavigateHome }: HomeNavProps) {
  return (
    <nav className="sticky top-0 z-50 bg-paper/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-ink-1 cursor-pointer"
          onClick={onNavigateHome}
        >
          <WebsiteIcon className="h-9 w-9 rounded-lg object-cover" />
          <span>Think-Class</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden md:flex gap-8 font-medium text-ink-2 text-sm"
        >
          <Link to="/about" className="hover:text-primary transition-colors">
            关于我们
          </Link>
          <Link to="/services" className="hover:text-primary transition-colors">
            服务介绍
          </Link>
          <Link to="/news" className="hover:text-primary transition-colors">
            最新动态
          </Link>
          <Link to="/contact" className="hover:text-primary transition-colors">
            联系我们
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Link
            to="/login"
            className="px-5 py-2 rounded-lg bg-primary/50 text-white text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 inline-flex items-center gap-2"
          >
            开启旅程 <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </nav>
  );
}
