import { test, expect, openUrl, pane, site } from './fixtures';

test('R-42 現在の配置を明示操作で保存し再読込後に適用できる', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token?template-current'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toBeVisible();
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('2'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'レイアウトテンプレート' });
  await dialog.getByRole('textbox', { name: 'テンプレート名' }).fill('新しい配置');
  await dialog.getByRole('button', { name: '現在の配置を保存', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '新しい配置を適用' })).toBeVisible();
  const saved = await split.evaluate(async () => (await chrome.storage.local.get('layoutTemplates')).layoutTemplates as { templates: Array<{ count: number }> });
  expect(saved.templates[0]!.count).toBe(2);
  expect(JSON.stringify(saved)).not.toContain(site('a', '/token?template-current'));
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('3'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.reload();
  const token = await pane(split, 0).frameLocator('iframe').getByTestId('token').textContent();
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  await dialog.getByRole('button', { name: '新しい配置を適用' }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('2');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('token')).toHaveText(token!);
});
