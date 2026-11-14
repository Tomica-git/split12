import { test as base, expect, openUrl, pane, site } from './fixtures';
import { localTlsContext } from './fixtures/tls';

const test = base.extend({
  context: async ({ profile }, use) => {
    const fixture = await localTlsContext(profile, ['www.google.com'], (_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<main data-testid="search-result">search-result</main>');
    });
    try { await use(fixture.context); } finally { await fixture.close(); }
  },
});
const count = (page: import('@playwright/test').Page) => page.getByRole('spinbutton', { name: '表示数', exact: true });

test('R-82 検索語句では表示中のGoogle検索候補を初期選択しEnterで同じ枠に検索する', async ({ split, context }) => {
  await openUrl(split, 1, site('a', '/plain'));
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  await input.click(); await input.pressSequentially('hello world', { delay: 20 });
  const option = split.getByRole('listbox', { name: 'アドレスの候補' }).getByRole('option', { name: /Google で「hello world」を検索/ });
  await expect(option).toHaveAttribute('aria-selected', 'true');
  const pages = context.pages().length;
  await input.press('Enter');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('search-result')).toHaveText('search-result');
  expect(new URL(await input.inputValue()).searchParams.get('q')).toBe('hello world');
  expect(context.pages()).toHaveLength(pages);
  await expect(count(split)).toHaveValue('4');
  await expect(pane(split, 1).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});

test('R-82 URLの入力では候補を初期選択せずEnterで入力どおり開く', async ({ split }) => {
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  const url = site('a', '/plain');
  await input.click(); await input.pressSequentially(url, { delay: 10 });
  const list = split.getByRole('listbox', { name: 'アドレスの候補' });
  await expect(list.getByRole('option').first()).toBeVisible();
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(0);
  await input.press('Enter');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
});

test('R-83 狭い枠は新しいタブ・倍率と戻る進む・再読み込みを順に隠し枠のメニューから使える', async ({ split }) => {
  await split.setViewportSize({ width: 1280, height: 720 });
  await openUrl(split, 0, site('a', '/plain'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toBeVisible();
  await count(split).fill('12'); await count(split).press('Enter');
  const narrow = split.locator('.pane[data-size="xs"], .pane[data-size="s"]').first();
  await expect(narrow).toBeVisible();
  await expect(narrow.getByRole('button', { name: '表示倍率' })).toBeHidden();
  await expect(narrow.getByRole('button', { name: '戻る', exact: true })).toBeHidden();
  await expect(narrow.getByRole('button', { name: '閉じる', exact: true })).toBeVisible();
  // Every header control stays inside the pane instead of spilling past its edge.
  for (const element of await split.locator('.pane:not([hidden])').all()) {
    const box = (await element.boundingBox())!;
    for (const control of await element.locator('.pane-bar > :visible').all()) {
      const rect = (await control.boundingBox())!;
      expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width + 1);
    }
  }
  await narrow.getByRole('button', { name: '枠のメニュー' }).click();
  const menu = split.getByRole('menu', { name: '枠の操作' });
  await expect(menu.getByRole('menuitem', { name: '拡大（100%）' })).toBeVisible();
  await menu.getByRole('menuitem', { name: '拡大（100%）' }).click();
  await narrow.getByRole('button', { name: '枠のメニュー' }).click();
  await expect(menu.getByRole('menuitem', { name: '拡大（110%）' })).toBeVisible();
  await split.keyboard.press('Escape');
  await count(split).fill('4'); await count(split).press('Enter');
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toBeVisible();
});

test('R-84 空の枠に入力ボタン・開いているタブ・ドロップの案内を出す', async ({ split, context }) => {
  const empty = pane(split, 1);
  await expect(empty.getByText('ここにページを表示')).toBeVisible();
  await expect(empty.getByText('リンクをこの枠へドラッグしても開けます')).toBeVisible();
  await expect(empty.getByText('開いているタブから選ぶ')).toBeHidden();
  await empty.getByRole('button', { name: 'URL・検索語句を入力' }).click();
  await expect(empty.getByRole('combobox', { name: 'アドレス' })).toBeFocused();
  await expect(empty).toHaveClass(/active/);
  const source = await context.newPage(); await source.goto(site('b', '/plain')); await split.bringToFront();
  await expect(empty.getByText('開いているタブから選ぶ')).toBeVisible();
  await empty.getByRole('list', { name: '開いているタブ' }).getByRole('listitem').filter({ hasText: 'b.test' }).click();
  await expect(empty.frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await expect(empty.getByText('ここにページを表示')).toBeHidden();
  await source.close();
});

test('R-85 番号の横のボタンで枠のメニューを開き最大化と解除ができる', async ({ split }) => {
  const menuButton = pane(split, 0).getByRole('button', { name: '枠のメニュー' });
  await menuButton.click();
  const menu = split.getByRole('menu', { name: '枠の操作' });
  await expect(menu.getByRole('menuitem')).toHaveText(['固定タブに選択', '最大化', '開いているタブから追加', 'タブを削除', 'この枠を空にする']);
  await menu.getByRole('menuitem', { name: '最大化', exact: true }).click();
  await expect(pane(split, 1)).toBeHidden();
  await menuButton.click();
  await menu.getByRole('menuitem', { name: '最大化を解除' }).click();
  await expect(pane(split, 1)).toBeVisible();
  await expect(count(split)).toHaveValue('4');
});

test('R-86 枠の見出しと補足の文字を11px以上にする', async ({ split }) => {
  const size = (selector: string) => split.locator(selector).first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(await size('.pane .address')).toBeGreaterThanOrEqual(12);
  expect(await size('.pane .pane-number')).toBeGreaterThanOrEqual(11);
  expect(await size('.pane .zoom')).toBeGreaterThanOrEqual(11);
  expect(await size('.toolbar .group-label')).toBeGreaterThanOrEqual(11);
});
