import { SectionCard } from '@/components/ui/section-card';

import { RestartGuideButton } from './RestartGuideButton';

/**
 * The "start the tour again" section for the settings pages.
 *
 * It is a `SectionCard` because every settings surface in this app is a stack of them, and it asks
 * the shared button for a replay rather than rendering the tour itself: the tour is mounted once,
 * above the router, and must not be mounted a second time inside a page.
 *
 * This is the discoverable surface - a reader who goes looking for "how do I see that guide again"
 * goes to settings. The shell's profile block carries the same button for the reader who does not
 * think to look here; see `RestartGuideButton` for why they are one component.
 */
export function RestartGuideCard() {
  return (
    // The wrapper exists only to carry the anchor: `SectionCard` takes presentation props, not
    // arbitrary ones, and widening its API for a single caller would be the wrong trade.
    <div data-tour="profile-guide-card">
      <SectionCard
        title="新手教程"
        description="第一次进入时会自动开始的分步引导，可以随时重看。"
        actions={<RestartGuideButton />}
      >
        <p className="text-sm text-ink-3">
          教程会一步步指出界面上的位置，并等你真的完成那一步操作。重看不会影响任何数据，也不会改变「已经看过」的记录。
        </p>
      </SectionCard>
    </div>
  );
}

export default RestartGuideCard;
