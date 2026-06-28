import { useState, useEffect } from 'react';
import { Megaphone, X } from 'lucide-react';

import { useActiveAnnouncement } from '@/features/engagement/hooks/useAnnouncements';

export default function AnnouncementBanner() {
  const [isVisible, setIsVisible] = useState(true);
  const { data: announcement = null } = useActiveAnnouncement();

  useEffect(() => {
    if (!announcement) return;
    const dismissedId = localStorage.getItem('dismissed_announcement');
    setIsVisible(dismissedId !== announcement.id.toString());
  }, [announcement]);

  const handleDismiss = () => {
    if (announcement) {
      localStorage.setItem('dismissed_announcement', announcement.id.toString());
    }
    setIsVisible(false);
  };

  if (!announcement || !isVisible) return null;

  return (
    <div className="relative z-50 border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-900">
      <div className="max-w-7xl mx-auto flex items-start sm:items-center justify-between">
        <div className="flex items-start sm:items-center flex-1 pr-8">
          <div className="mr-3 flex-shrink-0 rounded-lg bg-white p-1.5 text-emerald-600 shadow-sm">
            <Megaphone className="h-5 w-5" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="font-bold whitespace-nowrap">{announcement.title}:</span>
            <span className="line-clamp-2 text-sm text-emerald-800/80 sm:line-clamp-1 sm:text-base">{announcement.content}</span>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          className="ml-4 flex-shrink-0 rounded-lg p-1.5 text-emerald-700 transition-colors hover:bg-white"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
