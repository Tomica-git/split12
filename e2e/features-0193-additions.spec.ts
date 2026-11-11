import { test, expect, moveIntoFrame, openUrl, pane, site } from './fixtures';

test('R-47 3＋1はテンプレートの直前に表示され操作できる', async ({ split }) => {
  const preset = split.getByRole('button', { name: '3＋1', exact: true });
  await expect(preset).toBeVisible();
  await expect(preset.locator('xpath=following-sibling::*[1]')).toHaveText('テンプレート');
  await preset.click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
});

test('R-48 保存したテンプレートを3つのショートカットに登録して適用する', async ({ split }) => {
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('2'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'レイアウトテンプレート' });
  await dialog.getByRole('textbox', { name: 'テンプレート名' }).fill('二分割');
  await dialog.getByRole('button', { name: '現在の配置を保存' }).click();
  await expect(dialog.getByRole('button', { name: '二分割を適用' })).toBeVisible();
  const selector = dialog.getByRole('combobox', { name: 'テンプレートショートカット 1' });
  const value = await selector.locator('option', { hasText: '二分割' }).getAttribute('value');
  await selector.selectOption(value!);
  await dialog.getByRole('combobox', { name: 'テンプレートショートカット 2' }).selectOption(value!);
  await dialog.getByRole('combobox', { name: 'テンプレートショートカット 3' }).selectOption(value!);
  await expect.poll(() => split.evaluate(async () => (await chrome.storage.local.get('templateShortcutIds')).templateShortcutIds)).toEqual([value, value, value]);
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('4'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await split.reload();
  await split.getByRole('button', { name: 'テンプレートショートカット 1', exact: true }).click();
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('2');
  for (const number of [2, 3]) {
    await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('4'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
    await split.getByRole('button', { name: `テンプレートショートカット ${number}`, exact: true }).click();
    await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('2');
  }
});

test('R-49 ロゴとショートカットで上部ツールバーを閉じ再表示できる', async ({ split }) => {
  await split.getByRole('button', { name: '上部ツールバーを閉じる' }).click();
  await expect(split.locator('.toolbar')).toBeHidden();
  await split.getByRole('button', { name: '上部ツールバーを開く' }).click();
  await expect(split.locator('.toolbar')).toBeVisible();
  await expect(split.getByRole('button', { name: '上部ツールバーを開く' })).toBeHidden();
  await split.keyboard.press('Alt+Shift+H');
  await expect(split.locator('.toolbar')).toBeHidden();
  await split.keyboard.press('Alt+Shift+H');
  await expect(split.locator('.toolbar')).toBeVisible();
});

test('R-50 番号の隣にサイトアイコンを表示しログインボタンを表示しない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain'));
  const icon = pane(split, 0).locator('.pane-favicon');
  await expect(icon).toBeVisible();
  expect(await icon.getAttribute('src')).toContain('_favicon/');
  await expect.poll(() => icon.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  expect(await icon.evaluate(el => el.nextElementSibling?.classList.contains('pane-number'))).toBe(true);
  await expect(pane(split, 0).getByRole('button', { name: '通常タブでログイン' })).toHaveCount(0);
  await openUrl(split, 0, site('b', '/page2'));
  await expect(icon).toHaveAttribute('src', /b\.test/);
});

test('R-49 枠内にフォーカスした状態でもショートカットで上部バーを開閉できる', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toBeVisible();
  await moveIntoFrame(split, 0);
  await pane(split, 0).frameLocator('iframe').getByTestId('marker').click();
  await split.keyboard.press('Alt+Shift+H');
  await expect(split.locator('.toolbar')).toBeHidden();
  await split.keyboard.press('Alt+Shift+H');
  await expect(split.locator('.toolbar')).toBeVisible();
});
