import http from 'node:http';
import { randomUUID } from 'node:crypto';

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.test');
  if (url.pathname === '/auth-complete') {
    res.writeHead(302, { 'Set-Cookie': 'fixture_login=yes; Path=/; SameSite=Lax', Location: '/login-page' });
    res.end(); return;
  }
  if (url.pathname === '/redirect-to-auth') { res.writeHead(302, { Location: '/oauth/authorize' }); res.end(); return; }
  if (url.pathname === '/drop') { req.socket.destroy(); return; }
  if (url.pathname === '/slow') {
    setTimeout(() => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<div data-testid="marker">slow</div>'); }, 1500);
    return;
  }
  if (url.pathname === '/sw-xfo.js') {
    // Stands in for a site worker that serves navigations itself, keeping the embedding refusal.
    res.setHeader('Content-Type', 'text/javascript');
    res.end(`self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') event.respondWith(new Response('<div data-testid="marker">from-sw</div>', { headers: { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' } }));
});`);
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  let body = '<div data-testid="marker">plain</div>';
  if (url.pathname === '/xfo') { res.setHeader('X-Frame-Options', 'DENY'); body = '<div data-testid="marker">xfo</div>'; }
  if (url.pathname === '/csp-fa') { res.setHeader('Content-Security-Policy', "frame-ancestors 'none'"); body = '<div data-testid="marker">csp-fa</div>'; }
  if (url.pathname === '/csp-other') { res.setHeader('Content-Security-Policy', "script-src 'none'"); body = '<div data-testid="marker">blocked</div><script>document.querySelector(\'[data-testid=marker]\').textContent=\'executed\'</script>'; }
  if (url.pathname === '/token') body = `<div data-testid="token">${randomUUID()}</div>`;
  if (url.pathname === '/sw-install') body = `<div data-testid="marker">sw-install</div><script>navigator.serviceWorker.register('/sw-xfo.js', { scope: '/sw-area/' }).then(async registration => { while (!registration.active) await new Promise(resolve => setTimeout(resolve, 50)); document.body.dataset.ready = '1'; }, error => { document.body.dataset.ready = String(error); });</script>`;
  if (url.pathname === '/sw-area/page') { res.setHeader('X-Frame-Options', 'DENY'); body = '<div data-testid="marker">network</div>'; }
  if (url.pathname === '/page2') body = '<div data-testid="marker">page2</div>';
  if (url.pathname === '/login-page') body = req.headers.cookie?.includes('fixture_login=yes')
    ? '<div data-testid="marker">logged-in</div>'
    : '<div data-testid="marker">guest</div><a href="/oauth/authorize" data-testid="login">ログインへ</a>';
  if (url.pathname === '/oauth/authorize') body = '<div data-testid="marker">authentication</div><a href="/auth-complete" data-testid="complete">ログインを完了する</a>';
  if (url.pathname === '/auth-link') body = `<div data-testid="marker">auth-link</div><a href="${escape(url.searchParams.get('to') ?? '/oauth/authorize')}" target="_blank" data-testid="auth-tab">認証タブを開く</a>`;
  if (url.pathname === '/link') body = `<div data-testid="marker">link</div><a data-testid="link" ${url.searchParams.get('new') === '1' ? 'target="_blank"' : ''} href="${escape(url.searchParams.get('to') ?? '/page2')}">${url.searchParams.get('img') === '1' ? '<img data-testid="link-image" alt="画像リンク" width="120" height="60" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==">' : '次へ'}</a>${url.searchParams.get('stop') === '1' ? '<script>for (const type of ["dragstart", "dragend", "dragenter"]) document.body.addEventListener(type, event => event.stopPropagation());</script>' : ''}`;
  if (url.pathname === '/stop-capture') body = `<button data-testid="marker">page</button><script>window.addEventListener('pointerdown', event => event.stopImmediatePropagation(), true); window.addEventListener('keydown', event => event.stopImmediatePropagation(), true);</script>`;
  if (url.pathname === '/popup') body = `<div data-testid="marker">popup</div><button data-testid="popup" onclick="window.open('/page2', 'auth', 'width=400,height=400')">別ウィンドウ</button>`;
  if (url.pathname === '/frame' || url.pathname === '/nested') {
    const src = escape(url.searchParams.get('src') ?? url.searchParams.get('child') ?? '/plain');
    const source = url.searchParams.has('srcdoc') ? `srcdoc="${escape(url.searchParams.get('srcdoc'))}"` : `src="${src}"`;
    body = `<div data-testid="marker">parent</div><iframe title="child" ${url.searchParams.get('sandbox') === '1' ? 'sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"' : ''} ${source} onload="document.body.dataset.childLoaded='1'"></iframe>`;
  }
  if (url.pathname === '/bust') {
    body = `<div data-testid="marker">bust</div>
      <script>try { top.location.href='/page2'; } catch (_) {}</script>
      <button data-testid="bust-button" onclick="try { top.location.href='/page2'; } catch (_) {}">上を書き換え</button>
      <a data-testid="bust-link" href="/page2" target="_top">上を開く</a>`;
  }
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Fixture ${escape(url.pathname)}</title></head><body>${body}</body></html>`);
});
server.listen(4178, '127.0.0.1');
