import { test, expect, openSessions, openUrl, pane, site } from './fixtures';

const rowsOf = (split: import('@playwright/test').Page) => split.getByRole('complementary', { name: 'セッション' }).locator('.view-choice');

// R-93: views switch in this same tab, and an empty view left behind is removed (R-90), so each view gets a page.
async function addViewWithPage(split: import('@playwright/test').Page, number: number): Promise<void> {
  await split.getByRole('complementary', { name: 'セッション' }).getByRole('button', { name: '新しいビュー', exact: true }).click();
  await expect(split).toHaveTitle(new RegExp(`ビュー ${number} - Split12`));
  await openUrl(split, 0, site('a', `/plain?view-${number}`));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
}

test('R-81 R-93 セッションをダブルクリックすると同じタブで開き、名前変更はF2と右クリックに残る', async ({ split, context }) => {
  await openSessions(split);
  await openUrl(split, 0, site('a', '/plain?view-1'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const first = split.url();
  await addViewWithPage(split, 2);
  await expect(rowsOf(split)).toHaveCount(2);
  const pages = context.pages().length;
  await rowsOf(split).first().dblclick();
  await expect(split).toHaveURL(first);
  await expect(split).toHaveTitle(/ビュー 1 - Split12/);
  expect(context.pages()).toHaveLength(pages);
  await rowsOf(split).first().focus();
  await rowsOf(split).first().press('F2');
  await expect(split.getByRole('dialog', { name: 'ビューの名前を変更' })).toBeVisible();
  await split.getByRole('dialog', { name: 'ビューの名前を変更' }).getByRole('button', { name: 'キャンセル' }).click();
  await expect(rowsOf(split)).toHaveCount(2);
});

test('R-81 編集モードで複数のビューを選んで削除できる', async ({ split }) => {
  await openSessions(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  await openUrl(split, 0, site('a', '/plain?view-1'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await addViewWithPage(split, 2);
  await addViewWithPage(split, 3);
  await expect(rowsOf(split)).toHaveCount(3);
  await expect(side.locator('.sidebar-actions button')).toHaveText(['✏️命名', '❌削除', '➕追加', '📖編集']);
  await side.getByRole('button', { name: '一覧を編集' }).click();
  await expect(side.getByRole('button', { name: '一覧を編集' })).toHaveAttribute('aria-pressed', 'true');
  const remove = side.getByRole('button', { name: '選択を削除' });
  await expect(remove).toBeDisabled();
  await side.getByRole('checkbox', { name: 'ビュー 1 を選択' }).check();
  await side.getByRole('checkbox', { name: 'ビュー 2 を選択' }).check();
  await expect(side.locator('.sidebar-edit-count')).toHaveText('2件選択');
  await remove.click();
  const dialog = split.getByRole('dialog', { name: 'ビューをまとめて削除' });
  await expect(dialog).toContainText('2 件');
  await dialog.getByRole('button', { name: '削除する' }).click();
  await expect(rowsOf(split)).toHaveCount(1);
  await expect(rowsOf(split).first()).toContainText('ビュー 3');
  await expect.poll(async () => (await split.evaluate(async () => (await chrome.storage.local.get('viewRegistry')).viewRegistry as { views: unknown[] })).views.length).toBe(1);
  await side.getByRole('button', { name: '一覧を編集' }).click();
  await expect(side.locator('.view-select')).toHaveCount(0);
});

test('R-81 編集モードで並べ替えると順番が保存され、再読み込み後も保つ', async ({ split }) => {
  await openSessions(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  await openUrl(split, 0, site('a', '/plain?view-1'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await addViewWithPage(split, 2);
  await addViewWithPage(split, 3);
  await expect(rowsOf(split)).toHaveText([/ビュー 1/, /ビュー 2/, /ビュー 3/]);
  await side.getByRole('button', { name: '一覧を編集' }).click();
  // R-97: the ▲▼ buttons were removed; the ☰ handle still moves a view in between (insert), as ▲▼ did one step at a time.
  await expect(side.locator('.view-move')).toHaveCount(0);
  const rowByTitle = (title: string) => side.locator('.view-row').filter({ hasText: title });
  await side.getByRole('button', { name: 'ビュー 3 を移動' }).dragTo(rowByTitle('ビュー 2'));
  await expect(rowsOf(split)).toHaveText([/ビュー 1/, /ビュー 3/, /ビュー 2/]);
  await side.getByRole('button', { name: 'ビュー 1 を移動' }).dragTo(rowByTitle('ビュー 2'));
  await expect(rowsOf(split)).toHaveText([/ビュー 3/, /ビュー 1/, /ビュー 2/]);
  await expect.poll(async () => (await split.evaluate(async () => (await chrome.storage.local.get('viewRegistry')).viewRegistry as { views: Array<{ title: string }> })).views.map(view => view.title)).toEqual(['ビュー 3', 'ビュー 1', 'ビュー 2']);
  await split.reload();
  // The saved sidebar state reopens the list by itself; clicking the toggle too early would close it again.
  await expect(split.getByRole('complementary', { name: 'セッション' })).toBeVisible();
  await expect(rowsOf(split)).toHaveText([/ビュー 3/, /ビュー 1/, /ビュー 2/]);
});

test('R-81 ドラッグ診断は既定で表示されず、設定で表示できる', async ({ split, context }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const divider = (await split.locator('.split-divider').first().boundingBox())!;
  const x = divider.x + divider.width * (divider.width > divider.height ? .25 : .5), y = divider.y + divider.height * (divider.height > divider.width ? .25 : .5);
  const cdp = await context.newCDPSession(split);
  const data = { items: [{ mimeType: 'text/uri-list', data: site('b', '/page2') }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data });
  await cdp.detach();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
  await expect(split.locator('.drag-diagnostic')).toBeHidden();
  await split.getByRole('button', { name: '設定', exact: true }).click();
  const toggle = split.getByRole('dialog', { name: '埋め込み許可リスト' }).getByRole('checkbox', { name: 'ドラッグ診断を左下に表示する' });
  await toggle.check();
  await expect(split.locator('.drag-diagnostic')).toBeVisible();
  await expect(split.locator('.drag-diagnostic')).toContainText('追加');
  await toggle.uncheck();
  await expect(split.locator('.drag-diagnostic')).toBeHidden();
});
