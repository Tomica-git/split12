import { test, expect, openUrl, pane, site, moveIntoFrame } from './fixtures';

test('R-05 認証用の通常タブを分割ペインへ取り込まず維持する', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/auth-link'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('auth-link');
  await moveIntoFrame(split, 0);
  const created = context.waitForEvent('page');
  await pane(split, 0).frameLocator('iframe').getByTestId('auth-tab').click();
  const auth = await created;
  await expect(auth.getByTestId('marker')).toHaveText('authentication');
  await auth.waitForLoadState('networkidle');
  // Let the original background capture path finish, then inspect the saved pane URLs too.
  await expect.poll(async () => {
    await split.evaluate(() => chrome.runtime.sendMessage({ type: 'split/register' }));
    return split.evaluate(async () => {
      const { workspace } = await chrome.storage.local.get('workspace');
      return (workspace as { panes: Array<{ url: string }> }).panes.filter(p => p.url.includes('/oauth/authorize')).length;
    });
  }).toBe(0);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await auth.reload();
  await expect(auth.getByTestId('marker')).toHaveText('authentication');
});

test('R-51 ログイン専用ボタンを削除して他の枠を保持する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/login-page'));
  await openUrl(split, 1, site('b', '/token'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('guest');
  await expect(pane(split, 0).getByRole('button', { name: '通常タブでログイン' })).toHaveCount(0);
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toBeVisible();
});

test('R-05 認証へのリダイレクト先も通常タブに残す', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/auth-link?to=/redirect-to-auth'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('auth-link');
  await moveIntoFrame(split, 0);
  const created = context.waitForEvent('page');
  await pane(split, 0).frameLocator('iframe').getByTestId('auth-tab').click();
  const auth = await created;
  await expect(auth.getByTestId('marker')).toHaveText('authentication');
  await auth.waitForLoadState('networkidle');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  expect(auth.isClosed()).toBe(false);
});

test('R-51 通常の再読み込みはログイン専用操作なしで使える', async ({ split }) => {
  await openUrl(split, 0, site('a', '/login-page'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('guest');
  await pane(split, 0).getByRole('button', { name: '再読み込み', exact: true }).click();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('guest');
  await expect(pane(split, 0).getByRole('button', { name: 'ログイン完了・再読み込み' })).toHaveCount(0);
});

test('R-51 S-02 許可を取り消してもログイン専用ボタンは再表示されない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/login-page'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('guest');
  await split.evaluate(() => chrome.runtime.sendMessage({ type: 'allowlist/remove', hosts: ['a.test'] }));
  await expect(pane(split, 0).getByRole('button', { name: '通常タブでログイン' })).toHaveCount(0);
  await expect(pane(split, 0).getByRole('button', { name: 'ログイン完了・再読み込み' })).toHaveCount(0);
});

test('R-51 廃止した認証要求は新しいページを作らない', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/login-page'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('guest');
  const pages = context.pages().length;
  const result = await split.evaluate(async url => chrome.runtime.sendMessage({ type: 'auth/open', paneId: 0, nav: 1, url }).catch(() => undefined), site('a', '/login-page'));
  expect(result).toBeUndefined();
  expect(context.pages()).toHaveLength(pages);
});

test('R-51 ページ内遷移後も廃止したログイン操作は現れない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/login-page'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('guest');
  await pane(split, 0).frameLocator('iframe').locator('body').evaluate((_element, url) => { location.href = url; }, site('b', '/page2'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(pane(split, 0).getByRole('button', { name: '通常タブでログイン' })).toHaveCount(0);
});
