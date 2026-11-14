import { googleSearchUrl } from './search';
import { isOpenableUrl, normalizeUserUrl } from './url';
import { text } from '../ui/strings';

export interface AddressSource { url: string; title?: string }
export interface AddressSuggestion { kind: 'url' | 'search'; url: string; label: string; detail: string }
const common: AddressSource[] = [
  { url: 'https://www.google.com/', title: 'Google' }, { url: 'https://mail.google.com/', title: 'Gmail' },
  { url: 'https://notebooklm.google.com/', title: 'NotebookLM' }, { url: 'https://note.com/', title: 'note' },
  { url: 'https://x.com/', title: 'X' }, { url: 'https://www.youtube.com/', title: 'YouTube' },
  { url: 'https://chatgpt.com/', title: 'ChatGPT' }, { url: 'https://claude.ai/', title: 'Claude' },
];
/** A page from Chrome's history (R-98); the counts rank it like the omnibox does. */
export interface HistorySource extends AddressSource { visitCount?: number; typedCount?: number; lastVisitTime?: number }
export const MAX_SUGGESTIONS = 6;
function historyWeight(item: HistorySource, now = Date.now()): number {
  const age = now - (item.lastVisitTime ?? 0);
  return (item.typedCount ?? 0) * 8 + (item.visitCount ?? 0) + (age < 86400000 ? 4 : age < 7 * 86400000 ? 2 : 0);
}
// Open tabs and saved pages first, then history by weight, then the fixed sites, then the typed URL itself.
export function addressSuggestions(value: string, sources: readonly AddressSource[], history: readonly HistorySource[] = []): AddressSuggestion[] {
  const input = value.trim();
  if (!input || /[\u0000-\u001f\u007f]/.test(input) || /^(?:javascript|data|file|chrome|chrome-extension|about|blob|vbscript|mailto|ftp):/i.test(input)) return [];
  const direct = normalizeUserUrl(input), search = googleSearchUrl(input);
  if (!direct && !search && !/^https?:\/\/[^\s]*$/i.test(input)) return [];
  const needle = input.toLocaleLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  const words = needle.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const matches: Array<{ rank: number; group: number; order: number; item: AddressSuggestion }> = [];
  const groups: Array<readonly HistorySource[]> = [sources, history, common, direct ? [{ url: direct }] : []];
  for (const [group, list] of groups.entries()) for (const [index, source] of list.entries()) {
    if (!isOpenableUrl(source.url)) continue;
    const url = new URL(source.url);
    if (url.username || url.password || seen.has(url.href)) continue;
    const address = url.href.replace(/^https?:\/\//, '').replace(/^www\./, '').toLocaleLowerCase();
    const title = (source.title ?? '').toLocaleLowerCase();
    // Every word must appear in the address or the title, so "youtube music" finds "Music - YouTube".
    if (!words.every(word => address.includes(word) || title.includes(word))) continue;
    seen.add(url.href);
    const rank = address === needle || address === needle + '/' ? 0 : address.startsWith(needle) ? 1 : address.includes(needle) ? 2 : 3;
    matches.push({ rank, group, order: group === 1 ? -historyWeight(source) : index, item: { kind: 'url', url: url.href, label: source.title || url.hostname, detail: url.href } });
  }
  const result = matches.sort((a, b) => a.rank - b.rank || a.group - b.group || a.order - b.order).slice(0, search ? MAX_SUGGESTIONS - 1 : MAX_SUGGESTIONS).map(entry => entry.item);
  if (search) result.push({ kind: 'search', url: search, label: text.searchSuggestion(input), detail: text.searchHere });
  return result;
}
