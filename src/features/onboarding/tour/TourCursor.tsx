/**
 * The animated pointer that shows the reader what the step's action looks like.
 *
 * ## What it does, in order
 *
 * Every step it **travels**: it enters from below-left of the target and glides onto it, so the
 * movement itself says "look here". Then it **demonstrates** the step's action on the spot - press
 * and release, type, hover, drag - on a loop.
 *
 * ## Why the amplitudes are what they are
 *
 * A measurement, not a taste: the first version moved the pointer four pixels on a twenty-pixel icon
 * and scaled it to 0.82 to mean "pressed". Probing the running page showed the animation *was*
 * running and that the largest change on screen was under three pixels, which is why it read as no
 * animation at all. So the numbers here are sized to be seen at arm's length on a laptop: a travel
 * of roughly 180px, a press that visibly shrinks the pointer, a press ring that expands to about
 * 50px, and an eight-to-eighty-pixel gesture per action. Still restrained - this is a pointer, not a
 * firework - but no longer invisible.
 *
 * ## Why the travel re-runs on a remount
 *
 * `initial` is only applied when an element mounts, so the travel is keyed on the step: each step
 * mounts its own pointer at the origin and animates onto the target. `initial={false}` was the first
 * version's choice and is precisely why nothing appeared to move - the pointer was simply drawn
 * where it was meant to end up.
 *
 * ## Why it is deliberately quiet
 *
 * The pointer is small and greyscale, and it carries no `pointer-events`, so it can never intercept
 * the click it is asking for. It is an instruction, not the subject: the spotlight is what should
 * catch the eye first.
 */

import { motion, type TargetAndTransition, type Transition } from 'framer-motion';
import { ChevronDown, MousePointer2 } from 'lucide-react';

import type { TourAction } from './tourSteps';
import type { TargetRect } from './useTourTarget';

/** How far below-left of the target the pointer starts, so the arrival is a movement you can see. */
const ENTER_OFFSET = { x: -150, y: 120 };
/** Long enough to follow with your eye, short enough not to hold up the step. */
const TRAVEL_SECONDS = 0.62;

export interface TourCursorProps {
  rect: TargetRect | null;
  /** Changing this remounts the pointer, which is what replays the travel for the new step. */
  stepKey: string;
  action: TourAction;
  reduceMotion: boolean;
}

interface Gesture {
  animate: TargetAndTransition;
  transition: Transition;
}

/**
 * The demonstration for one action, as a looping animation.
 *
 * `next` and `hover` share a slow sweep: neither has a gesture to teach - the step is "read this" -
 * so the honest thing to show is the pointer resting on the element and moving along it.
 *
 * ## What `reducedMotion` changes, and what it must not
 *
 * It removes *movement* - travel, sweeps, presses, drags - because those are the vestibular
 * triggers the setting exists to suppress. It must not remove the animation altogether, which is
 * what the first version did, and which left a reader with the setting on looking at a completely
 * static pointer that demonstrated nothing. Fading is not motion: WCAG's animation-from-interaction
 * rule is about movement, and an opacity pulse carries the same "here, press this" information
 * without moving anything.
 */
function gestureFor(action: TourAction, reduceMotion: boolean): Gesture {
  if (reduceMotion) {
    // A press reads as a firmer pulse than a hover, and neither moves.
    const firm = action === 'click' || action === 'drag';
    return {
      animate: { opacity: firm ? [1, 0.4, 1] : [1, 0.62, 1] },
      transition: { duration: firm ? 1.6 : 2.6, repeat: Infinity, ease: 'easeInOut' },
    };
  }

  switch (action) {
    case 'click':
      // Press, hold, release - plus a ring, which is the part that reads as "click" from a distance.
      return {
        animate: { scale: [1, 0.68, 0.68, 1] },
        transition: {
          duration: 1.5,
          times: [0, 0.1, 0.3, 0.5],
          repeat: Infinity,
          repeatDelay: 0.7,
          ease: 'easeInOut',
        },
      };
    case 'input':
      // The caret beside the pointer blinks; the pointer drifts right in small steps, the way a
      // hand moves across a field while typing.
      return {
        animate: { x: [0, 9, 9, 0] },
        transition: { duration: 2.4, times: [0, 0.35, 0.7, 1], repeat: Infinity, ease: 'easeInOut' },
      };
    case 'select':
      // Down towards the control's own affordance and back.
      return {
        animate: { y: [0, 10, 0] },
        transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
      };
    case 'drag':
      // Press, travel far enough to read as a drag, release, return.
      return {
        animate: { x: [0, 84, 84, 0], scale: [1, 0.8, 0.8, 1] },
        transition: {
          duration: 3,
          times: [0, 0.28, 0.6, 1],
          repeat: Infinity,
          repeatDelay: 0.7,
          ease: 'easeInOut',
        },
      };
    case 'hover':
    case 'next':
    default:
      return {
        animate: { x: [-18, 18, -18] },
        transition: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
      };
  }
}

