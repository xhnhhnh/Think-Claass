/**
 * Copy one line of text, and tell the caller whether it actually copied.
 *
 * `navigator.clipboard` only exists in a secure context, and the admin console is often deployed on
 * a plain-http LAN address - there the API is `undefined` and calling it used to throw from inside
 * the click handler, so a 复制 button did nothing at all. It can also exist and still reject (an
 * iframe without clipboard permission), which is why every path here is awaited and caught.
 *
 * The fallback is the selection + `document.execCommand('copy')` route, which still works in the
 * browsers that lack the Clipboard API. Returning a boolean rather than throwing keeps the callers
 * honest: they may only report success after `true`.
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied / not focused: try the legacy path before giving up.
    }
  }

  return copyWithTextarea(text);
}

function copyWithTextarea(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) {
    return false;
  }

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    // Read-only, off-screen, and not part of the visual flow: selecting it must not scroll or
    // focus-steal from the page the operator is working on.
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.left = '-1000px';
    document.body.appendChild(textarea);
    textarea.select();

    if (typeof document.execCommand !== 'function') {
      return false;
    }
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea?.parentNode?.removeChild(textarea);
  }
}
