/**
 * Login backdrop.
 *
 * Both decorations are utilities rather than inline styles: the dot grid used to be
 * a `style={{ backgroundImage: radial-gradient(..., ${COLORS.text}...) }}`, which is
 * where three of the portal's inline styles and eleven of its hex colours lived.
 */
export default function LoginBackground() {
  return (
    <>
      {/* Dot grid, drawn from the ink token at 4% so it reads on paper and on canvas. */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle,hsl(var(--ink-2))_1px,transparent_1px)] bg-[length:24px_24px] opacity-[0.04]" />

      {/* Campus accent bar: the brand's three colours, in one place. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-1 bg-brand" />
    </>
  );
}
