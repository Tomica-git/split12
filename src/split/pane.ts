import { normalizeHost } from '../core/host';
import { canGoBack, canGoForward, emptyHistory, paneHistory, type PaneHistory } from '../core/paneHistory';
import { isOpenableUrl, lacksDomain, normalizeUserUrl } from '../core/url';
import { ZOOMS, stepZoom, type PaneState, type Zoom } from '../core/workspace';
import { text } from '../ui/strings';
import { isAuthenticationHost, isNoteLoginPage } from '../core/auth';
import { googleHostnameSearchUrl, googleSearchUrl } from '../core/search';
import type { AddressSuggestion } from '../core/suggestions';
import { createAddressSuggestions } from './addressSuggestions';

export interface TabChoice { url: string; title: string; host: string; icon?: string; tabId?: number }
export interface PaneCallbacks {
  state(index: number): PaneState;
  changed(index: number, patch: Partial<PaneState>): void;
  preparationChanged(): void;
  select(index: number): void;
  maximize(index: number): void;
  allow(url: string): Promise<void>;
  clearServiceWorker(url: string): Promise<boolean>;
  isAllowed(host: string): boolean;
  split(index: number, axis: 'x' | 'y'): void;
  reorder(from: number, to: number): void;
  numberDrag(index: number, event: PointerEvent, button: HTMLButtonElement): void;
  close(index: number): void;
  canClose(): boolean;
  context(index: number, x: number, y: number, numberTarget: boolean): void;
  closeSourceTab(choice: TabChoice): void;
  suggest(value: string): AddressSuggestion[] | Promise<AddressSuggestion[]>;
}
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads';
const PERMISSIONS = 'fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture';

export class Pane {
  readonly element: HTMLElement;
  readonly index: number;
  nav = 0;
  private readonly input: HTMLInputElement;
  private readonly view: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly forward: HTMLButtonElement;
  private readonly numberButton: HTMLButtonElement;
  private readonly zoomButton: HTMLButtonElement;
  private readonly zoomMenu: HTMLElement;
  private readonly suggestions: ReturnType<typeof createAddressSuggestions>;
  private addressDirty = false;
  private frame?: HTMLIFrameElement;
  private history: PaneHistory = emptyHistory();
  private traverseIndex?: number;
  private pendingLoad?: (success: boolean) => void;
  private openGeneration = 0;
  private preparingUrl?: string;
  private parkedNeedsAllow = false;
  private serviceWorkerRetryNav = -1;
  private readonly windowError = Object.assign(document.createElement('div'), { className: 'pane-notice', hidden: true });
  private openingWindow = false;
  private windowNavigationGeneration = 0;
  // Blocks clicks until the frame is mapped. Toggling pointer-events on the frame instead makes Chrome
  // briefly route the next press to this page rather than the embedded one.
  private readonly shield = Object.assign(document.createElement('div'), { className: 'frame-shield', hidden: true });

