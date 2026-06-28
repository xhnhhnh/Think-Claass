import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface TypewriterSegment {
  text: string;
  className?: string;
}

interface TypewriterTextProps {
  segments: TypewriterSegment[];
  startDelay?: number;
  speed?: number;
}

export default function TypewriterText({
  segments,
  startDelay = 0,
  speed = 80,
}: TypewriterTextProps) {
  const shouldReduceMotion = useReducedMotion();
  const fullText = segments.map((segment) => segment.text).join('');
  const [visibleCount, setVisibleCount] = useState(
    shouldReduceMotion ? fullText.length : 0,
  );
  const [hasStarted, setHasStarted] = useState(Boolean(shouldReduceMotion));

  useEffect(() => {
    if (shouldReduceMotion) {
      setVisibleCount(fullText.length);
      setHasStarted(true);
      return;
    }

    setVisibleCount(0);
    setHasStarted(false);

    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      setHasStarted(true);
      setVisibleCount((current) => Math.min(current + 1, fullText.length));
      intervalId = window.setInterval(() => {
        setVisibleCount((current) => {
          const nextCount = Math.min(current + 1, fullText.length);
          if (nextCount >= fullText.length && intervalId) {
            window.clearInterval(intervalId);
          }
          return nextCount;
        });
      }, speed);
    }, startDelay);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [fullText, shouldReduceMotion, speed, startDelay]);

  let revealedCharacters = 0;
  const isTyping = visibleCount < fullText.length;

  return (
    <span className="inline-grid" aria-label={fullText}>
      <span className="invisible col-start-1 row-start-1" aria-hidden="true">
        {segments.map((segment, index) => (
          <span key={`${segment.text}-${index}`} className={segment.className}>
            {segment.text}
          </span>
        ))}
      </span>
      <span className="col-start-1 row-start-1" aria-hidden="true">
        {segments.map((segment, index) => {
          const segmentStart = revealedCharacters;
          revealedCharacters += segment.text.length;
          const segmentLength = Math.max(
            0,
            Math.min(segment.text.length, visibleCount - segmentStart),
          );

          return (
            <span key={`${segment.text}-${index}`} className={segment.className}>
              {segment.text.slice(0, segmentLength)}
            </span>
          );
        })}
        {hasStarted && isTyping && (
          <span className="ml-0.5 inline-block text-indigo-400 animate-pulse">
            |
          </span>
        )}
      </span>
    </span>
  );
}
