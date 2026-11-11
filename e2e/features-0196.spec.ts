import { test, expect, openSessions, pane } from './fixtures';

test('R-57 R-58 R-59 R-81 ビューは保存と選択だけでは開かず、F2で名前を変え、ダブルクリックで開く', async ({ split, context }) => {
  await expect(split.locator('.toolbar .add-tabs')).toHaveCount(0);
  await openSessions(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  const rows = side.locator('.view-choice');
  await expect(rows).toHaveCount(1);
  const beforeUrl = split.url(), pages = context.pages().length;
  await side.getByRole('button', { name: '新しいビュー', exact: true }).click();
  await expect(rows).toHaveCount(2);
  expect(context.pages()).toHaveLength(pages);
  expect(split.url()).toBe(beforeUrl);
  await expect(rows.first()).toHaveAttribute('data-selected', 'true');
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute('data-selected', 'true');
  expect(context.pages()).toHaveLength(pages);
  expect(split.url()).toBe(beforeUrl);
  await rows.nth(1).focus();
  await rows.nth(1).press('F2');
  const dialog = split.getByRole('dialog', { name: 'ビューの名前を変更' });
  await dialog.getByRole('textbox', { name: 'ビュー名' }).fill('保存したビュー');
  await dialog.getByRole('button', { name: '変更する' }).click();
  await expect(rows.nth(1)).toContainText('保存したビュー');
  const opened = context.waitForEvent('page');
  await rows.nth(1).dblclick();
  const page = await opened;
  await expect(page).toHaveTitle('保存したビュー - Split12');
  await expect(page.getByRole('spinbutton', { name: '表示数' })).toHaveValue('4');
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

test('R-59 作成したビューは再読み込み後も保存され、開くまで新しいタブを作らない', async ({ split, context }) => {
  await openSessions(split);
  const side = split.getByRole('complementary', { name: 'セッション' });
  const rows = side.locator('.view-choice');
  const before = context.pages().length;
  await side.getByRole('button', { name: '新しいビュー', exact: true }).click();
  await expect(rows).toHaveCount(2);
  const id = await rows.last().getAttribute('data-view');
  await split.reload();
  await expect(rows).toHaveCount(2);
  expect(await rows.last().getAttribute('data-view')).toBe(id);
  expect(context.pages()).toHaveLength(before);
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
