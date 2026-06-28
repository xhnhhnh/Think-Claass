import type { ImgHTMLAttributes } from 'react';

import { useSettings } from '@/hooks/queries/useSettings';

const DEFAULT_WEBSITE_ICON = '/favicon.svg';

export default function WebsiteIcon({
  alt = '',
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const { data: settings } = useSettings();
  const src = settings?.site_favicon || DEFAULT_WEBSITE_ICON;

  return (
    <img
      {...props}
      alt={alt}
      src={src}
      onError={(event) => {
        if (event.currentTarget.src !== new URL(DEFAULT_WEBSITE_ICON, window.location.href).href) {
          event.currentTarget.src = DEFAULT_WEBSITE_ICON;
        }
        onError?.(event);
      }}
    />
  );
}
