import { test, expect, openUrl, pane, site } from './fixtures';

test('R-66 サイトアイコンは枠番号の左に表示し番号を引き続き操作できる', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain?icon-position'));
  const target = pane(split, 0);
  const icon = target.locator('.pane-favicon'), number = target.locator('.pane-number');
  await expect(icon).toBeVisible();
  expect((await icon.boundingBox())!.x).toBeLessThan((await number.boundingBox())!.x);
  await number.dblclick();
  await expect(pane(split, 1)).toBeHidden();
  await split.keyboard.press('Escape');
  await expect(pane(split, 1)).toBeVisible();
});

test('R-64 一覧にページ名を表示し変更と再読み込み後も反映する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain?list-title'));
  const frame = pane(split, 0).frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('plain');
  await expect.poll(() => split.evaluate(async () => ((await chrome.storage.local.get('workspace')).workspace as { panes: Array<{ title?: string }> }).panes[0]?.title)).toBe('Fixture /plain');
  await split.getByRole('button', { name: '一覧', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'タブ一覧' });
  await expect(dialog.getByRole('listitem').first()).toContainText('Fixture /plain');
  await dialog.getByRole('button', { name: '一覧を閉じる' }).click();
  await frame.locator('body').evaluate(() => { document.title = '変更されたページ名'; });
  await expect.poll(() => split.evaluate(async () => ((await chrome.storage.local.get('workspace')).workspace as { panes: Array<{ title?: string }> }).panes[0]?.title)).toBe('変更されたページ名');
  await split.reload();
  await split.getByRole('button', { name: '一覧', exact: true }).click();
  await expect(split.getByRole('dialog', { name: 'タブ一覧' }).getByRole('listitem').first()).toContainText('Fixture /plain');
});

test('R-65 一覧のハンドルで順番を移動しページを保持して元に戻せる', async ({ split }) => {
  const urls = [0, 1, 2].map(i => site('a', `/token?order=${i}`));
  for (let i = 0; i < urls.length; i++) {
    await openUrl(split, i, urls[i]!);
    await expect(pane(split, i).frameLocator('iframe').getByTestId('token')).toBeVisible();
  }
  const tokens = await Promise.all([0, 1, 2].map(i => pane(split, i).frameLocator('iframe').getByTestId('token').textContent()));
  await split.getByRole('button', { name: '一覧', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'タブ一覧' });
  const rows = dialog.getByRole('listitem');
  await rows.first().hover();
  const handle = dialog.getByRole('button', { name: 'タブ 1 を移動' });
  await expect(handle).toHaveCSS('opacity', '1');
  await handle.dragTo(rows.nth(2));
  await expect(rows.nth(0)).toContainText(urls[1]!);
  await expect(rows.nth(1)).toContainText(urls[2]!);
  await expect(rows.nth(2)).toContainText(urls[0]!);
  await dialog.getByRole('button', { name: '一覧を閉じる' }).click();
  for (const [i, original] of [[0, 1], [1, 2], [2, 0]] as const) await expect(pane(split, i).frameLocator('iframe').getByTestId('token')).toHaveText(tokens[original]!);
  await split.getByRole('button', { name: '変更を元に戻す' }).click();
  for (let i = 0; i < 3; i++) await expect(pane(split, i).frameLocator('iframe').getByTestId('token')).toHaveText(tokens[i]!);
  await split.getByRole('button', { name: '変更をやり直す' }).click();
  await split.reload();
  for (const [i, original] of [[0, 1], [1, 2], [2, 0]] as const) await expect(pane(split, i).getByRole('combobox', { name: 'アドレス' })).toHaveValue(urls[original]!);
});

test('R-67 一覧のゴミ箱はページだけを消し枠数と他のページを保ちUndoできる', async ({ split }) => {
  const first = site('a', '/plain?clear=1');
  const other = site('b', '/token?clear=other');
  await openUrl(split, 0, first);
  await openUrl(split, 1, other);
  const token = pane(split, 1).frameLocator('iframe').getByTestId('token');
  await expect(token).toBeVisible(); const value = await token.textContent();
  await split.getByRole('button', { name: '一覧', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'タブ一覧' });
  const firstRow = dialog.getByRole('listitem').first();
  await expect(firstRow.getByRole('button', { name: 'タブ 1 を閉じる' })).toBeVisible();
  await firstRow.getByRole('button', { name: 'タブ 1 を空にする' }).click();
  await expect(dialog.getByRole('listitem')).toHaveCount(4);
  await expect(firstRow).toContainText('空のタブ');
  await dialog.getByRole('button', { name: '一覧を閉じる' }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue('');
  await expect(token).toHaveText(value!);
  await split.getByRole('button', { name: '変更を元に戻す' }).click();
  await expect(pane(split, 0).getByRole('combobox', { name: 'アドレス' })).toHaveValue(first);
  await expect(token).toHaveText(value!);
});
