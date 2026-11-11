import { test, expect, openUrl, pane, site } from './fixtures';

test('R-53 表示数を入力して変更し＋と−で一つずつ増減する', async ({ split }) => {
  const count = split.getByRole('spinbutton', { name: '表示数', exact: true });
  await expect(count).toHaveValue('4');
  await openUrl(split, 0, site('a', '/token?count-0194'));
  const token = pane(split, 0).frameLocator('iframe').getByTestId('token');
  await expect(token).toBeVisible(); const before = await token.textContent();
  await count.fill('6'); await count.press('Enter');
  await expect(count).toHaveValue('6');
  await split.getByRole('button', { name: '表示数を増やす' }).click(); await expect(count).toHaveValue('7');
  await split.getByRole('button', { name: '表示数を減らす' }).click(); await expect(count).toHaveValue('6');
  await expect(token).toHaveText(before!);
  await count.fill('12'); await count.press('Enter'); await expect(split.getByRole('button', { name: '表示数を増やす' })).toBeDisabled();
  await count.fill('1'); await count.press('Enter'); await expect(split.getByRole('button', { name: '表示数を減らす' })).toBeDisabled();
  await count.fill('13'); await count.press('Enter'); await expect(count).toHaveValue('1');
  await count.fill('0'); await count.press('Enter'); await expect(count).toHaveValue('1');
  await count.fill(''); await count.press('Enter'); await expect(count).toHaveValue('1');
  await split.reload(); await expect(count).toHaveValue('1');
});

test('R-54 保存済みテンプレート名をダブルクリックしてEnterで変更する', async ({ split }) => {
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'レイアウトテンプレート' });
  await dialog.getByRole('button', { name: '現在の配置を保存', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '現在の配置を選択' })).toBeVisible();
  await dialog.getByRole('combobox', { name: 'テンプレートショートカット 1' }).selectOption({ label: '現在の配置' });
  await dialog.getByRole('button', { name: '現在の配置を選択' }).dblclick();
  const input = dialog.getByRole('textbox', { name: 'テンプレート名を変更' });
  await input.fill('仕事用'); await input.press('Enter');
  await expect(dialog.getByRole('button', { name: '仕事用を選択' })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'テンプレートショートカット 1' })).toHaveText(/仕事用/);
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await split.reload();
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '仕事用を選択' })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'テンプレートショートカット 1' })).toHaveValue(/.+/);
});

test('R-54 空の名前は保存せずEscで編集を取消できる', async ({ split }) => {
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'レイアウトテンプレート' });
  await dialog.getByRole('button', { name: '現在の配置を保存', exact: true }).click();
  const name = dialog.getByRole('button', { name: '現在の配置を選択' });
  await expect(name).toBeVisible(); await name.dblclick();
  const input = dialog.getByRole('textbox', { name: 'テンプレート名を変更' });
  await input.fill(''); await input.press('Enter');
  await expect(dialog.getByRole('status')).toContainText('確認してください');
  await expect(input).toBeVisible(); await input.fill('破棄'); await input.press('Escape');
  await expect(name).toBeVisible();
});

test('R-54 重複名への変更を拒否し他のテンプレートを保持する', async ({ split }) => {
  await split.getByRole('button', { name: 'テンプレート', exact: true }).click();
  const dialog = split.getByRole('dialog', { name: 'レイアウトテンプレート' });
  await dialog.getByRole('button', { name: '現在の配置を保存', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '現在の配置を選択' })).toBeVisible();
  await dialog.getByRole('button', { name: '現在の配置を保存', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '現在の配置（2）を選択' })).toBeVisible();
  await dialog.getByRole('button', { name: '現在の配置（2）を選択' }).dblclick();
  const input = dialog.getByRole('textbox', { name: 'テンプレート名を変更' });
  await input.fill('現在の配置'); await input.press('Enter');
  await expect(dialog.getByRole('status')).toContainText('同じ名前');
  await expect(dialog.getByRole('button', { name: '現在の配置を選択' })).toBeVisible();
  await input.press('Escape');
  await expect(dialog.getByRole('button', { name: '現在の配置（2）を選択' })).toBeVisible();
});
