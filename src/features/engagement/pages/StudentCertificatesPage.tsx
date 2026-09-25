import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Award, Trophy } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';

import { certificatesApi } from '@/features/engagement/api/certificatesApi';

interface Certificate {
  id: number;
  title: string;
  description: string;
  created_at: string;
}

/**
 * 荣誉奖状.
 *
 * A `list` page: the gold banner that repeated the page title is gone - the shell's
 * context bar prints it - and its one line of copy is the scaffold's description.
 * The award cards keep their spring entrance and their small hover tilt (dropped
 * under `prefers-reduced-motion`), and the gold family is the `warning` token rather
 * than `yellow-*`/`orange-*`, so it follows the palette instead of being a fixed
 * shade. The fetch, its `user` dependency and every string are unchanged.
 */
export default function StudentCertificates() {
  const user = useStore((state) => state.user);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (user?.studentId) {
      fetchCertificates();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchCertificates = async () => {
    try {
      const data = await certificatesApi.getStudentCertificates(user.studentId);
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
      <PageScaffold variant="list" className="flex items-center justify-center py-20">
        <Spinner size="lg" label="正在加载奖状" className="text-warning" />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold variant="list" title="荣誉奖状" description="快来看看你都获得了哪些闪亮的荣誉吧！">
      {certificates.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="荣誉墙空空如也"
          description="继续努力学习，争取早日拿到你的第一张奖状吧！"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {certificates.map((cert, index) => (
            <motion.div
              key={cert.id}
              initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { scale: 0.94, y: 16 }) }}
              animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { scale: 1, y: 0 }) }}
              transition={{ delay: index * 0.08, type: 'spring', stiffness: 200 }}
              whileHover={shouldReduceMotion ? undefined : { scale: 1.03, rotate: index % 2 === 0 ? 1.5 : -1.5 }}
              className="overflow-hidden rounded-panel border border-warning/40 bg-surface-2 shadow-card"
            >
              {/* The gold wash is the token scale, not a fixed `yellow-*` gradient. */}
              <div className="bg-gradient-to-br from-warning-soft via-surface-3 to-warning-soft/70 p-8">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-5 flex size-20 items-center justify-center rounded-full border-4 border-surface-2 bg-gradient-to-br from-warning to-warning-ink shadow-raised">
                    <Award aria-hidden="true" className="size-10 text-warning-soft" />
                  </div>

                  <h3 className="text-2xl font-black leading-tight text-warning-ink">
                    {cert.title}
                  </h3>

                  <div className="my-4 h-1 w-16 rounded-pill bg-warning/60" />

                  <p className="text-base font-medium leading-relaxed text-fg-2">
                    {cert.description || '表现优异，特发此状，以资鼓励。'}
                  </p>

                  <div className="mt-6 w-full border-t-2 border-dashed border-warning/40 pt-5">
                    <p className="text-xs font-bold uppercase tracking-widest text-warning-ink">
                      授予日期
                    </p>
                    <p className="mt-1 font-bold text-fg-2">
                      {new Date(cert.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </PageScaffold>
  );
}
