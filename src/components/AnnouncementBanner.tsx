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
    <div className="bg-blue-600 text-white px-4 py-3 shadow-md relative z-50">
      <div className="max-w-7xl mx-auto flex items-start sm:items-center justify-between">
        <div className="flex items-start sm:items-center flex-1 pr-8">
          <div className="flex-shrink-0 bg-blue-500/50 p-1.5 rounded-lg mr-3">
            <Megaphone className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="font-bold whitespace-nowrap">{announcement.title}:</span>
            <span className="text-blue-100 text-sm sm:text-base line-clamp-2 sm:line-clamp-1">{announcement.content}</span>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          className="flex-shrink-0 p-1.5 hover:bg-blue-500 rounded-lg transition-colors ml-4"
          aria-label="关闭"
        >
          <X className="h-5 w-5 text-blue-200 hover:text-white" />
        </button>
      </div>
    </div>
  );
}
