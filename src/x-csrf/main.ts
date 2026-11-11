// document_start: pair with the isolated bootstrap before the site's first inline API request.
let installed = false;
function bootstrap(): void {
  if (installed) return;
  const marker = [...document.childNodes].find(node => node.nodeType === Node.COMMENT_NODE && node.nodeValue?.startsWith('split8-x-origin:'));
  const owner = marker?.nodeValue?.slice('split8-x-origin:'.length);
  marker?.remove();
  if (location.origin === 'https://x.com' && self !== top && parent === top && location.ancestorOrigins.length === 1 && typeof owner === 'string' && owner === location.ancestorOrigins[0] && /^chrome-extension:\/\/[a-p]{32}$/.test(owner)) { installed = true; install(); }
}
document.addEventListener('split8-x-bootstrap', bootstrap);
bootstrap();

function install(): void {
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (!cookie?.get || !cookie.set) return;
  const nativeGet = cookie.get;
  const nativeSet = cookie.set;
  const nativeFetch = window.fetch;
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeHeader = XMLHttpRequest.prototype.setRequestHeader;
  const nativeSend = XMLHttpRequest.prototype.send;
  const nativeAbort = XMLHttpRequest.prototype.abort;
  let token = '';
  let settled = false;
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const requests = new WeakMap<XMLHttpRequest, { api: boolean; async: boolean; headers: string[]; queued: boolean; cancelled: boolean }>();
  const apiUrl = (value: string | URL): boolean => {
    try { const url = new URL(value, location.href); return url.origin === 'https://x.com' && url.pathname.startsWith('/i/api/'); } catch { return false; }
  };
  function getCookie(): string {
    const value = nativeGet.call(document) as string;
    return !token || /(?:^|;\s*)ct0=/.test(value) ? value : `${value}${value ? '; ' : ''}ct0=${token}`;
  }
  function setCookie(value: string): void { nativeSet.call(document, value); }
  const wrappedFetch: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input;
    if (!apiUrl(url)) return nativeFetch.call(window, input, init);
    return ready.then(() => {
      if (!token) return nativeFetch.call(window, input, init);
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set('x-csrf-token', token);
      return nativeFetch.call(window, input, { ...init, headers });
    });
  };
  const wrappedOpen: typeof XMLHttpRequest.prototype.open = function(this: XMLHttpRequest, method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null): void {
    requests.set(this, { api: apiUrl(url), async, headers: [], queued: false, cancelled: false });
    Reflect.apply(nativeOpen, this, Array.from(arguments));
  };
  const wrappedHeader: typeof XMLHttpRequest.prototype.setRequestHeader = function(this: XMLHttpRequest, name: string, value: string): void {
    const request = requests.get(this);
    if (request?.api && request.async && name.toLowerCase() === 'x-csrf-token') { request.headers.push(value); return; }
    nativeHeader.call(this, name, value);
  };
  const wrappedSend: typeof XMLHttpRequest.prototype.send = function(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    const request = requests.get(this);
    if (!request?.api || !request.async) { nativeSend.call(this, body); return; }
    if (request.queued) throw new DOMException('The request has already been sent.', 'InvalidStateError');
    request.queued = true;
    const send = () => {
      if (request.cancelled || requests.get(this) !== request || this.readyState !== XMLHttpRequest.OPENED) return;
      if (token) nativeHeader.call(this, 'x-csrf-token', token);
      else for (const value of request.headers) nativeHeader.call(this, 'x-csrf-token', value);
      nativeSend.call(this, body);
    };
    if (settled) send(); else void ready.then(send);
  };
  const wrappedAbort: typeof XMLHttpRequest.prototype.abort = function(this: XMLHttpRequest): void {
    const request = requests.get(this);
    if (request) request.cancelled = true;
    nativeAbort.call(this);
  };
  function enable(): void {
    if (window.fetch === nativeFetch) window.fetch = wrappedFetch;
    if (XMLHttpRequest.prototype.open === nativeOpen) XMLHttpRequest.prototype.open = wrappedOpen;
    if (XMLHttpRequest.prototype.setRequestHeader === nativeHeader) XMLHttpRequest.prototype.setRequestHeader = wrappedHeader;
    if (XMLHttpRequest.prototype.send === nativeSend) XMLHttpRequest.prototype.send = wrappedSend;
    if (XMLHttpRequest.prototype.abort === nativeAbort) XMLHttpRequest.prototype.abort = wrappedAbort;
  }
  function update(value: string | null): void {
    token = typeof value === 'string' && value.length <= 4096 && !/[;\r\n]/.test(value) ? value : '';
    settled = true;
    clearTimeout(timeout);
    if (token) {
      enable();
      try { Object.defineProperty(document, 'cookie', { configurable: true, get: getCookie, set: setCookie }); } catch { /* API headers still use the validated token. */ }
    } else {
      if (Object.getOwnPropertyDescriptor(document, 'cookie')?.get === getCookie) Reflect.deleteProperty(document, 'cookie');
      if (window.fetch === wrappedFetch) window.fetch = nativeFetch;
      if (XMLHttpRequest.prototype.open === wrappedOpen) XMLHttpRequest.prototype.open = nativeOpen;
      if (XMLHttpRequest.prototype.setRequestHeader === wrappedHeader) XMLHttpRequest.prototype.setRequestHeader = nativeHeader;
      if (XMLHttpRequest.prototype.send === wrappedSend) XMLHttpRequest.prototype.send = nativeSend;
      if (XMLHttpRequest.prototype.abort === wrappedAbort) XMLHttpRequest.prototype.abort = nativeAbort;
    }
    release();
  }
  Object.defineProperty(globalThis, Symbol.for('split8.x-csrf'), { configurable: true, value: update });
  document.addEventListener('split8-x-disabled', () => update(null));
  const timeout = setTimeout(() => update(null), 2500);
  enable();
}
export {};
