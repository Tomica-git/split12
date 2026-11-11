import { test as base, expect, openUrl, pane, launch } from './fixtures';
import type { BrowserContext } from '@playwright/test';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const origin = 'https://x.com';
const fixtureUrl = `${origin}/split8-fixture`;
const test = base.extend({
  context: async ({ profile }, use) => {
    const keyPath = join(profile, 'test-key.pem');
    const certPath = join(profile, 'test-cert.pem');
    await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=x.com', '-days', '1']);
    const server = https.createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (request, response) => {
      if (new URL(request.url!, origin).pathname.startsWith('/i/api/')) {
        const cookie = request.headers.cookie?.match(/(?:^|;\s*)ct0=([^;]*)/)?.[1];
        const ok = Boolean(cookie && request.headers['x-csrf-token'] === cookie);
        response.writeHead(ok ? 200 : 403, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok, code: ok ? 0 : 353 })); return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<!doctype html><nav>Navigation</nav><main data-testid="posts">loading</main><button id="retry">Retry</button><script>
        function loadPosts() {
          document.querySelector('main').textContent = 'loading';
          const token = document.cookie.match(/(?:^|;\\s*)ct0=([^;]*)/)?.[1] ?? '';
          document.body.dataset.csrfVisibleAtRequest = String(Boolean(token));
          if (${new URL(request.url!, origin).searchParams.get('transport') === 'xhr'}) {
            const xhr = new XMLHttpRequest(); xhr.open('GET', '/i/api/fixture-posts'); xhr.setRequestHeader('x-csrf-token', token);
            xhr.onload = () => { document.querySelector('main').textContent = xhr.status === 200 ? 'posts-loaded' : 'retry-error'; };
            xhr.send(); return;
          }
          fetch('/i/api/fixture-posts', {headers: {'x-csrf-token': token}}).then(response => {
            document.querySelector('main').textContent = response.ok ? 'posts-loaded' : 'retry-error';
          });
        }
        document.querySelector('#retry').onclick = loadPosts;
        loadPosts();
      </script>`);
    });
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
    const port = (server.address() as { port: number }).port;
    const context = await launch(profile, { resolver: `MAP x.com 127.0.0.1:${port}, MAP *.test 127.0.0.1`, testTls: true });
    try { await use(context); } finally { await context.close(); server.close(); }
  },
});

async function fixture(context: BrowserContext): Promise<void> {
  // The browser resolves x.com to this test's loopback TLS server. The real site is never contacted.
  await context.addCookies([{ name: 'ct0', value: 'fixture-csrf-one', url: origin, secure: true, httpOnly: false, sameSite: 'Lax' }]);
}

test('R-06 X のペインで初回から CSRF Cookie に対応した API 取得が成功する', async ({ split, context, sw }) => {
  await fixture(context);
  await openUrl(split, 0, fixtureUrl);
  try {
    await expect(pane(split, 0).frameLocator('iframe').getByTestId('posts')).toHaveText('posts-loaded');
  } catch (error) {
    // Fixture-only metadata: never log a Cookie value or request headers.
    console.log('fixture-state', await pane(split, 0).frameLocator('iframe').locator('body').evaluate(() => ({
      ownCookieGetter: Object.hasOwn(document, 'cookie'),
      bridgePresent: typeof (globalThis as unknown as Record<symbol, unknown>)[Symbol.for('split8.x-csrf')] === 'function',
      ancestors: [...location.ancestorOrigins],
    })));
    console.log('fixture-worker', await sw.evaluate(async () => ({
      cookiePresent: Boolean(await chrome.cookies.get({ url: 'https://x.com/', name: 'ct0' })),
      allowed: (await chrome.storage.local.get('allowlist')).allowlist,
    })));
    throw error;
  }
});

test('S-01 X の通常タブでは Cookie の読み取りを変更しない', async ({ context }) => {
  await fixture(context);
  const page = await context.newPage();
  await page.goto(fixtureUrl);
  await expect(page.getByTestId('posts')).toHaveText('posts-loaded');
  expect(await page.evaluate(() => Object.hasOwn(document, 'cookie'))).toBe(false);
  expect(await page.evaluate(() => [fetch, XMLHttpRequest.prototype.open, XMLHttpRequest.prototype.send].every(fn => Function.prototype.toString.call(fn).includes('[native code]')))).toBe(true);
});

test('R-06 X の非同期 XHR も最初の取得から成功する', async ({ split, context }) => {
  await fixture(context);
  await openUrl(split, 0, `${fixtureUrl}?transport=xhr`);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('posts')).toHaveText('posts-loaded');
});

test('S-02 X の許可を取り消すと補完を解除し API も認証失敗へ戻る', async ({ split, context, sw }) => {
  await fixture(context);
  await openUrl(split, 0, fixtureUrl);
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('posts')).toHaveText('posts-loaded');
  await split.evaluate(() => chrome.runtime.sendMessage({ type: 'allowlist/remove', hosts: ['x.com'] }));
  await expect.poll(() => frame.locator('body').evaluate(() => Object.hasOwn(document, 'cookie'))).toBe(false);
  const retry = frame.getByRole('button', { name: 'Retry' });
  // A freshly loaded cross-origin iframe can initially receive mouse movement at
  // its parent. Move out and back until Chromium confirms the child is hovered.
  await expect.poll(async () => {
    await split.mouse.move(1, 1);
    await retry.hover();
    return retry.evaluate(element => element.matches(':hover'));
  }, { timeout: 5000, intervals: [50, 100, 250] }).toBe(true);
  await retry.click();
  await expect(frame.getByTestId('posts')).toHaveText('retry-error');
  const rules = await sw.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  expect(rules).toEqual([]);
});

test('R-06 X の CSRF Cookie が更新されても次の取得が成功し HttpOnly は公開しない', async ({ split, context }) => {
  await fixture(context);
  await context.addCookies([{ name: 'auth_token', value: 'fixture-private-cookie', url: origin, secure: true, httpOnly: true, sameSite: 'Lax' }]);
  await openUrl(split, 0, fixtureUrl);
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('posts')).toHaveText('posts-loaded');
  await context.addCookies([{ name: 'ct0', value: 'fixture-csrf-two', url: origin, secure: true, httpOnly: false, sameSite: 'Lax' }]);
  await expect.poll(() => frame.locator('body').evaluate(() => document.cookie.includes('ct0=fixture-csrf-two'))).toBe(true);
  await frame.getByRole('button', { name: 'Retry' }).click();
  await expect(frame.getByTestId('posts')).toHaveText('posts-loaded');
  expect(await frame.locator('body').evaluate(() => document.cookie.split(';').map(part => part.split('=')[0]!.trim()))).not.toContain('auth_token');
});

test('S-02 HttpOnly の ct0 は X 自身の JS にも補完しない', async ({ split, context }) => {
  await fixture(context);
  await context.addCookies([{ name: 'ct0', value: 'fixture-protected-csrf', url: origin, secure: true, httpOnly: true, sameSite: 'Lax' }]);
  await openUrl(split, 0, fixtureUrl);
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('posts')).toHaveText('retry-error');
  expect(await frame.locator('body').evaluate(() => Object.hasOwn(document, 'cookie'))).toBe(false);
});

test('S-02 登録していない拡張ページの X フレームには補完しない', async ({ context, extensionId }) => {
  await fixture(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pane-boot.html`);
  await page.evaluate(url => { const frame = document.createElement('iframe'); frame.src = url; document.body.append(frame); }, fixtureUrl);
  const frame = page.frameLocator('iframe');
  await expect(frame.getByTestId('posts')).toHaveText('retry-error');
  expect(await frame.locator('body').evaluate(() => Object.hasOwn(document, 'cookie'))).toBe(false);
});

