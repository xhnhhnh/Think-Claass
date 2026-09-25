/**
 * The interactive product tour.
 *
 * ## What it is
 *
 * A spotlight tour over the real application. Each step names an element that exists on the screen
 * the reader is actually looking at, dims everything else, cuts a hole around that element and puts
 * a pointer over it that demonstrates the gesture. Steps whose `action` is not `next` are finished
 * by *doing the thing*: the click lands on the real button, the panel really opens, the route really
 * changes - and the next step points at what just appeared.
 *
 * ## Why it advanced away from the previous design
 *
 * The first version was a full-screen set of four scenes with its own artwork, its own timer and its
 * own idea of what the product contains. It could not be wrong about the reader, because it made no
 * claims about them, and it could not be right either: nobody who watched it knew where 功能开关 was.
 * A tour that teaches has to be anchored to the interface, has to wait for the reader, and has to be
 * able to say "this is not on your screen" - which is what the anchor convention and the fallback
 * copy are for.
 *
 * ## Why nothing here traps focus
 *
 * The step the reader has to perform is usually *outside* this component - a search box to type in,
 * a nav entry to click. A focus trap, or moving focus to the tooltip, would fight the very
 * interaction the step is asking for. So the tooltip is a non-modal `dialog` that announces itself
 * through `aria-live` and binds Escape globally, and the keyboard never leaves the page underneath.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, type Transition } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useClasses } from '@/hooks/queries/useClasses';
import { useStore } from '@/store/useStore';

import { useStartupGuide } from './useStartupGuide';
import {
  guideRole,
  tourStepsFor,
  type GuideRole,
  type TourAction,
  type TourStep,
} from './tour/tourSteps';
import { TourCursor } from './tour/TourCursor';
import { TourSpotlight } from './tour/TourSpotlight';
import { tooltipPosition } from './tour/tooltipPlacement';
import { useTourTarget } from './tour/useTourTarget';

/** Which DOM event finishes a step, per action. `null` means the button is the only way on. */
const ACTION_EVENT: Partial<Record<TourAction, string>> = {
  click: 'click',
  input: 'input',
  select: 'change',
};

export function GuidedTour() {
  const user = useStore((state) => state.user);
  const { shouldShow, finish } = useStartupGuide(user?.id);

  const role = guideRole(user?.role);

  // The session below owns the step state, so it is mounted per run: reopening the tour from
  // 「重新开始引导」 starts at step one with nothing left over from the previous run.
  if (!shouldShow || !role || !user) return null;

  return <TourSession role={role} onFinish={finish} />;
}

function TourSession({ role, onFinish }: { role: GuideRole; onFinish: () => void }) {
  /*
   * Asked for only on a teacher's run, and only to decide which of the two teacher tours applies:
   * with no class, `TeacherDashboardPage` renders `FirstRunWizard` instead of the dashboard, so the
   * dashboard's buttons do not exist to point at. The query shares its key and cache entry with the
   * dashboard's own, so this costs no extra request.
   */
  const { data: classes, isLoading } = useClasses({ enabled: role === 'teacher' });

  /*
   * The step list is frozen for the whole run, on purpose. A teacher who creates their first class
   * *during* the tour changes which tour applies, and letting the list swap underneath them would
   * silently move them to a different step at the same index. "The tour you started is the tour you
   * finish" is the behaviour a reader can predict.
   */
  const stepsRef = useRef<TourStep[] | null>(null);
  if (stepsRef.current === null && !(role === 'teacher' && isLoading)) {
    stepsRef.current = tourStepsFor(role, { hasClass: (classes?.length ?? 0) > 0 });
  }

  const steps = stepsRef.current;
  if (!steps) return null;

  return <TourRun steps={steps} onFinish={onFinish} />;
}

