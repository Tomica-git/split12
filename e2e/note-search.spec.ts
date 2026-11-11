import { test as base, expect, openUrl, pane, site, moveIntoFrame } from './fixtures';
import { localTlsContext } from './fixtures/tls';

const test = base.extend({
  context: async ({ profile }, use) => {
    const fixture = await localTlsContext(profile, ['note.com', 'www.google.com'], (request, response) => {
      response.setHeader('Content-Type', 'text/html');
      if (request.headers.host === 'www.google.com') { response.end('<main>search-fixture</main>'); return; }
      const path = new URL(request.url!, 'https://note.com').pathname;
      const signedIn = path === '/fixture-complete' || request.headers.cookie?.includes('fixture_note_session=complete');
      if (path === '/fixture-complete') response.setHeader('Set-Cookie', 'fixture_note_session=complete; Path=/; Secure; HttpOnly; SameSite=Lax');
      const marker = path === '/login' ? 'note-login' : path === '/' ? 'note-home' : signedIn ? 'note-signed-in' : 'note-article';
      response.end(`<main data-testid="marker">${marker}</main><a data-testid="login" href="/login">ログイン</a><a data-testid="complete" href="/fixture-complete">ログイン完了</a>`);
    });
    try { await use(fixture.context); } finally { await fixture.close(); }
  },
});

// R-22 explicitly replaces the old normal-tab search contract. Preserve the original page until confirmation,
// then verify same-pane search, no new tab, and the original page's history rather than skipping this scenario.
test('R-04 R-22 ドメインでない入力を同じ枠でGoogle検索し元ページへ戻れる', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await openUrl(split, 0, 'Gmail');
  const search = pane(split, 0).getByRole('button', { name: 'Google で検索', exact: true });
  await expect(search).toBeVisible();
  const pages = context.pages().length;
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await search.click();
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue('https://www.google.com/search?q=Gmail');
  await expect(pane(split, 0).frameLocator('iframe').getByText('search-fixture')).toBeVisible();
  expect(context.pages()).toHaveLength(pages);
  await expect(pane(split, 0).locator('.overlay')).not.toBeVisible();
  await pane(split, 0).getByRole('button', { name: '戻る', exact: true }).click();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});

test('R-04 S-06 入力エラーを閉じれば表示中のログイン画面を操作できる', async ({ split }) => {
  await openUrl(split, 0, site('a', '/login-page'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('guest');
  await openUrl(split, 0, 'javascript:alert(1)');
  await expect(pane(split, 0).getByRole('button', { name: 'Google で検索' })).toHaveCount(0);
  const back = pane(split, 0).getByRole('button', { name: '現在のページに戻る' });
  await expect(back).toBeVisible();
  await back.click();
  await moveIntoFrame(split, 0);
  await pane(split, 0).frameLocator('iframe').getByTestId('login').click();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('authentication');
});

test('R-08 DNS で見つからないドメインはホスト名だけを Google 検索できる', async ({ split, context }) => {
  await context.route('http://not-resolved.test/**', route => route.abort('namenotresolved'));
  await openUrl(split, 0, 'http://not-resolved.test/path?token=fixture-private');
  const search = pane(split, 0).getByRole('button', { name: 'Google で検索', exact: true });
  await expect(search).toBeVisible();
  const pages = context.pages().length;
  await search.click();
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue('https://www.google.com/search?q=not-resolved.test');
  await expect(pane(split, 0).frameLocator('iframe').getByText('search-fixture')).toBeVisible();
  expect(context.pages()).toHaveLength(pages);
});

test('R-51 note の記事ではログイン専用ボタンを表示しない', async ({ split }) => {
  const article = 'https://note.com/fixture/n/article';
  await openUrl(split, 0, article);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('note-article');
  await expect(pane(split, 0).getByRole('button', { name: '通常タブでログイン' })).toHaveCount(0);
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(article);
});

test('R-51 note 内のログインページは専用ログインボタンなしで案内する', async ({ split }) => {
  const article = 'https://note.com/fixture/n/article';
  await openUrl(split, 0, article);
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('note-article');
  await moveIntoFrame(split, 0);
  await pane(split, 0).frameLocator('iframe').getByTestId('login').click();
  await expect(pane(split, 0).locator('.overlay')).toContainText('このページは分割画面で表示できません。');
  await expect(pane(split, 0).getByRole('button', { name: '通常タブでログイン' })).toHaveCount(0);
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(article);
});

test('R-51 note ログインURLを開いても専用ログイン処理を開始しない', async ({ split, context }) => {
  const pages = context.pages().length;
  await openUrl(split, 0, 'https://note.com/login');
  await expect(pane(split, 0).locator('.overlay')).toContainText('このページは分割画面で表示できません。');
  await expect(pane(split, 0).getByRole('button', { name: '通常タブでログイン' })).toHaveCount(0);
  expect(context.pages()).toHaveLength(pages);
});
