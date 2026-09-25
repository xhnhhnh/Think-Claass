/**
 * The dimming layer and the spotlight cut around the current step's target.
 *
 * ## How the "hole" is made without a second layer
 *
 * The usual approach is two elements - a full-screen dim and a transparent box on top of it - or an
 * SVG mask. Neither is needed: a single element with a very large `box-shadow` spread *is* the mask.
 * The element's own background is transparent, so whatever is under it shows through, and its shadow
 * covers the entire rest of the viewport. One element, one geometry, and the border is a `ring` on
 * the same box, so the outline can never drift from the hole it is outlining.
 *
 * ## Why it animates position instead of being re-created per step
 *
 * The mask is mounted for the whole tour and animated from one step's rectangle to the next, so the
 * spotlight *slides* rather than jumping. That is the whole reason the geometry is passed to
 * framer-motion rather than set as a CSS class: a class cannot carry a measured rectangle, and this
 * is the same mechanism the rest of the app already uses for values that are only known at runtime.
 *
 * ## Why it cannot swallow a click
 *
 * Both layers are `pointer-events-none`. The reader has to be able to press the real button inside
 * the hole - that press is what advances the tour, so an interactive mask would deadlock the step it
 * is asking for.
 */

import { motion, type Transition } from 'framer-motion';

import { cn } from '@/lib/utils';

import type { TargetRect } from './useTourTarget';

/** Breathing room between the target's box and the edge of the hole. */
const PADDING = 8;

/**
 * The dim colour: the ink token at 60%, so the mask follows the role theme rather than being a
 * hard-coded black, and the level matches the full-screen layer below so crossfading between the
 * two anchored and unanchored states is invisible.
 */
const MASK_SHADOW = 'shadow-[0_0_0_9999px_hsl(var(--ink-1)/0.6)]';

const DIM_BACKGROUND = 'bg-ink-1/60';

export interface TourSpotlightProps {
  rect: TargetRect | null;
  reduceMotion: boolean;
}

export function TourSpotlight({ rect, reduceMotion }: TourSpotlightProps) {
  /*
   * Under reduced motion the mask still fades - an opacity change is not a movement - but it does
   * not slide, because a full-viewport rectangle travelling across the screen is exactly the kind of
   * motion the setting asks to be spared. Splitting the transition per property is what lets the
   * geometry jump while the fade survives; without it the first version killed both, and the step
   * change became invisible.
   */
  const slide: Transition = reduceMotion
    ? {
        x: { duration: 0 },
        y: { duration: 0 },
        width: { duration: 0 },
        height: { duration: 0 },
        opacity: { duration: 0.25 },
      }
    : { type: 'tween', duration: 0.4, ease: [0.22, 1, 0.36, 1] };

  return (
    <>
      {/*
        The plain dim, used when a step has no target on screen. It crossfades against the mask
        below, so the two states are the same shade of grey at every moment.
      */}
      <motion.div
        aria-hidden="true"
        data-slot="tour-dim"
        className={cn('pointer-events-none fixed inset-0 z-[60]', DIM_BACKGROUND)}
        initial={false}
        animate={{ opacity: rect ? 0 : 1 }}
        transition={{ duration: 0.25 }}
      />

      <motion.div
        aria-hidden="true"
        data-slot="tour-spotlight"
        className={cn('pointer-events-none fixed left-0 top-0 z-[61] rounded-card', MASK_SHADOW)}
        initial={false}
        animate={{
          x: rect ? rect.left - PADDING : 0,
          y: rect ? rect.top - PADDING : 0,
          width: rect ? rect.width + PADDING * 2 : 0,
          height: rect ? rect.height + PADDING * 2 : 0,
          opacity: rect ? 1 : 0,
        }}
        transition={slide}
      >
        {/* A steady edge, so the boundary reads clearly in every mode. */}
        <div className="absolute inset-0 rounded-card ring-2 ring-primary/70" />

        {/*
          The breathing halo. Deliberately the *inner* ring and not the mask itself: scaling the
          mask would drag the 9999px shadow with it and the edge of the dimming would visibly pulse.

          It breathes in both modes because it only changes opacity - it is the one cue that keeps
          saying "here" when movement has been switched off.
        */}
        <motion.div
          className="absolute inset-0 rounded-card ring-2 ring-primary/40"
          animate={{ opacity: [0.2, 0.7, 0.2] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </>
  );
}

export default TourSpotlight;
