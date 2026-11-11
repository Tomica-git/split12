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
export function addressSuggestions(value: string, sources: readonly AddressSource[]): AddressSuggestion[] {
  const input = value.trim();
  if (!input || /[\u0000-\u001f\u007f]/.test(input) || /^(?:javascript|data|file|chrome|chrome-extension|about|blob|vbscript|mailto|ftp):/i.test(input)) return [];
  const direct = normalizeUserUrl(input), search = googleSearchUrl(input);
  if (!direct && !search && !/^https?:\/\/[^\s]*$/i.test(input)) return [];
  const needle = input.toLocaleLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  const seen = new Set<string>();
  const matches: Array<{ score: number; item: AddressSuggestion }> = [];
  for (const [index, source] of [...sources, ...common, ...(direct ? [{ url: direct }] : [])].entries()) {
    if (!isOpenableUrl(source.url)) continue;
    const url = new URL(source.url);
    if (url.username || url.password || seen.has(url.href)) continue;
    seen.add(url.href);
    const address = url.href.replace(/^https?:\/\//, '').replace(/^www\./, '').toLocaleLowerCase();
    const title = source.title ?? '';
    if (!address.includes(needle) && !title.toLocaleLowerCase().includes(needle)) continue;
    const rank = address === needle || address === needle + '/' ? 0 : address.startsWith(needle) ? 1 : 2;
    matches.push({ score: rank * 10000 + index, item: { kind: 'url', url: url.href, label: title || url.hostname, detail: url.href } });
  }
  const result = matches.sort((a, b) => a.score - b.score).slice(0, search ? 5 : 6).map(entry => entry.item);
  if (search) result.push({ kind: 'search', url: search, label: text.searchSuggestion(input), detail: text.searchHere });
  return result;
}
