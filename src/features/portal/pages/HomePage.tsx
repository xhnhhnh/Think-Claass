import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { portalApi } from "@/features/portal/api/portalApi";
import HomeNav from "@/features/portal/components/home/HomeNav";
import HomeHero from "@/features/portal/components/home/HomeHero";
import HomeQuickLinks from "@/features/portal/components/home/HomeQuickLinks";
import HomeAudience from "@/features/portal/components/home/HomeAudience";
import HomeAbout from "@/features/portal/components/home/HomeAbout";
import HomeJourney from "@/features/portal/components/home/HomeJourney";
import HomeClassroomMoments from "@/features/portal/components/home/HomeClassroomMoments";
import HomeNews from "@/features/portal/components/home/HomeNews";
import HomeClosingCta from "@/features/portal/components/home/HomeClosingCta";
import HomeFooter from "@/features/portal/components/home/HomeFooter";

/**
 * Home page.
 *
 * The page keeps only what it alone can own: the two portal fetches, the navigation and
 * motion hooks they feed, and the order of the sections. Every visual block now lives in
 * `components/home`, which is why the markup below is a single flat run of sections —
 * same DOM, same copy, no per-section state or requests added.
 */
export default function Home() {
  const [homeData, setHomeData] = useState<any>({});
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [homeRes, articlesRes] = await Promise.all([
          portalApi.getHomeContent(),
          portalApi.getArticles({ is_published: true, limit: 3 }),
        ]);
        setHomeData(homeRes.data || {});
        setArticles(articlesRes.articles || []);
      } catch (err) {
        console.error("Failed to fetch homepage data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const about = homeData.about || {
    title: "让学习充满乐趣",
    content: "在这里，每个孩子都是独一无二的主角。",
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-1 selection:bg-primary/10 selection:text-primary font-sans">
      <HomeNav onNavigateHome={() => navigate("/")} />
      <HomeHero shouldReduceMotion={shouldReduceMotion} />
      <HomeQuickLinks />
      <HomeAudience />
      <HomeAbout about={about} />
      <HomeJourney />
      <HomeClassroomMoments />
      <HomeNews loading={loading} articles={articles} onOpenNews={() => navigate("/news")} />
      <HomeClosingCta />
      <HomeFooter />
    </div>
  );
}
