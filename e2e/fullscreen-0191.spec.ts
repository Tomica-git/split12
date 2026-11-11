import { test, expect, pane, openUrl, site } from './fixtures';

test('R-44 数字のダブルクリックで最大化と復帰を行い他のページを保持する', async ({ split }) => {
  await openUrl(split, 0, site('a', '/token'));
  await openUrl(split, 1, site('b', '/token'));
  const otherToken = pane(split, 1).frameLocator('iframe').getByTestId('token');
  await expect(otherToken).toBeVisible();
  const value = await otherToken.textContent();
  const number = pane(split, 0).locator('.pane-number');
  await expect(pane(split, 0).locator('.maximize')).toHaveCount(0);
  await number.dblclick();
  await expect(pane(split, 1)).toBeHidden();
  await expect(number).toHaveAttribute('aria-label', /元に戻す/);
  await number.dblclick();
  await expect(otherToken).toHaveText(value!);
  await expect(number).toHaveAttribute('aria-label', /最大化/);
});

test('R-44 数字のキーボード操作で最大化と復帰できる', async ({ split }) => {
  const number = pane(split, 0).locator('.pane-number');
  await number.focus();
  await split.keyboard.press('Enter');
  await expect(pane(split, 1)).toBeHidden();
  await split.keyboard.press('Space');
  await expect(pane(split, 1)).toBeVisible();
});

test('R-44 数字の右クリックとドラッグは最大化を起こさない', async ({ split }) => {
  const number = pane(split, 0).locator('.pane-number');
  await number.click({ button: 'right' });
  await expect(split.getByRole('menu')).toBeVisible();
  await expect(pane(split, 1)).toBeVisible();
  await split.keyboard.press('Escape');
  await number.dragTo(pane(split, 1).locator('.pane-number'));
  await expect(pane(split, 1)).toBeVisible();
  await expect(pane(split, 0).locator('.pane-number')).toHaveAttribute('aria-label', /最大化/);
});

test('R-44 Escapeで最大化を解除し他のページを保持する', async ({ split }) => {
  await openUrl(split, 1, site('b', '/token'));
  const token = pane(split, 1).frameLocator('iframe').getByTestId('token');
  await expect(token).toBeVisible();
  const before = await token.textContent();
  const number = pane(split, 0).locator('.pane-number');
  await number.dblclick();
  await expect(pane(split, 1)).toBeHidden();
  await number.focus();
  await split.keyboard.press('Escape');
  await expect(token).toHaveText(before!);
  await expect(number).toHaveAttribute('aria-label', /最大化/);
});

test('R-44 開いている番号メニューと設定はEscapeで先に閉じ、最大化は維持する', async ({ split }) => {
  const number = pane(split, 0).locator('.pane-number');
  await number.dblclick();
  await number.click({ button: 'right' });
  await expect(split.getByRole('menu')).toBeVisible();
  await split.keyboard.press('Escape');
  await expect(split.getByRole('menu')).toBeHidden();
  await expect(pane(split, 1)).toBeHidden();
  await split.getByRole('button', { name: '上部ツールバーを開く' }).click();
  await split.getByRole('button', { name: '設定', exact: true }).click();
  await expect(split.getByRole('dialog')).toBeVisible();
  await split.keyboard.press('Escape');
  await expect(split.getByRole('dialog')).toBeHidden();
  await expect(pane(split, 1)).toBeHidden();
  await number.focus();
  await split.keyboard.press('Escape');
  await expect(pane(split, 1)).toBeVisible();
});

test('R-44 ページ内の信頼されたEscapeで最大化を解除し、ページの処理も届く', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain'));
  const child = pane(split, 0).frameLocator('iframe');
  await expect(child.getByTestId('marker')).toBeVisible();
  await child.locator('body').evaluate(element => {
    const input = document.createElement('input'); input.id = 'escape-input'; element.append(input);
    input.addEventListener('keydown', event => { if (event.key === 'Escape') input.dataset.escape = 'received'; });
  });
  await pane(split, 0).locator('.pane-number').dblclick();
  await expect(pane(split, 1)).toBeHidden();
  await child.locator('#escape-input').focus();
  await split.keyboard.press('Escape');
  await expect(child.locator('#escape-input')).toHaveAttribute('data-escape', 'received');
  await expect(pane(split, 1)).toBeVisible();
});

test('R-44 ページがEscapeを処理した場合は最大化を解除しない', async ({ split }) => {
  await openUrl(split, 0, site('a', '/plain'));
  const child = pane(split, 0).frameLocator('iframe');
  await expect(child.getByTestId('marker')).toBeVisible();
  await child.locator('body').evaluate(element => {
    const input = document.createElement('input'); input.id = 'escape-input'; element.append(input);
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape' && input.dataset.consume !== 'done') { event.preventDefault(); input.dataset.consume = 'done'; }
    });
  });
  await pane(split, 0).locator('.pane-number').dblclick();
  await child.locator('#escape-input').focus();
  await split.keyboard.press('Escape');
  await expect(child.locator('#escape-input')).toHaveAttribute('data-consume', 'done');
  await expect(pane(split, 1)).toBeHidden();
  await split.keyboard.press('Escape');
  await expect(pane(split, 1)).toBeVisible();
});

test('R-52 最大化時は上部バーを隠しEsc解除後は表示を戻す', async ({ split }) => {
  const toolbar = split.locator('.toolbar');
  await expect(toolbar).toBeVisible();
  const number = pane(split, 0).locator('.pane-number');
  await number.dblclick();
  await expect(toolbar).toBeHidden();
  await expect(split.getByRole('button', { name: '上部ツールバーを開く' })).toBeVisible();
  await number.focus();
  await split.keyboard.press('Escape');
  await expect(toolbar).toBeVisible();
  await expect(split.getByRole('button', { name: '上部ツールバーを開く' })).toBeHidden();
});

test('R-52 最大化前に手動で隠した上部バーも解除後に再表示する', async ({ split }) => {
  await split.getByRole('button', { name: '上部ツールバーを閉じる' }).click();
  const toolbar = split.locator('.toolbar');
  const number = pane(split, 0).locator('.pane-number');
  const reopen = await split.getByRole('button', { name: '上部ツールバーを開く' }).boundingBox();
  const numberBox = await number.boundingBox();
  expect(reopen!.x).toBeLessThan(5);
  expect(reopen!.x + reopen!.width).toBeLessThanOrEqual(numberBox!.x);
  await number.dblclick();
  await expect(toolbar).toBeHidden();
  await number.dblclick();
  await expect(toolbar).toBeVisible();
  await expect(split.getByRole('button', { name: '上部ツールバーを開く' })).toBeHidden();
});

test('R-52 最大化枠を閉じた際も元のツールバー表示に戻る', async ({ split }) => {
  await pane(split, 0).locator('.pane-number').dblclick();
  await expect(split.locator('.toolbar')).toBeHidden();
  await pane(split, 0).getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(split.locator('.toolbar')).toBeVisible();
});
