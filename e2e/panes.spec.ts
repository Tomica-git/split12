import { test, expect, pane, openUrl, site, launch, moveIntoFrame } from './fixtures';

test('R-04 S-06 入力したペインだけ移動し危険な URL を拒否する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(pane(split, 1).locator('.empty')).toBeVisible();
  await openUrl(split, 1, 'javascript:alert(1)');
  await expect(pane(split, 1).getByText('http または https の URL を入力してください')).toBeVisible();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(pane(split, 1).locator('iframe')).toHaveCount(0);
});
test('R-04 スキームの無い1語はドメイン不足として開かない', async ({ split }) => {
  await openUrl(split, 0, 'muse');
  await expect(pane(split, 0).getByText('ドメインまで入力してください（例: example.com）')).toBeVisible();
  await expect(pane(split, 0).locator('iframe')).toHaveCount(0);
});
test('R-12 空のペインに開いているタブを並べ選んだペインで開く', async ({ split, context }) => {
  const source = await context.newPage();
  await source.goto(site('b', '/plain'));
  await split.bringToFront();
  const picker = pane(split, 2).getByRole('list', { name: '開いているタブ' });
  const choice = picker.getByRole('listitem').filter({ hasText: 'b.test' });
  await expect(choice).toHaveCount(1);
  await choice.click();
  await expect(pane(split, 2).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(pane(split, 0).getByRole('list', { name: '開いているタブ' }).getByRole('listitem').filter({ hasText: 'b.test' })).toHaveCount(0);
  await source.close();
});
test('R-12 枚数を減らして隠れたペインの URL でもタブの候補から消さない', async ({ split, context }) => {
  const target = site('b', '/plain');
  await openUrl(split, 3, target);
  await expect(pane(split, 3).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('2'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  const source = await context.newPage();
  await source.goto(target);
  await split.bringToFront();
  await expect(pane(split, 0).getByRole('list', { name: '開いているタブ' }).getByRole('listitem').filter({ hasText: 'b.test' })).toHaveCount(1);
  await pane(split, 0).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '開いているタブから追加' }).click();
  await expect(split.getByRole('dialog').getByText(target)).toBeVisible();
  await source.close();
});
test('R-07 許可済みサイトのサービスワーカーが埋め込みを拒否したら消して読み直す', async ({ split, context }) => {
  const installer = await context.newPage();
  await installer.goto(site('a', '/sw-install'));
  await expect(installer.locator('body')).toHaveAttribute('data-ready', '1');
  await split.bringToFront();
  await openUrl(split, 0, site('a', '/sw-area/page'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('network');
  await expect(pane(split, 0).getByText('許可済みですが表示できませんでした')).toHaveCount(0);
  expect(await installer.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await installer.close();
});
test('S-02 未許可サイトのサービスワーカーは消さない', async ({ split, context, sw }) => {
  const installer = await context.newPage();
  await installer.goto(site('a', '/sw-install'));
  await expect(installer.locator('body')).toHaveAttribute('data-ready', '1');
  const response = await split.evaluate(url => chrome.runtime.sendMessage({ type: 'service-worker/clear', url }), site('a', '/sw-area/page'));
  expect(response).toEqual({ ok: false, reason: 'not-allowed' });
  expect(await installer.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
  void sw;
  await installer.close();
});
test('R-05 片方の履歴だけを戻しもう一方は維持する', async ({ split }) => {
  for (const index of [0, 1]) {
    await openUrl(split, index, site(index ? 'b' : 'a', '/link'));
    const frame = pane(split, index).frameLocator('iframe');
    await expect(frame.getByTestId('marker')).toHaveText('link');
    await expect(pane(split, index).locator('iframe')).toHaveCSS('pointer-events', 'auto');
    await moveIntoFrame(split, index);
    await frame.getByTestId('link').click();
    await expect(frame.getByTestId('marker')).toHaveText('page2');
  }
  await pane(split, 0).getByRole('button', { name: '戻る', exact: true }).click();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('link');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await pane(split, 0).getByRole('button', { name: '進む', exact: true }).click();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
});
test('R-07 未許可の遷移を知らせ許可後に再読み込みする', async ({ split }) => {
  const target = site('b', '/xfo');
  await openUrl(split, 0, site('a', `/link?to=${encodeURIComponent(target)}`));
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(pane(split, 0).locator('iframe')).toHaveCSS('pointer-events', 'auto');
  await moveIntoFrame(split, 0);
  await frame.getByTestId('link').click();
  await expect(pane(split, 0).getByText('b.test は埋め込み表示を拒否しています')).toBeVisible();
  await pane(split, 0).getByRole('button', { name: 'このサイトを許可して再読み込み' }).click();
  await expect(frame.getByTestId('marker')).toHaveText('xfo');
});
test('R-08 接続失敗に再試行と新しいタブを表示する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/drop'));
  await expect(pane(split, 0).getByText('読み込みに失敗しました（net::ERR_EMPTY_RESPONSE）')).toBeVisible();
  await expect(pane(split, 0).getByRole('button', { name: '再試行' })).toBeVisible();
  await expect(pane(split, 0).getByRole('button', { name: '新しいタブで開く' }).last()).toBeVisible();
});
test('R-09 保存状態は更新・タブ再作成・ブラウザ再起動後に復元される', async ({ profile }) => {
  let context = await launch(profile);
  try {
    let sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    let id = new URL(sw.url()).host;
    let split = await context.newPage();
    await split.goto(`chrome-extension://${id}/split.html`);
    await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
    await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('5'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
    await split.getByRole('button', { name: /縦並び/ }).click();
    await openUrl(split, 0, site('a', '/xfo'));
    await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
    await expect.poll(async () => sw.evaluate(async () => {
      const value = await chrome.storage.local.get(['workspace', 'allowlist']);
      const workspace = value.workspace as { count?: number; orientation?: string; panes?: Array<{ url: string }> };
      const allowlist = value.allowlist as { hosts?: string[] };
      return { count: workspace?.count, orientation: workspace?.orientation, url: workspace?.panes?.[0]?.url, hosts: allowlist?.hosts };
    })).toEqual({ count: 5, orientation: 'portrait', url: site('a', '/xfo'), hosts: ['a.test'] });
    await split.reload();
    await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
    await expect(split.getByRole('button', { name: /縦並び/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
    await split.close();
    await expect.poll(async () => sw.evaluate(async () => (await chrome.storage.session.get('splitTabId')).splitTabId)).toBeUndefined();
    await sw.evaluate(() => (globalThis as typeof globalThis & { __split8Test: { openOrFocusSplitView(): Promise<number> } }).__split8Test.openOrFocusSplitView());
    await expect.poll(() => context.pages().find(page => page.url().startsWith(`chrome-extension://${id}/split.html`))?.url()).toBeTruthy();
    split = context.pages().find(page => page.url().startsWith(`chrome-extension://${id}/split.html`))!;
    await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
    await context.close();
    context = await launch(profile);
    sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    id = new URL(sw.url()).host;
    split = await context.newPage();
    await split.goto(`chrome-extension://${id}/split.html`);
    await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
    await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
  } finally { await context.close(); }
});
test('R-10 許可削除後の再読み込みでは再び埋め込みを拒否する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/xfo'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('xfo');
  await split.getByRole('button', { name: '設定' }).click();
  await split.getByRole('button', { name: 'a.test を削除' }).click();
  await expect(split.getByText('許可したサイトはありません。')).toBeVisible();
  await split.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();
  await pane(split, 0).getByRole('button', { name: '再読み込み' }).click();
  await expect(pane(split, 0).getByText('a.test は埋め込み表示を拒否しています')).toBeVisible();
});
test('S-02 未許可の入れ子 iframe の XFO 保護は残る', async ({ split }) => {
  await openUrl(split, 0, site('a', `/nested?child=${encodeURIComponent(site('b', '/xfo'))}`));
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.locator('body')).toHaveAttribute('data-child-loaded', '1');
  await expect(frame.frameLocator('iframe').getByTestId('marker')).toHaveCount(0);
});
test('R-09 レイアウト変更直後に閉じても最後の状態を保存する', async ({ split, context, extensionId, sw }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('7'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.close();
  await expect.poll(async () => sw.evaluate(async () => (await chrome.storage.session.get('splitTabId')).splitTabId)).toBeUndefined();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${extensionId}/split.html`);
  await expect(reopened.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('7');
});
