import { useEffect } from 'react';

import { useSettings } from '@/hooks/queries/useSettings';

export default function SiteSettingsBootstrap() {
  const { data: settings } = useSettings();

  useEffect(() => {
    if (!settings) {
      return;
    }

    if (settings.site_title) {
      document.title = settings.site_title;
    }

    if (settings.site_favicon) {
      let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = settings.site_favicon;
    }
  }, [settings]);

  return null;
}