  constructor(index: number, private readonly callbacks: PaneCallbacks) {
    this.index = index;
    const el = document.createElement('section');
    el.className = 'pane';
    el.dataset.index = String(index);
    el.setAttribute('aria-label', `ペイン ${index + 1}`);
    el.innerHTML = `
      <div class="pane-bar">
        <img class="pane-favicon" alt="" aria-hidden="true" draggable="false" hidden>
        <button type="button" class="pane-number" draggable="false" aria-haspopup="menu">${String(index + 1).padStart(2, '0')}</button>
        <button type="button" class="icon pane-menu" aria-haspopup="menu" aria-label="${text.paneMenu}" title="${text.paneMenu}"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button type="button" class="icon back" aria-label="${text.back}" title="${text.back}">‹</button>
        <button type="button" class="icon forward" aria-label="${text.forward}" title="${text.forward}">›</button>
        <button type="button" class="icon reload" aria-label="${text.reload}" title="${text.reload}">↻</button>
        <input class="address" aria-label="${text.address}" placeholder="${text.addressPlaceholder}" spellcheck="false" autocomplete="off">
        <div class="zoom-wrap"><button type="button" class="zoom" aria-label="${text.zoom}" aria-expanded="false">100%</button><div class="zoom-menu" hidden></div></div>
        <button type="button" class="icon move-window" aria-label="このページを新しいタブで開く" title="このページを新しいタブで開く">↪</button>
        <button type="button" class="icon close" aria-label="${text.close}" title="${text.close}">×</button>
      </div>
      <div class="pane-view">
        <div class="empty">
          <div class="empty-mark" aria-hidden="true">＋</div>
          <strong class="empty-title">${text.emptyTitle}</strong>
          <button type="button" class="empty-address">${text.emptyAddress}</button>
          <p class="empty-tabs-heading" hidden>${text.emptyTabsHeading}</p>
          <div class="tab-picker" role="list" aria-label="${text.openTabs}"></div>
          <p class="tab-picker-none">${text.emptyDescription}</p>
          <p class="empty-drop">${text.emptyDrop}</p>
        </div>
        <div class="overlay" hidden></div>
      </div>`;
    this.element = el;
    this.input = el.querySelector('.address')!;
    this.view = el.querySelector('.pane-view')!;
    this.overlay = el.querySelector('.overlay')!;
    this.empty = el.querySelector('.empty')!;
    this.back = el.querySelector('.back')!;
    this.forward = el.querySelector('.forward')!;
    this.numberButton = el.querySelector('.pane-number')!;
    this.zoomButton = el.querySelector('.zoom')!;
    this.zoomMenu = el.querySelector('.zoom-menu')!;
    this.suggestions = createAddressSuggestions(this.input, `address-options-${index}`, value => callbacks.suggest(value), item => {
      callbacks.select(index); void this.openExplicit(item.url);
    });
    this.input.addEventListener('input', () => {
      this.addressDirty = true;
      if (this.input.hasAttribute('aria-invalid')) { this.input.removeAttribute('aria-invalid'); this.overlay.hidden = true; }
    });
    this.input.addEventListener('blur', () => { if (!this.addressDirty) this.input.value = this.callbacks.state(this.index).url; });
    const button = (selector: string): HTMLButtonElement => el.querySelector(selector)!;
    this.windowError.setAttribute('role', 'status');
    this.windowError.textContent = '新しいタブを開けませんでした。元の枠はそのままです。';
    this.view.append(this.windowError);
    let secondaryPress = false;
    el.addEventListener('pointerdown', event => {
      secondaryPress = event.button !== 0 || event.ctrlKey && event.pointerType === 'mouse';
      if (!secondaryPress) callbacks.select(index);
      else setTimeout(() => { secondaryPress = false; }, 0);
    });
    el.addEventListener('focusin', () => { if (!secondaryPress) callbacks.select(index); });
    el.addEventListener('contextmenu', event => {
      if (!(event.target instanceof Element) || !event.target.closest('.pane-bar')) return;
      if (event.target.closest('input,textarea,[contenteditable]')) return;
      const numberTarget = Boolean(event.target.closest('.pane-number, .pane-favicon'));
      event.preventDefault();
      callbacks.context(index, event.clientX, event.clientY, numberTarget);
    });
    el.querySelector<HTMLButtonElement>('.pane-number')!.addEventListener('keydown', event => {
      if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
      event.preventDefault();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      callbacks.context(index, rect.left, rect.bottom, true);
    });
    const number = el.querySelector<HTMLButtonElement>('.pane-number')!;
    number.addEventListener('dragstart', event => event.preventDefault());
    number.addEventListener('pointerdown', event => callbacks.numberDrag(index, event, number));
    // The site icon left of the number is the same handle: drag to swap or move, double-click to maximize (R-87).
    const favicon = el.querySelector<HTMLImageElement>('.pane-favicon')!;
    favicon.addEventListener('dragstart', event => event.preventDefault());
    favicon.addEventListener('pointerdown', event => callbacks.numberDrag(index, event, number));
    favicon.addEventListener('pointerdown', event => {
      if (event.button === 0 && event.isPrimary && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey)
        iconPress = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    });
    // The drag captures the pointer on the number button, so movement is watched at the window.
    window.addEventListener('pointermove', event => {
      if (iconPress?.id === event.pointerId && Math.hypot(event.clientX - iconPress.x, event.clientY - iconPress.y) >= 4) iconPress.moved = true;
    }, true);
    favicon.addEventListener('dblclick', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || iconPress?.moved) return;
      callbacks.maximize(index);
    });
    let iconPress: { id: number; x: number; y: number; moved: boolean } | undefined;
    // Pointer capture keeps drag tracking on this button even when the pointer leaves it.
    // Remember both presses in a double click so a drag followed by a click cannot maximize.
    let press: { id: number; x: number; y: number; moved: boolean } | undefined;
    let lastPressDragged = false, previousPressDragged = false;
    number.addEventListener('pointerdown', event => {
      if (event.button === 0 && event.isPrimary && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey)
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    });
    number.addEventListener('pointermove', event => {
      if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 4) press.moved = true;
    });
    number.addEventListener('pointerup', event => {
      if (press?.id !== event.pointerId) return;
      previousPressDragged = lastPressDragged; lastPressDragged = press.moved; press = undefined;
    });
    number.addEventListener('pointercancel', () => { press = undefined; lastPressDragged = true; });
    number.addEventListener('dblclick', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || previousPressDragged || lastPressDragged) return;
      callbacks.maximize(index);
    });
    // A keyboard-activated click has detail zero; mouse single clicks only select the pane.
    number.addEventListener('click', event => { if (event.detail === 0) callbacks.maximize(index); });
    // URL drops are handled by the view: every position adds a pane, Shift replaces (R-79).
    this.input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || this.suggestions.composing || event.keyCode === 229) return;
      this.suggestions.close();
      const url = normalizeUserUrl(this.input.value);
      if (!url) { this.showInputError(this.input.value); return; }
      void this.openExplicit(url);
    });
    this.back.addEventListener('click', () => this.go(-1));
    this.forward.addEventListener('click', () => this.go(1));
    button('.reload').addEventListener('click', () => this.reload());
    button('.move-window').addEventListener('click', () => { void this.moveToWindow(); });
    button('.close').addEventListener('click', () => callbacks.close(index));
    button('.empty-address').addEventListener('click', () => { callbacks.select(index); this.input.focus(); this.input.select(); });
    button('.pane-menu').addEventListener('click', event => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      callbacks.context(index, rect.left, rect.bottom, true);
    });
    this.zoomButton.addEventListener('click', () => {
      if (!this.zoomMenu.hidden) { this.closeZoom(); return; }
      const current = callbacks.state(index).zoom;
      const options = [...new Set([...ZOOMS, current])].sort((a, b) => b - a);
      this.zoomMenu.replaceChildren(...options.map(zoom => {
        const option = document.createElement('button');
        option.type = 'button'; option.textContent = `${Math.round(zoom * 100)}%`;
        option.setAttribute('aria-pressed', String(zoom === current));
        option.addEventListener('click', () => { callbacks.changed(index, { zoom }); this.setZoom(zoom); this.closeZoom(); });
        return option;
      }));
      this.zoomMenu.hidden = false;
      this.zoomButton.setAttribute('aria-expanded', 'true');
      const buttonRect = this.zoomButton.getBoundingClientRect(), menuRect = this.zoomMenu.getBoundingClientRect();
      const left = Math.max(8, Math.min(buttonRect.right - menuRect.width, innerWidth - menuRect.width - 8));
      const top = buttonRect.bottom + menuRect.height <= innerHeight - 8 ? buttonRect.bottom : Math.max(8, buttonRect.top - menuRect.height);
      Object.assign(this.zoomMenu.style, { left: `${left}px`, top: `${top}px` });
      this.zoomMenu.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
    });
    document.addEventListener('pointerdown', event => {
      if (!this.zoomMenu.hidden && !this.zoomMenu.contains(event.target as Node) && event.target !== this.zoomButton) this.closeZoom();
    });
    // Narrow panes drop header controls in steps; the pane menu offers what is hidden (R-83).
    new ResizeObserver(() => {
      const width = el.getBoundingClientRect().width;
      if (!width) return;
      const size = width < 200 ? 'xs' : width < 300 ? 's' : width < 420 ? 'm' : 'l';
      if (el.dataset.size !== size) { el.dataset.size = size; if (size !== 'l') this.closeZoom(); }
    }).observe(el);
    this.updateButtons();
  }

  private closeZoom(): void { this.zoomMenu.hidden = true; this.zoomButton.setAttribute('aria-expanded', 'false'); }

  private updateButtons(): void {
    this.back.disabled = !canGoBack(this.history);
    this.forward.disabled = !canGoForward(this.history);
    if (!this.addressDirty && !this.preparingUrl) this.input.value = this.callbacks.state(this.index).url;
    this.setZoom(this.callbacks.state(this.index).zoom);
    const favicon = this.element.querySelector<HTMLImageElement>('.pane-favicon')!;
    const pageUrl = this.callbacks.state(this.index).url;
    if (isOpenableUrl(pageUrl)) {
      const iconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
      iconUrl.searchParams.set('pageUrl', pageUrl); iconUrl.searchParams.set('size', '16');
      if (favicon.src !== iconUrl.toString()) favicon.src = iconUrl.toString();
      favicon.hidden = false;
    } else { favicon.hidden = true; favicon.removeAttribute('src'); }
    this.element.querySelector<HTMLButtonElement>('.move-window')!.disabled = this.openingWindow || !isOpenableUrl(this.callbacks.state(this.index).url);
  }
  setZoom(zoom: Zoom): void {
    this.zoomButton.textContent = `${Math.round(zoom * 100)}%`;
    if (this.frame) {
      this.frame.style.width = `${100 / zoom}%`;
      this.frame.style.height = `${100 / zoom}%`;
      this.frame.style.transform = `scale(${zoom})`;
    }
  }
  renderTabs(choices: TabChoice[]): void {
    const list = this.empty.querySelector<HTMLElement>('.tab-picker')!;
    list.replaceChildren(...choices.map(choice => {
      const item = document.createElement('button');
      item.type = 'button'; item.className = 'tab-pick'; item.setAttribute('role', 'listitem'); item.title = `${choice.url}\nこの枠で開き、読み込めたら元のタブを閉じます`;
      const icon = document.createElement('span'); icon.className = 'tab-pick-icon'; icon.setAttribute('aria-hidden', 'true');
      if (choice.icon) icon.append(Object.assign(document.createElement('img'), { src: choice.icon, alt: '' }));
      else icon.textContent = choice.host.charAt(0).toUpperCase();
      const details = document.createElement('span'); details.className = 'tab-pick-text';
      const title = document.createElement('strong'); title.textContent = choice.title;
      const host = document.createElement('small'); host.textContent = choice.host;
      details.append(title, host); item.append(icon, details);
      // The page moves into this pane: the original Chrome tab closes once the pane has loaded it (R-94).
      item.addEventListener('click', () => {
        this.callbacks.select(this.index);
        void this.openExplicit(choice.url, true).then(loaded => { if (loaded) this.callbacks.closeSourceTab(choice); });
      });
      return item;
    }));
    list.hidden = !choices.length;
    this.empty.querySelector<HTMLElement>('.empty-tabs-heading')!.hidden = !choices.length;
    this.empty.querySelector<HTMLElement>('.tab-picker-none')!.hidden = Boolean(choices.length);
  }
  ownsWindow(source: MessageEventSource | null): boolean { return Boolean(source && this.frame?.contentWindow === source); }
  setDisplayNumber(index: number): void {
    this.element.dataset.index = String(index);
    this.element.dataset.slot = String(this.index);
    this.element.setAttribute('aria-label', `ペイン ${index + 1}`);
    this.element.querySelector('.pane-number')!.textContent = String(index + 1).padStart(2, '0');
    if (this.frame) this.frame.title = `ペイン ${index + 1} のページ`;
  }
  captureHistory(): PaneHistory { return structuredClone(this.history); }
  closeSuggestions(): void { this.suggestions.close(); }
  refreshSuggestions(): void { if (this.addressDirty && this.suggestions.pendingOrOpen && !this.preparingUrl && !this.input.hasAttribute('aria-invalid')) this.suggestions.refresh(); }
  needsAllow(): boolean { return Boolean(this.preparingUrl) || this.parkedNeedsAllow; }
  restoreHistory(history: PaneHistory, resetFrame: boolean, needsAllow = false): void {
    this.addressDirty = false; this.suggestions.close(); this.input.value = this.callbacks.state(this.index).url;
    this.openGeneration++; this.preparingUrl = undefined; this.pendingLoad?.(false);
    this.traverseIndex = undefined;
    this.history = structuredClone(history);
    this.parkedNeedsAllow = needsAllow;
    if (resetFrame) this.destroyFrame();
  }
  /** Header controls hidden because the pane is narrow, so the pane menu can offer them instead. */
  hiddenTools(): Array<{ label: string; disabled: boolean; action: () => void }> {
    const hidden = (selector: string) => this.element.querySelector<HTMLElement>(selector)!.getClientRects().length === 0;
    const tools: Array<{ label: string; disabled: boolean; action: () => void }> = [];
    const hasPage = Boolean(this.callbacks.state(this.index).url);
    if (hasPage && hidden('.back')) tools.push({ label: text.back, disabled: this.back.disabled, action: () => this.go(-1) }, { label: text.forward, disabled: this.forward.disabled, action: () => this.go(1) });
    if (hasPage && hidden('.reload')) tools.push({ label: text.reload, disabled: !this.callbacks.state(this.index).url, action: () => this.reload() });
    const moveWindow = this.element.querySelector<HTMLButtonElement>('.move-window')!;
    if (hasPage && hidden('.move-window')) tools.push({ label: text.openTab, disabled: moveWindow.disabled, action: () => { void this.moveToWindow(); } });
    if (hidden('.zoom-wrap')) {
      const zoom = this.callbacks.state(this.index).zoom;
      tools.push({ label: `${text.zoomIn}（${Math.round(zoom * 100)}%）`, disabled: zoom >= ZOOMS[0]!, action: () => this.callbacks.changed(this.index, { zoom: stepZoom(zoom, 1) }) },
        { label: text.zoomOut, disabled: zoom <= ZOOMS.at(-1)!, action: () => this.callbacks.changed(this.index, { zoom: stepZoom(zoom, -1) }) });
    }
    return tools;
  }
  pageBack(): void { this.go(-1); }
  pageForward(): void { this.go(1); }
  setMaximized(maximized: boolean): void {
    const label = maximized ? text.restore : text.maximize;
    this.numberButton.setAttribute('aria-label', `ペイン ${Number(this.element.dataset.index) + 1}：${label}（ダブルクリックまたは Enter）`);
    this.numberButton.title = `ダブルクリックで${label}、ドラッグで交換または境界へ移動、右クリックでメニュー`;
  }
  async openExplicit(url: string, confirmLoad = false): Promise<boolean> {
    const generation = ++this.openGeneration;
    if (!isOpenableUrl(url)) { this.showInputError(); return false; }
    this.addressDirty = false; this.suggestions.close();
    this.preparingUrl = url;
    this.callbacks.preparationChanged();
    try {
      await this.callbacks.allow(url);
      if (generation !== this.openGeneration) return false;
      this.preparingUrl = undefined;
      this.parkedNeedsAllow = false;
      this.navigate(url);
      // A pane may have been hidden while its allowlist request was pending.
      if (confirmLoad && !this.frame) return false;
      if (confirmLoad) return await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => finish(false), 10000);
        const finish = (success: boolean) => {
          clearTimeout(timer);
          if (this.pendingLoad === finish) this.pendingLoad = undefined;
          resolve(success);
        };
        this.pendingLoad = finish;
      });
      return true;
    } catch (error) {
      if (generation !== this.openGeneration) return false;
      this.preparingUrl = undefined;
      this.showMessage(error instanceof Error ? error.message : '読み込みの準備に失敗しました。', []);
      return false;
    } finally { this.callbacks.preparationChanged(); }
  }
  navigate(url: string, traverseIndex?: number): void {
    if (!isOpenableUrl(url)) return;
    this.pendingLoad?.(false);
    this.traverseIndex = traverseIndex;
    this.nav++;
    this.frame?.remove();
    this.frame = undefined;
    this.shield.hidden = true;
    this.callbacks.changed(this.index, { url });
    if (!this.addressDirty) this.input.value = url;
    this.input.removeAttribute('aria-invalid');
    this.empty.hidden = true;
    this.overlay.hidden = true;
    this.element.querySelector<HTMLButtonElement>('.move-window')!.disabled = this.openingWindow;
    if (this.element.hidden) return;
    const frame = document.createElement('iframe');
    frame.title = `ペイン ${Number(this.element.dataset.index) + 1} のページ`;
    frame.setAttribute('sandbox', SANDBOX);
    frame.setAttribute('allow', PERMISSIONS);
    const query = new URLSearchParams({ pane: String(this.index), nav: String(this.nav), to: url });
    frame.src = `${chrome.runtime.getURL('pane-boot.html')}?${query}`;
    this.frame = frame;
    this.setZoom(this.callbacks.state(this.index).zoom);
    this.view.prepend(frame);
    frame.after(this.shield);
    this.shield.hidden = false;
  }
  destroyFrame(): void {
    this.suggestions.close();
    this.pendingLoad?.(false);
    this.nav++;
    this.frame?.remove();
    this.frame = undefined;
    this.shield.hidden = true;
    this.overlay.hidden = true;
  }
  parkPending(): void {
    if (!this.preparingUrl) return;
    const url = this.preparingUrl;
    this.openGeneration++;
    this.preparingUrl = undefined;
    this.parkedNeedsAllow = true;
    this.callbacks.changed(this.index, { url });
    if (!this.addressDirty) this.input.value = url;
  }
  exchangeHiddenHistory(other: Pane): void {
    if (this.frame || other.frame) throw new Error('表示中のペインは移動できません');
    this.parkPending(); other.parkPending();
    this.openGeneration++; other.openGeneration++;
    [this.history, other.history] = [other.history, this.history];
    [this.traverseIndex, other.traverseIndex] = [other.traverseIndex, this.traverseIndex];
    [this.parkedNeedsAllow, other.parkedNeedsAllow] = [other.parkedNeedsAllow, this.parkedNeedsAllow];
  }
  showVisible(): void {
    const { url } = this.callbacks.state(this.index);
    this.updateButtons();
    this.empty.hidden = Boolean(url);
    if (this.preparingUrl) return;
    if (url && !this.frame) {
      if (this.parkedNeedsAllow) { if (!this.preparingUrl) void this.openExplicit(url); }
      else this.navigate(url);
    }
  }
  onCommitted(url: string, forwardBack = false): void {
    if (!isOpenableUrl(url)) return;
    this.windowNavigationGeneration++;
    if (isAuthenticationHost(url) || isNoteLoginPage(url)) { this.showLoginRequired(); return; }
    this.history = paneHistory(this.history, { type: 'commit', url, forwardBack, traverseIndex: this.traverseIndex });
    this.traverseIndex = undefined;
    this.callbacks.changed(this.index, { url });
    if (!this.addressDirty) this.input.value = url;
    this.shield.hidden = true;
    this.overlay.hidden = true;
    this.empty.hidden = true;
    this.updateButtons();
  }
  onCompleted(): void { this.pendingLoad?.(true); }
  onError(url: string, error: string): void {
    if (error === 'net::ERR_ABORTED' || !isOpenableUrl(url)) return;
    this.windowNavigationGeneration++;
    if (isAuthenticationHost(url) || isNoteLoginPage(url)) { this.showLoginRequired(); return; }
    if (error === 'net::ERR_BLOCKED_BY_RESPONSE' && this.serviceWorkerRetryNav !== this.nav && this.callbacks.isAllowed(normalizeHost(url) ?? new URL(url).hostname)) {
      this.retryWithoutServiceWorker(url);
      return;
    }
    this.pendingLoad?.(false);
    this.callbacks.changed(this.index, { url });
    if (!this.addressDirty) this.input.value = url;
    this.empty.hidden = true;
    if (error === 'net::ERR_BLOCKED_BY_RESPONSE') {
      const host = normalizeHost(url) ?? new URL(url).hostname;
      const allowed = this.callbacks.isAllowed(host);
      const actions: Array<{ label: string; action: () => void }> = [];
      if (!allowed && normalizeHost(url)) actions.push({ label: text.allow, action: () => { void this.openExplicit(url); } });
      actions.push({ label: text.openTab, action: () => this.openInTab() });
      this.showMessage(allowed ? text.blockedAllowed(host) : text.blocked(host), actions);
    } else {
      const actions = [
        { label: text.retry, action: () => this.reload() },
        { label: text.openTab, action: () => this.openInTab() },
      ];
      const search = error === 'net::ERR_NAME_NOT_RESOLVED' ? googleHostnameSearchUrl(url) : null;
      if (search) actions.push({ label: text.searchGoogle, action: () => { this.callbacks.select(this.index); void this.openExplicit(search); } });
      this.showMessage(text.failed(error), actions);
    }
  }
  // An allowed site still blocked was most likely answered by its service worker; remove it and load once more.
  private retryWithoutServiceWorker(url: string): void {
    const nav = this.nav;
    const traverseIndex = this.traverseIndex;
    this.serviceWorkerRetryNav = nav + 1;
    void this.callbacks.clearServiceWorker(url).catch(() => false).then(cleared => {
      if (this.nav !== nav) return;
      if (!cleared) { this.serviceWorkerRetryNav = nav; this.onError(url, 'net::ERR_BLOCKED_BY_RESPONSE'); return; }
      const pending = this.pendingLoad;
      this.pendingLoad = undefined;
      this.navigate(url, traverseIndex);
      this.pendingLoad = pending;
    });
  }
  private showInputError(input = ''): void {
    this.suggestions.close();
    this.openGeneration++;
    this.preparingUrl = undefined;
    const search = googleSearchUrl(input);
    const actions: Array<{ label: string; action: () => void }> = [];
    if (search) actions.push({ label: text.searchGoogle, action: () => {
      this.callbacks.select(this.index); void this.openExplicit(search);
    } });
    actions.push({ label: text.backToPage, action: () => this.dismissInputError() });
    this.showMessage(lacksDomain(input) ? text.needsDomain : text.invalidUrl, actions);
    this.input.setAttribute('aria-invalid', 'true');
    this.input.focus();
  }
  private dismissInputError(): void {
    this.addressDirty = false; this.suggestions.close();
    this.overlay.hidden = true;
    this.input.value = this.callbacks.state(this.index).url;
    this.input.removeAttribute('aria-invalid');
  }
  private showLoginRequired(): void {
    this.pendingLoad?.(false);
    this.shield.hidden = true;
    this.showMessage('このページは分割画面で表示できません。', []);
  }
  private showMessage(message: string, actions: Array<{ label: string; action: () => void }>): void {
    this.overlay.replaceChildren();
    const card = document.createElement('div');
    card.className = 'message-card';
    const p = document.createElement('p');
    p.textContent = message;
    card.append(p);
    for (const { label, action } of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', action);
      card.append(button);
    }
    this.overlay.append(card);
    this.overlay.hidden = false;
  }
  private go(delta: number): void {
    this.addressDirty = false; this.suggestions.close();
    const index = this.history.index + delta;
    const url = this.history.entries[index];
    if (url) { this.openGeneration++; this.preparingUrl = undefined; this.parkedNeedsAllow = false; this.navigate(url, index); }
  }
  private reload(): void {
    this.addressDirty = false; this.suggestions.close();
    const url = this.callbacks.state(this.index).url;
    if (url && this.parkedNeedsAllow) { void this.openExplicit(url); return; }
    if (url) { this.openGeneration++; this.preparingUrl = undefined; this.navigate(url, this.history.index >= 0 ? this.history.index : undefined); }
  }
  private openInTab(): void {
    const url = this.callbacks.state(this.index).url;
    if (isOpenableUrl(url)) void chrome.tabs.create({ url });
  }
  private async moveToWindow(): Promise<void> {
    const url = this.callbacks.state(this.index).url;
    if (this.openingWindow || !isOpenableUrl(url)) return;
    const nav = this.nav;
    const generation = this.openGeneration;
    const navigationGeneration = this.windowNavigationGeneration;
    this.openingWindow = true;
    this.windowError.hidden = true;
    this.updateButtons();
    try {
      const current = await chrome.tabs.getCurrent();
      if (current?.windowId === undefined) throw new Error('Current window unavailable');
      const created = await chrome.tabs.create({ url, windowId: current.windowId, index: current.index + 1, active: false });
      if (created?.id === undefined) throw new Error('Tab creation failed');
    } catch {
      if (this.nav === nav && this.openGeneration === generation && this.windowNavigationGeneration === navigationGeneration && this.callbacks.state(this.index).url === url) this.windowError.hidden = false;
    } finally {
      this.openingWindow = false;
      this.updateButtons();
    }
  }
  clear(): void {
    this.windowError.hidden = true;
    this.addressDirty = false; this.suggestions.close();
    this.openGeneration++;
    this.preparingUrl = undefined;
    this.parkedNeedsAllow = false;
    this.destroyFrame();
    this.history = emptyHistory();
    this.callbacks.changed(this.index, { url: '' });
    this.input.removeAttribute('aria-invalid');
    this.empty.hidden = false;
    this.updateButtons();
  }
}
