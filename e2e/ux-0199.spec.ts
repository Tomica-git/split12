import { test, expect, openSessions, openUrl, pane, site } from './fixtures';

test('R-87 左上のサイトアイコンをドラッグしても枠を交換しページを保つ', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token'));
  await openUrl(split, 1, site('b', '/token'));
  const first = pane(split, 0).frameLocator('iframe').getByTestId('token');
  await expect(first).toBeVisible(); await expect(pane(split, 1).frameLocator('iframe').getByTestId('token')).toBeVisible();
  const value = await first.textContent();
  const icon = pane(split, 0).locator('.pane-favicon');
  await expect(icon).toBeVisible();
  const a = (await pane(split, 0).boundingBox())!, b = (await pane(split, 1).boundingBox())!;
  await icon.dragTo(pane(split, 1).locator('.pane-bar'));
  await expect.poll(async () => (await pane(split, 0).boundingBox())?.x).toBeCloseTo(b.x, 0);
  await expect.poll(async () => (await pane(split, 1).boundingBox())?.x).toBeCloseTo(a.x, 0);
  await expect(first).toHaveText(value!);
});

test('R-87 サイトアイコンのダブルクリックで最大化し右クリックで枠のメニューを開く', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain'));
  const icon = pane(split, 0).locator('.pane-favicon');
  await expect(icon).toBeVisible();
  await icon.dblclick();
  await expect(pane(split, 1)).toBeHidden();
  await split.keyboard.press('Escape');
  await expect(pane(split, 1)).toBeVisible();
  await icon.click({ button: 'right' });
  await expect(split.getByRole('menu', { name: '枠の操作' }).getByRole('menuitem', { name: '固定タブに選択' })).toBeVisible();
});

test('R-88 「1枚を大きく」で選択中の枠だけを大きくし残りを均等に並べ、Undoで戻せる', async ({ split }) => {
  await openUrl(split, 2, site('a', '/token'));
  const token = pane(split, 2).frameLocator('iframe').getByTestId('token');
  await expect(token).toBeVisible();
  const value = await token.textContent();
  const count = split.getByRole('spinbutton', { name: '表示数', exact: true });
  await count.fill('5'); await count.press('Enter');
  await pane(split, 2).getByRole('combobox', { name: 'アドレス' }).click();
  await split.getByRole('button', { name: '1枚を大きく', exact: true }).click();
  const grid = (await split.locator('.grid').boundingBox())!;
  const big = (await pane(split, 2).boundingBox())!;
  expect(big.x).toBeCloseTo(grid.x, 0);
  expect(big.height).toBeCloseTo(grid.height, 0);
  expect(big.width).toBeGreaterThanOrEqual(grid.width * .55);
  const others = await Promise.all([0, 1, 3, 4].map(async index => (await pane(split, index).boundingBox())!));
  for (const box of others) {
    expect(box.width).toBeCloseTo(others[0]!.width, 0);
    expect(box.height).toBeCloseTo(others[0]!.height, 0);
  }
  await expect(token).toHaveText(value!);
  await split.getByRole('button', { name: '変更を元に戻す' }).click();
  await expect.poll(async () => (await pane(split, 2).boundingBox())!.width).toBeLessThan(grid.width * .55);
  await expect(token).toHaveText(value!);
});

test('R-89 枠一覧は広く、ページの有無にかかわらず行の高さと列の位置がそろう', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain?pane-list'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await split.getByRole('button', { name: '一覧', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'タブ一覧' });
  expect((await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(640);
  const rows = dialog.getByRole('listitem');
  await expect(rows).toHaveCount(4);
  const boxes = await Promise.all([0, 1, 2, 3].map(async index => ({
    row: (await rows.nth(index).boundingBox())!, info: (await rows.nth(index).locator('.pane-list-info').boundingBox())!, remove: (await rows.nth(index).locator('.pane-list-remove').boundingBox())!,
  })));
  for (const box of boxes) {
    expect(box.row.height).toBeGreaterThanOrEqual(52);
    expect(box.row.height).toBeCloseTo(boxes[0]!.row.height, 0);
    expect(box.info.x).toBeCloseTo(boxes[0]!.info.x, 0);
    expect(box.info.width).toBeCloseTo(boxes[0]!.info.width, 0);
    expect(box.remove.x).toBeCloseTo(boxes[0]!.remove.x, 0);
    expect(box.remove.width).toBeGreaterThanOrEqual(32);
  }
});

test('R-90 開いていない全部空のビューは一覧に出さず保存からも消す', async ({ split, sw }) => {
  const empty = '11111111-2222-4333-8444-555555555555', kept = '66666666-7777-4888-9999-aaaaaaaaaaaa';
  const blank = Array.from({ length: 12 }, () => ({ url: '', zoom: 1 }));
  await sw.evaluate(async ({ empty, kept, blank, url }) => {
    const { viewRegistry } = await chrome.storage.local.get('viewRegistry') as { viewRegistry?: { views: Array<{ id: string; title: string; createdAt: number }> } };
    const views = [...(viewRegistry?.views ?? []), { id: empty, title: '空のビュー', createdAt: 1 }, { id: kept, title: 'ページのあるビュー', createdAt: 2 }];
    await chrome.storage.local.set({ viewRegistry: { schemaVersion: 1, views }, [`workspace:${empty}`]: { panes: blank }, [`workspace:${kept}`]: { panes: blank.map((pane, index) => index === 7 ? { ...pane, url } : pane) } });
  }, { empty, kept, blank, url: site('a', '/plain?hidden-pane') });
  await openSessions(split);
  const rows = split.getByRole('complementary', { name: 'セッション' }).locator('.view-choice');
  await expect(rows.filter({ hasText: 'ページのあるビュー' })).toHaveCount(1);
  await expect(rows.filter({ hasText: '空のビュー' })).toHaveCount(0);
  await expect.poll(() => sw.evaluate(async id => (await chrome.storage.local.get(`workspace:${id}`))[`workspace:${id}`] === undefined, empty)).toBe(true);
  // The view shown in this tab stays even though all of its panes are empty.
  await expect(rows.first()).toHaveAttribute('aria-current', 'page');
});

test('R-91 セッションの操作は✏️命名・❌削除・➕追加・📖編集で、命名は名前変更を開く', async ({ split }) => {
  await openSessions(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  await expect(side.locator('.sidebar-actions button')).toHaveText(['✏️命名', '❌削除', '➕追加', '📖編集']);
  await expect(side.getByRole('button', { name: /を開く$/ })).toHaveCount(0);
  await side.getByRole('button', { name: 'ビュー 1 を命名' }).click();
  const dialog = split.getByRole('dialog', { name: 'ビューの名前を変更' });
  await dialog.getByRole('textbox', { name: 'ビュー名' }).fill('作業A');
  await dialog.getByRole('button', { name: '変更する' }).click();
  await expect(side.locator('.view-choice').first()).toContainText('作業A');
  await side.getByRole('button', { name: '一覧を編集' }).click();
  await expect(side.locator('.view-edit')).toHaveText('✅完了');
});