export function TourCursor({ rect, stepKey, action, reduceMotion }: TourCursorProps) {
  const gesture = gestureFor(action, reduceMotion);

  /*
   * The gesture starts only once the pointer has arrived. Running both at the same time made the
   * arrival look like a wobble rather than a movement, because the two animations were fighting for
   * the reader's attention on the same 600ms.
   */
  const gestureWithArrivalDelay: Transition = reduceMotion
    ? gesture.transition
    : { ...gesture.transition, delay: TRAVEL_SECONDS };

  const destination = rect
    ? { x: rect.left + rect.width * 0.42, y: rect.top + rect.height * 0.58 }
    : { x: window.innerWidth / 2, y: window.innerHeight * 0.86 };

  /*
   * Under reduced motion the pointer appears where it is needed instead of flying there - but it
   * still fades in, so the step change is visible. Fading into place is not a movement; appearing
   * with no transition at all reads as nothing having happened.
   */
  const origin = reduceMotion || !rect
    ? destination
    : { x: destination.x + ENTER_OFFSET.x, y: destination.y + ENTER_OFFSET.y };

  const travel: Transition = reduceMotion
    ? { duration: 0.28, ease: 'easeOut' }
    : { type: 'tween', duration: TRAVEL_SECONDS, ease: [0.22, 1, 0.36, 1] };

  return (
    <motion.div
      key={stepKey}
      aria-hidden="true"
      data-slot="tour-cursor"
      className="pointer-events-none fixed left-0 top-0 z-[62]"
      initial={{ x: origin.x, y: origin.y, opacity: 0 }}
      animate={{ x: destination.x, y: destination.y, opacity: rect ? 1 : 0 }}
      transition={travel}
    >
      <motion.div
        className="relative"
        animate={gesture.animate}
        transition={gestureWithArrivalDelay}
      >
        {/*
          The outline is what makes it readable on any surface: a white fill with a dark stroke is
          the same trick the operating system's own cursor uses, and it needs no drop shadow (and so
          no colour literal) to stay visible over the dimmed area.
        */}
        <MousePointer2 className="size-6 fill-paper stroke-ink-1" strokeWidth={1.5} />

        {/* Press feedback. Centred on the tip with offsets, not translate utilities: framer-motion
            owns `transform` on this subtree and would overwrite a Tailwind translate. Under reduced
            motion the ring holds its size and breathes instead of expanding. */}
        {action === 'click' || action === 'drag' ? (
          <motion.span
            className="absolute -left-3 -top-3 size-6 rounded-pill border-2 border-primary"
            animate={reduceMotion ? { opacity: [0.85, 0, 0.85] } : { scale: [0.25, 2.2], opacity: [0.75, 0] }}
            transition={
              reduceMotion
                ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 1.3, repeat: Infinity, repeatDelay: 0.6, ease: 'easeOut' }
            }
          />
        ) : null}

        {/* Typing: a caret that blinks where text would appear. A blink is an opacity change, so it
            stays under reduced motion - it is the only cue that says "text goes here". */}
        {action === 'input' ? (
          <motion.span
            className="absolute left-5 top-5 h-5 w-0.5 rounded-pill bg-primary"
            animate={{ opacity: [1, 0.1, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
          />
        ) : null}

        {/* Choosing from a list: the affordance of the control being pointed at. */}
        {action === 'select' ? (
          <ChevronDown className="absolute left-4 top-5 size-3.5 text-primary" aria-hidden="true" />
        ) : null}
      </motion.div>
    </motion.div>
  );
}

export default TourCursor;