function TourRun({ steps, onFinish }: { steps: TourStep[]; onFinish: () => void }) {
  const shouldReduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  const lastIndex = Math.max(0, steps.length - 1);
  const stepIndex = Math.min(index, lastIndex);
  const step = steps[stepIndex];
  const isLast = stepIndex >= lastIndex;

  const { element, rect, searching } = useTourTarget(step.anchor, {
    smoothScroll: !shouldReduceMotion,
  });

  const goNext = useCallback(() => {
    setIndex((current) => Math.min(current + 1, lastIndex));
  }, [lastIndex]);

  const goPrevious = useCallback(() => {
    setIndex((current) => Math.max(current - 1, 0));
  }, []);

  /*
   * Finishing a step by performing it.
   *
   * The listener is on the real element, and the overlay above it is `pointer-events-none`, so the
   * press that advances the tour is the same press that operates the application. `click` is the
   * event for buttons and nav entries, `input` for typing, `change` for the native selects the kit
   * wraps - and a step with none of them is finished by its button.
   */
  useEffect(() => {
    const eventName = ACTION_EVENT[step.action];
    if (!element || !eventName) return;

    const advance = () => goNext();
    element.addEventListener(eventName, advance);
    return () => element.removeEventListener(eventName, advance);
  }, [element, step.action, goNext]);

  // Escape leaves, always. The arrows move between steps, but not while the reader is typing in the
  // field a step asked them to type in, where a horizontal arrow belongs to the text caret.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onFinish();
        return;
      }

      // `event.target` is the focused element in a browser but the `Document` itself when an event
      // is dispatched on it, and only an Element has a tag name.
      const target = event.target;
      const tag = target instanceof Element ? target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevious();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrevious, onFinish]);

  const position = useMemo(() => tooltipPosition(rect), [rect]);

  const highlight = shouldReduceMotion
    ? ({ duration: 0 } as Transition)
    : ({ type: 'tween', duration: 0.32, ease: [0.22, 1, 0.36, 1] } as Transition);

  // A step whose target is a moment away shows its own text while it waits; only a target that
  // never arrives shows the fallback, so the copy does not flicker on every panel that opens.
  const useFallback = !searching && step.anchor !== null && rect === null;
  const body = useFallback ? (step.fallback ?? step.description) : step.description;

  const primaryLabel = step.primaryLabel ?? (isLast ? '完成' : '下一步');
  const needsAction = step.action !== 'next' && !useFallback;

  return (
    /*
     * No `z-index` on this wrapper. Giving it one would make it a stacking context and trap the
     * tooltip inside it, below the mask and the pointer - which are siblings at `z-[60]` and up.
     * The children carry their own layers instead: dim 60, mask 61, pointer 62, tooltip 63.
     */
    <div className="pointer-events-none fixed inset-0">
      <TourSpotlight rect={rect} reduceMotion={shouldReduceMotion} />
      <TourCursor
        rect={rect}
        stepKey={step.id}
        action={step.action}
        reduceMotion={shouldReduceMotion}
      />

      <motion.div
        role="dialog"
        aria-modal={false}
        aria-live="polite"
        aria-labelledby="guided-tour-title"
        data-slot="tour-tooltip"
        className="pointer-events-auto fixed left-0 top-0 z-[63] rounded-panel border border-border bg-paper p-4 shadow-floating"
        initial={false}
        animate={{
          x: position.left,
          y: position.top,
          width: position.width,
          opacity: 1,
        }}
        transition={highlight}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tabular-nums text-primary">
            第 {stepIndex + 1} / {steps.length} 步
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onFinish}
            className="text-ink-3 hover:text-ink-1"
          >
            <X data-icon="inline-start" />
            跳过引导
          </Button>
        </div>

        {/*
          The step's own text is keyed on the step so it animates in rather than being swapped in
          place. Without this the box glides to its new position while its contents change instantly,
          which reads as two unrelated things happening at once.

          Under reduced motion it fades without the slide: an opacity change is not movement, and
          dropping the transition entirely would make the step change invisible.
        */}
        <motion.div
          key={step.id}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0.22 } : { duration: 0.26, ease: 'easeOut' }}
        >
          <h2 id="guided-tour-title" className="font-heading text-sm font-bold text-ink-1">
            {step.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-2">{body}</p>

          {needsAction ? (
            <p className="mt-2 text-xs text-ink-3">完成上面的操作会自动继续，也可以点「{primaryLabel}」。</p>
          ) : null}
        </motion.div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={goPrevious}
            disabled={stepIndex === 0}
            className="text-ink-3 hover:text-ink-1"
          >
            <ArrowLeft data-icon="inline-start" />
            上一步
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={isLast ? onFinish : goNext}
            className="px-3"
          >
            {isLast ? <Check data-icon="inline-start" /> : null}
            {primaryLabel}
            {isLast ? null : <ArrowRight data-icon="inline-end" />}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export default GuidedTour;
