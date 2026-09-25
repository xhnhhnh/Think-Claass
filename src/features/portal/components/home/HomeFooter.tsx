import { Link } from "react-router-dom";
import WebsiteIcon from "@/components/WebsiteIcon";

/**
 * Page footer.
 *
 * The copyright year is read at render time rather than frozen into the copy, so the
 * footer keeps showing the current year without a rebuild.
 */
export default function HomeFooter() {
  return (
    <footer className="border-t border-line-1 bg-surface-2">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-10 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-fg-3">
          <WebsiteIcon className="h-4 w-4 rounded object-cover" />
          Think-Class &copy; {new Date().getFullYear()}
        </div>
        <div className="flex gap-6 text-sm text-fg-3">
          <Link to="/about" className="hover:text-fg-2 transition-colors">关于</Link>
          <Link to="/contact" className="hover:text-fg-2 transition-colors">联系</Link>
          <Link to="/news" className="hover:text-fg-2 transition-colors">动态</Link>
        </div>
      </div>
    </footer>
  );
}
