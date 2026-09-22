/** Clipboard text replaces the whole script. Empty paste is ignored. */
export function replacementScript(clipboard: string): string | null {
  const text = clipboard.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (text.trim().length === 0) return null;
  return text;
}
