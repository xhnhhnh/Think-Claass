import { useState, type ImgHTMLAttributes } from 'react';

import BrandMark from '@/components/BrandMark';
import { useSettings } from '@/hooks/queries/useSettings';

/**
 * The site icon: the platform mark by default, or whatever the superadmin uploaded to
 * `site_favicon` in platform settings.
 *
 * The default used to be an `<img src="/favicon.svg">`, which meant every surface that renders the
 * mark - login card, campus header, sidebar, public-site footer - paid for a network request to
 * raster-scale a 32px file, and the file was a second copy of the geometry that `<BrandMark>`
 * already draws. The default path now draws the mark inline; an uploaded override still goes
 * through `<img>`, because an arbitrary upload has to stay an image.
 *
 * Falling back from a broken override is state rather than "rewrite `currentTarget.src`": the old
 * version swapped in the shipped file and re-triggered the same `onError` on the next render.
 * Keying the state by `src` also means uploading a fixed icon retries instead of staying on the
 * mark for the rest of the session.
 */
export default function WebsiteIcon({
  alt = '',
  onError,
  className,
  style,
  width,
  height,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const { data: settings } = useSettings();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const override = settings?.site_favicon || undefined;
  const showMark = !override || failedSrc === override;

  if (showMark) {
    return (
      <BrandMark
        className={className}
        style={style}
        width={width}
        height={height}
        title={alt || undefined}
      />
    );
  }

  return (
    <img
      {...props}
      className={className}
      style={style}
      width={width}
      height={height}
      alt={alt}
      src={override}
      onError={(event) => {
        setFailedSrc(override ?? null);
        onError?.(event);
      }}
    />
  );
}
