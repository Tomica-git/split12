// Names are shown as text, but discard directional/control characters that can
// make confirmation dialogs misleading. Preserve ordinary Japanese and emoji.
export function normalizeDisplayName(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const name = Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim()).slice(0, max).join('');
  return name || null;
}
