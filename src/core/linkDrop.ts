import { normalizeUserUrl } from './url';
import type { PaneSide } from './splitTree';

export type DroppedData = { uriList?: string; html?: string; plain?: string };
export type DroppedUrl = { url: string; reason?: undefined } | { url: null; reason: 'image' | 'invalid' };

const decodeEntities = (value: string): string => value
  .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');

/** Pick the link target of a drop: the URL list first, then an anchor in the HTML, then plain text. A bare image is not a link. */
export function pickDroppedUrl(data: DroppedData): DroppedUrl {
  const html = data.html ?? '';
  const anchor = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html);
  const anchorHref = anchor ? decodeEntities(anchor[1] ?? anchor[2] ?? anchor[3] ?? '') : '';
  const image = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html);
  const imageSrc = image ? decodeEntities(image[1] ?? image[2] ?? image[3] ?? '') : '';
  const uri = (data.uriList ?? '').split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#'));
  // Chrome writes only the <img> markup when a linked image is dragged, while the URL list carries the link.
  // The drag is a bare image only when no link URL exists besides the image itself.
  if (!anchorHref && /<img\b/i.test(html) && (!uri || uri === imageSrc)) return { url: null, reason: 'image' };
  for (const candidate of [uri, anchorHref, data.plain ?? '']) {
    const url = candidate ? normalizeUserUrl(candidate) : null;
    if (url) return { url };
  }
  return { url: null, reason: 'invalid' };
}

/** The side of the fixed pane that link additions use; the saved direction defaults to the right. */
export function linkSideFromDirection(value: unknown): PaneSide {
  return value === 'left' ? 'left' : value === 'up' ? 'top' : value === 'down' ? 'bottom' : 'right';
}
