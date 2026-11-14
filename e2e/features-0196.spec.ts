import { test, expect, openSessions, openUrl, pane, site } from './fixtures';

// R-90 (2026-11-12) replaces R-59, and R-93 (one Split12 per window) makes 追加 and opening a view switch this same
// tab. Selecting a row still never opens anything; F2 renames; double-click opens the view here.
test('R-57 R-58 R-90 R-93 R-81 追加は同じタブで新しいビューに切り替え、選択だけでは開かず、F2で名前を変え、ダブルクリックで開く', async ({ split, context }) => {
  await expect(split.locator('.toolbar .add-tabs')).toHaveCount(0);
  await openSessions(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  const rows = side.locator('.view-choice');
  await expect(rows).toHaveCount(1);
  await openUrl(split, 0, site('a', '/plain?named-view'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const mainUrl = split.url(), pages = context.pages().length;
  await side.getByRole('button', { name: '新しいビュー', exact: true }).click();
  await expect(split).toHaveURL(/view=[a-f\d-]{36}/);
  await expect(rows).toHaveCount(2);
  expect(context.pages()).toHaveLength(pages);
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(rows.first()).toContainText('保存済み');
  const addedUrl = split.url();
  await rows.first().click();
  await expect(rows.first()).toHaveAttribute('data-selected', 'true');
  expect(context.pages()).toHaveLength(pages);
  expect(split.url()).toBe(addedUrl);
  await rows.first().focus();
  await rows.first().press('F2');
  const dialog = split.getByRole('dialog', { name: 'ビューの名前を変更' });
  await dialog.getByRole('textbox', { name: 'ビュー名' }).fill('保存したビュー');
  await dialog.getByRole('button', { name: '変更する' }).click();
  await expect(rows.first()).toContainText('保存したビュー');
  await rows.first().dblclick();
  await expect(split).toHaveURL(mainUrl);
  await expect(split).toHaveTitle('保存したビュー - Split12');
  await expect(split.getByRole('spinbutton', { name: '表示数' })).toHaveValue('4');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  expect(context.pages()).toHaveLength(pages);
});

test('R-57 タブから追加は番号のメニューに残る', async ({ split }) => {
  await pane(split, 0).locator('.pane-number').click({ button: 'right' });
  await split.getByRole('menuitem', { name: '開いているタブから追加' }).click();
  await expect(split.getByRole('dialog', { name: '開いているタブから追加' })).toBeVisible();
});

test('R-60 ボタンのヒントに機能名と現在のショートカットを表示する', async ({ split }) => {
  const commands = await split.evaluate(() => chrome.commands.getAll());
  const shortcut = commands.find(command => command.name === 'pane-increase')?.shortcut;
  const button = split.getByRole('button', { name: '表示数を増やす' });
  await button.hover();
  await expect(button).toHaveAttribute('title', new RegExp(shortcut ? shortcut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : 'ショートカット未設定'));
  await expect(split.getByRole('button', { name: '設定', exact: true })).toHaveAttribute('title', /ショートカット未設定/);
});

// R-90 replaces R-59: a view with a page is still saved across reloads, but one left empty is not kept.
test('R-90 R-93 ページのあるビューは再読み込み後も残り、空のまま離れたビューは残さない', async ({ split }) => {
  await openSessions(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  const rows = side.locator('.view-choice');
  await openUrl(split, 0, site('a', '/plain?main-kept'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  await side.getByRole('button', { name: '新しいビュー', exact: true }).click();
  await expect(split).toHaveTitle(/ビュー 2 - Split12/);
  await openUrl(split, 0, site('a', '/plain?kept-view'));
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('plain');
  const id = new URL(split.url()).searchParams.get('view');
  await side.getByRole('button', { name: '新しいビュー', exact: true }).click();
  await expect(split).toHaveTitle(/ビュー 3 - Split12/);
  await expect(rows).toHaveCount(3);
  await rows.nth(1).dblclick();
  await expect(split).toHaveURL(new RegExp(`view=${id}`));
  await split.reload();
  await expect(rows).toHaveCount(2);
  expect(await rows.last().getAttribute('data-view')).toBe(id);
});

test('R-60 Chrome側のショートカット変更をフォーカス復帰時に反映する', async ({ split }) => {
  const button = split.getByRole('button', { name: '表示数を増やす' });
  await split.evaluate(() => {
    chrome.commands.getAll = async () => [
      { name: 'pane-increase', shortcut: 'Alt+Shift+9', description: '分割数を増やす' },
      { name: 'zoom-in', shortcut: 'Alt+Shift+7', description: '拡大' },
      { name: 'zoom-out', shortcut: 'Alt+Shift+6', description: '縮小' },
    ];
    window.dispatchEvent(new Event('focus'));
  });
  await expect(button).toHaveAttribute('title', /Alt\+Shift\+9/);
  await expect(pane(split, 0).getByRole('button', { name: '表示倍率' })).toHaveAttribute('title', /Alt\+Shift\+7.*Alt\+Shift\+6/);
});
