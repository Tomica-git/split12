// Local-only reproduction: a CSRF cookie reaches the server but is hidden from iframe JavaScript.
import { chromium } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const observations = [];
const csrfValue = 'split8-fixture-token';
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture.test');
  if (url.pathname === '/csrf-api') {
    const cookiePresent = (request.headers.cookie ?? '').split(';').some(part => part.trim() === `ct0=${csrfValue}`);
    const headerMatches = request.headers['x-csrf-token'] === csrfValue;
    const status = cookiePresent && headerMatches ? 200 : 403;
    observations.push({ context: url.searchParams.get('context'), cookiePresent, headerMatches, status });
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: status === 200, code: status === 200 ? 0 : 353 }));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html><nav>Navigation is visible</nav><main data-testid="status">loading</main>
<script>
const csrf = document.cookie.match(/(?:^|;\\s*)ct0=([^;]*)/)?.[1] ?? '';
document.body.dataset.jsCookieVisible = String(Boolean(csrf));
fetch('/csrf-api?context=' + (self === top ? 'top-level' : 'split-frame'), {headers: {'x-csrf-token': csrf}})
  .then(response => {document.querySelector('main').textContent = response.ok ? 'posts-loaded' : 'retry-error';});
</script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://a.test:${server.address().port}/cookie-page`;
const profile = await mkdtemp(join(tmpdir(), 'split8-csrf-probe-'));
let context;
try {
  const dist = resolve('dist');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--host-resolver-rules=MAP *.test 127.0.0.1', '--no-proxy-server'],
  });
  await context.addCookies([{ name: 'ct0', value: csrfValue, url, sameSite: 'Lax' }]);
  const top = await context.newPage();
  await top.goto(url);
  await top.getByTestId('status').filter({ hasText: 'posts-loaded' }).waitFor();
  const topCookieVisible = await top.locator('body').getAttribute('data-js-cookie-visible');
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const split = await context.newPage();
  await split.goto(`chrome-extension://${extensionId}/split.html`);
  const address = split.locator('.pane[data-index="0"]').getByRole('textbox', { name: 'アドレス' });
  await address.fill(url);
  await address.press('Enter');
  const frame = split.locator('.pane[data-index="0"]').frameLocator('iframe');
  await frame.getByTestId('status').filter({ hasText: 'retry-error' }).waitFor();
  const frameCookieVisible = await frame.locator('body').getAttribute('data-js-cookie-visible');
  console.log(JSON.stringify({ topCookieVisible, frameCookieVisible, observations }, null, 2));
} finally {
  if (context) await context.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