test('S-02 X の補完値を他オリジンのリクエストへ付けない', async ({ split, context }) => {
  await fixture(context);
  let csrfHeaderPresent = false;
  await context.route('https://outside.test/**', async route => {
    csrfHeaderPresent ||= Boolean((await route.request().allHeaders())['x-csrf-token']);
    await route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': origin }, body: '{"ok":true}' });
  });
  await openUrl(split, 0, fixtureUrl);
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('posts')).toHaveText('posts-loaded');
  expect(await frame.locator('body').evaluate(async () => (await fetch('https://outside.test/inspect')).ok)).toBe(true);
  expect(csrfHeaderPresent).toBe(false);
});

test('R-06 X の初期処理が Cookie 補完より先でも最初の取得を待ち合わせる', async ({ split, context, sw }) => {
  await fixture(context);
  await sw.evaluate(() => {
    const original = chrome.cookies.get.bind(chrome.cookies);
    chrome.cookies.get = (async (details: chrome.cookies.CookieDetails) => {
      await new Promise(resolve => setTimeout(resolve, 700));
      return original(details);
    }) as typeof chrome.cookies.get;
  });
  await openUrl(split, 0, fixtureUrl);
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('posts')).toHaveText('posts-loaded');
  await expect(frame.locator('body')).toHaveAttribute('data-csrf-visible-at-request', 'false');
});

test('S-02 X ペインの入れ子 iframe 自身の Cookie は補完しない', async ({ split, context }) => {
  await fixture(context);
  await openUrl(split, 0, fixtureUrl);
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('posts')).toHaveText('posts-loaded');
  await frame.locator('body').evaluate((_element, url) => { const child = document.createElement('iframe'); child.src = url; child.title = 'nested'; document.body.append(child); }, fixtureUrl);
  const child = frame.frameLocator('iframe');
  await expect(child.getByTestId('posts')).toHaveText('retry-error');
  expect(await child.locator('body').evaluate(() => Object.hasOwn(document, 'cookie'))).toBe(false);
});

test('S-02 X の Cookie ストアを特定できなければ別ストアを読まない', async ({ split, context, sw }) => {
  await fixture(context);
  await sw.evaluate(() => {
    const state = globalThis as unknown as { fixtureCookieReads: number };
    state.fixtureCookieReads = 0;
    const original = chrome.cookies.get.bind(chrome.cookies);
    chrome.cookies.getAllCookieStores = (async () => []) as typeof chrome.cookies.getAllCookieStores;
    chrome.cookies.get = (async (details: chrome.cookies.CookieDetails) => { state.fixtureCookieReads++; return original(details); }) as typeof chrome.cookies.get;
  });
  await openUrl(split, 0, fixtureUrl);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('posts')).toHaveText('retry-error');
  expect(await sw.evaluate(() => (globalThis as unknown as { fixtureCookieReads: number }).fixtureCookieReads)).toBe(0);
});
