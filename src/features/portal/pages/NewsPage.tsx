import { useState, useEffect } from "react";
import { Calendar, Eye, FileText, Newspaper } from "lucide-react";
import { motion } from "framer-motion";

import { portalApi } from "@/features/portal/api/portalApi";
import PortalShell from "@/features/portal/components/PortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface Article {
  id: number;
  title: string;
  summary: string;
  content: string;
  cover_image: string;
  category: string;
  view_count: number;
  created_at: string;
}

/**
 * 新闻动态.
 *
 * The article reader was a hand-rolled fixed overlay with a manual close button and
 * no Escape handling; it is the kit's `Dialog` now, so it traps focus, closes on
 * Escape and gets the same entrance animation as every other dialog in the product.
 * The empty and loading states use `EmptyState` and `Spinner` instead of a
 * `border-b-2 border-indigo-500` div.
 *
 * Public site, so it wears no console page scaffold: there is no console shell on these
 * routes and the page keeps its own `PortalShell` chrome. Only the vocabulary moved -
 * every colour is a token now (`bg-surface-*`, `text-fg-*`, `text-role`).
 */
export default function NewsPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        const data = await portalApi.getArticles({ is_published: true, limit: 20 });
        if (data.success) setArticles(data.articles);
      } catch (error) {
        console.error("获取新闻动态失败:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchArticles();
  }, []);

  const handleReadMore = async (id: number) => {
    setArticleLoading(true);
    try {
      const data = await portalApi.getArticle(id);
      if (data.success) setSelectedArticle(data.article);
    } catch (error) {
      console.error("获取文章详情失败:", error);
    } finally {
      setArticleLoading(false);
    }
  };

  return (
    <PortalShell title="新闻动态" icon={Newspaper} mainClassName="max-w-6xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-14 text-center">
        <h1 className="mb-4 text-3xl font-bold text-fg-1 md:text-4xl">最新动态</h1>
        <p className="mx-auto max-w-xl text-base text-fg-3">
          了解系统的最新功能发布、教育资讯和成功案例分享。
        </p>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" label="正在加载新闻" className="text-role" />
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={<span className="text-xl font-semibold text-fg-1">暂无新闻内容</span>}
          description="我们正在准备更多精彩内容，敬请期待！"
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article, idx) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              key={article.id}
              className="group flex cursor-pointer flex-col overflow-hidden rounded-panel border border-line-1 bg-surface-2 shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-raised"
              onClick={() => handleReadMore(article.id)}
            >
              {article.cover_image ? (
                <div className="h-48 overflow-hidden bg-surface-3">
                  <img
                    src={article.cover_image}
                    alt={article.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center bg-surface-3/50">
                  <Newspaper className="size-12 text-fg-3/40" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-6">
                <div className="mb-3 flex items-center gap-3 text-xs font-medium text-fg-3">
                  {article.category ? <Badge variant="secondary">{article.category}</Badge> : null}
                  <div className="flex items-center">
                    <Calendar className="mr-1 size-3.5" />
                    {new Date(article.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <h3 className="mb-2 line-clamp-2 text-base leading-snug font-semibold text-fg-1 transition-colors group-hover:text-role">
                  {article.title}
                </h3>
                <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-fg-3">
                  {article.summary || "点击阅读完整内容..."}
                </p>
                <div className="mt-auto flex items-center justify-between border-t border-line-1 pt-4">
                  <div className="flex items-center text-xs text-fg-3">
                    <Eye className="mr-1 size-3.5" />
                    {article.view_count} 次阅读
                  </div>
                  <span className="text-xs font-medium text-role group-hover:underline">阅读全文</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(selectedArticle)} onOpenChange={(open) => !open && setSelectedArticle(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          {selectedArticle ? (
            <>
              {selectedArticle.cover_image ? (
                <div className="h-56 w-full overflow-hidden md:h-72">
                  <img
                    src={selectedArticle.cover_image}
                    alt={selectedArticle.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <DialogHeader className="px-8 pt-6">
                <div className="mb-3 flex items-center gap-3 text-xs font-medium text-fg-3">
                  {selectedArticle.category ? (
                    <Badge variant="secondary">{selectedArticle.category}</Badge>
                  ) : null}
                  <div className="flex items-center">
                    <Calendar className="mr-1 size-3.5" />
                    {new Date(selectedArticle.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center">
                    <Eye className="mr-1 size-3.5" />
                    {selectedArticle.view_count}
                  </div>
                </div>
                <DialogTitle className="text-2xl leading-tight font-bold md:text-3xl">
                  {selectedArticle.title}
                </DialogTitle>
                <DialogDescription className="sr-only">文章正文</DialogDescription>
              </DialogHeader>
              <div className="max-h-[50vh] overflow-y-auto px-8 pb-4">
                {articleLoading ? (
                  <div className="flex justify-center py-10">
                    <Spinner size="lg" label="正在加载文章" className="text-role" />
                  </div>
                ) : (
                  <div
                    className="prose max-w-none leading-relaxed whitespace-pre-line text-fg-2"
                    dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
                  />
                )}
              </div>
              <DialogFooter className="justify-center bg-surface-3/50">
                <Button type="button" variant="outline" onClick={() => setSelectedArticle(null)}>
                  关闭文章
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PortalShell>
  );
}
