import type { AddressSuggestion } from '../core/suggestions';
import { text } from '../ui/strings';
import { normalizeUserUrl } from '../core/url';

export function createAddressSuggestions(input: HTMLInputElement, id: string, suggest: (value: string) => AddressSuggestion[] | Promise<AddressSuggestion[]>, choose: (item: AddressSuggestion) => void) {
  const list = document.createElement('div'); list.id = id; list.className = 'address-suggestions'; list.hidden = true;
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', text.addressSuggestions); document.body.append(list);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', id); input.setAttribute('aria-expanded', 'false');
  let items: AddressSuggestion[] = [], active = -1, generation = 0, composing = false, shownValue = '', awaiting = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function close(): void { generation++; clearTimeout(timer); timer = undefined; awaiting = false; list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
  function position(): void {
    const rect = input.getBoundingClientRect(), width = Math.min(Math.max(rect.width, 290), innerWidth - 16);
    const below = innerHeight - rect.bottom - 8, above = rect.top - 8, up = below < 180 && above > below;
    Object.assign(list.style, { left: `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`, width: `${width}px`, maxHeight: `${Math.max(40, Math.min(280, up ? above : below))}px`, top: up ? 'auto' : `${rect.bottom + 4}px`, bottom: up ? `${innerHeight - rect.top + 4}px` : 'auto' });
  }
  function highlight(): void {
    for (const [index, element] of [...list.children].entries()) element.setAttribute('aria-selected', String(index === active));
    if (active < 0) input.removeAttribute('aria-activedescendant');
    else { input.setAttribute('aria-activedescendant', `${id}-${active}`); list.children[active]?.scrollIntoView({ block: 'nearest' }); }
  }
  function accept(index: number): void { const item = items[index]; if (!item) return; close(); choose(item); }
  function refresh(): void {
    clearTimeout(timer); const own = ++generation, value = input.value;
    // Suggestions follow the text being composed too (R-99); keys stay with the IME until compositionend.
    if (document.activeElement !== input || !value.trim()) { close(); return; }
    if (value !== shownValue) {
      items = []; active = -1; list.hidden = true;
      input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    }
    awaiting = true;
    timer = setTimeout(() => {
      timer = undefined;
      void Promise.resolve().then(() => suggest(value)).then(result => {
        if (own !== generation || input.value !== value || document.activeElement !== input) return;
        awaiting = false;
        const previous = shownValue === value && !list.hidden && active >= 0 ? items[active] : undefined;
        items = result; active = previous ? items.findIndex(item => item.kind === previous.kind && item.url === previous.url) : -1; shownValue = value;
        // Words that are not an address preselect the visible Google search row, so Enter searches (R-82).
        if (active < 0 && !normalizeUserUrl(value)) active = items.findIndex(item => item.kind === 'search');
        list.replaceChildren(...items.map((item, index) => {
          const row = document.createElement('div'); row.id = `${id}-${index}`; row.className = 'address-suggestion'; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', 'false');
          const label = document.createElement('strong'), detail = document.createElement('small'); label.textContent = item.label; detail.textContent = item.detail; row.append(label, detail);
          row.addEventListener('pointerdown', event => { if (event.button === 0) event.preventDefault(); }); row.addEventListener('click', () => accept(index)); return row;
        }));
        list.hidden = !items.length; input.setAttribute('aria-expanded', String(items.length > 0)); position(); highlight();
      }).catch(() => { if (own === generation) close(); });
    }, 80);
  }
  input.addEventListener('input', refresh); input.addEventListener('focus', refresh); input.addEventListener('blur', close);
  input.addEventListener('compositionstart', () => { composing = true; }); input.addEventListener('compositionend', () => { composing = false; refresh(); });
  input.addEventListener('keydown', event => {
    if (event.isComposing || composing || event.keyCode === 229) return;
    if (event.key === 'Escape' && (awaiting || !list.hidden)) { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if (list.hidden) return;
    if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault(); event.stopImmediatePropagation(); active = active < 0 ? event.key === 'ArrowDown' ? 0 : items.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; highlight();
    } else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); event.stopImmediatePropagation(); accept(active); }
  }, true);
  window.addEventListener('resize', close);
  window.addEventListener('scroll', event => {
    if (list.contains(event.target as Node) || event.target === input) return;
    if (document.activeElement === input) { if (!list.hidden) position(); } else close();
  }, true);
  document.addEventListener('pointerdown', event => { if (event.target !== input && !list.contains(event.target as Node)) close(); });
  return { close, refresh, get composing() { return composing; }, get pendingOrOpen() { return awaiting || timer !== undefined || !list.hidden; } };
}
