import { test, expect, openSessions, openUrl, pane, site } from './fixtures';

test('R-61 一覧に番号とURLを表示しダブルクリックで対象を最大化する', async ({ split }) => {
  const url = site('a', '/plain?list=1');
  await openUrl(split, 1, url);
  await split.getByRole('button', { name: '一覧', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'タブ一覧' });
  const rows = dialog.getByRole('listitem');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText(url);
  await rows.nth(1).locator('.pane-list-info').dblclick();
  await expect(dialog).toBeHidden();
  await expect(pane(split, 1).locator('.pane-number')).toHaveAttribute('aria-label', /元に戻す/);
  await expect(pane(split, 0)).toHaveClass(/max-hidden/);
  await split.keyboard.press('Escape');
  await expect(pane(split, 0)).not.toHaveClass(/max-hidden/);
});

test('R-61 一覧から対象の枠を閉じ他の枠を保持する', async ({ split }) => {
  await openUrl(split, 1, site('a', '/plain?keep=1'));
  await split.getByRole('button', { name: '一覧', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'タブ一覧' });
  await dialog.getByRole('button', { name: 'タブ 1 を閉じる' }).click();
  await expect(dialog.getByRole('listitem')).toHaveCount(3);
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(site('a', '/plain?keep=1'));
});

test('R-62 セッションの右クリックから一覧、名前変更、削除を選べる', async ({ split }) => {
  await openSessions(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  const row = side.locator('.view-choice').first();
  await row.click({ button: 'right' });
  const menu = split.getByRole('menu', { name: 'ビューの操作' });
  await expect(menu.getByRole('menuitem')).toHaveText(['一覧', '名前変更', '削除']);
  await menu.getByRole('menuitem', { name: '一覧' }).click();
  await expect(split.getByRole('dialog', { name: 'タブ一覧' }).getByRole('listitem')).toHaveCount(4);
  await split.getByRole('button', { name: '一覧を閉じる' }).click();
  await row.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '名前変更' }).click();
  await expect(split.getByRole('dialog', { name: 'ビューの名前を変更' })).toBeVisible();
});

test('R-62 保存済みの別ビューを開かずに一覧を確認できる', async ({ split, context }) => {
  await openSessions(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  const rows = side.locator('.view-choice');
  const pageCount = context.pages().length;
  await side.getByRole('button', { name: '新しいビュー', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await rows.last().click({ button: 'right' });
  await split.getByRole('menu', { name: 'ビューの操作' }).getByRole('menuitem', { name: '一覧' }).click();
  const dialog = split.getByRole('dialog', { name: 'タブ一覧' });
  await expect(dialog.getByRole('listitem')).toHaveCount(4);
  await expect(dialog.getByRole('button', { name: 'タブ 1 を閉じる' })).toBeDisabled();
  expect(context.pages()).toHaveLength(pageCount);
});

test('R-63 変更可能な戻す・やり直しコマンドが選択ビューの配置に作用する', async ({ split, sw }) => {
  const commands = await split.evaluate(() => chrome.commands.getAll());
  expect(commands.map(command => command.name)).toEqual(expect.arrayContaining(['layout-undo', 'layout-redo']));
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('3');
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  for (const [action, expected] of [['layout-undo', '4'], ['layout-redo', '3']] as const) {
    await sw.evaluate(async ({ url, action }) => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url === url)!;
      await (globalThis as unknown as { __split8Test: { handleCommand(name: string, tab: chrome.tabs.Tab): Promise<void> } }).__split8Test.handleCommand(action, tab);
    }, { url: split.url(), action });
    await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue(expected);
  }
  await split.getByRole('button', { name: '設定', exact: true }).click();
  await expect(split.getByRole('dialog').getByText('変更を元に戻す')).toBeVisible();
  await expect(split.getByRole('dialog').getByText('変更をやり直す')).toBeVisible();
});
