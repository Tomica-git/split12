import { test, expect, openUrl, pane, site } from './fixtures';

test('R-14 使い方を何度でも開き対象を示しながら9ステップを見直せる', async ({ split }, testInfo) => {
  const guide = split.getByRole('button', { name: '使い方', exact: true });
  const tour = split.getByRole('dialog', { name: 'Split12 の使い方' });
  await expect(tour).not.toBeVisible();
  await guide.click();
  await expect(tour.getByRole('heading')).toHaveText('表示する枠を増やす・減らす');
  await expect(tour.getByText('1 / 9', { exact: true })).toBeVisible();
  await expect(tour.getByRole('button', { name: '← 戻る' })).toBeDisabled();
  const target = (await split.getByRole('group', { name: 'ペイン数' }).boundingBox())!;
  const highlight = (await tour.locator('.tour-spotlight').boundingBox())!;
  expect(highlight.x).toBeLessThanOrEqual(target.x);
  expect(highlight.x + highlight.width).toBeGreaterThanOrEqual(target.x + target.width);
  await split.screenshot({ path: testInfo.outputPath('tour-light.png') });
  await tour.getByRole('button', { name: '次へ →', exact: true }).click();
  await expect(tour.getByRole('heading')).toHaveText('選んだ枠を分割する');
  await tour.getByRole('button', { name: '← 戻る' }).click();
  await expect(tour.getByText('1 / 9', { exact: true })).toBeVisible();
  for (let step = 2; step <= 9; step++) {
    await tour.getByRole('button', { name: '次へ →', exact: true }).click();
    await expect(tour.getByText(`${step} / 9`, { exact: true })).toBeVisible();
  }
  await tour.getByRole('button', { name: '完了', exact: true }).click();
  await expect(tour).not.toBeVisible();
  await expect(guide).toBeFocused();
  await guide.click();
  await expect(tour.getByText('1 / 9', { exact: true })).toBeVisible();
  await tour.getByRole('button', { name: 'ツアーを終了' }).click();
  await expect(guide).toBeFocused();
});

test('R-14 R-03 ツアーはページ・配置・履歴を変更せずショートカットの誤操作を防ぐ', async ({ split, context, sw }) => {
  await openUrl(split, 0, site('a', '/token'));
  const token = pane(split, 0).frameLocator('iframe').getByTestId('token');
  const original = await token.textContent();
  const tabs = context.pages().length;
  const bounds = await pane(split, 0).boundingBox();
  await expect.poll(() => sw.evaluate(async () => {
    const { workspace } = await chrome.storage.local.get('workspace');
    return (workspace as { panes: Array<{ url: string }> } | undefined)?.panes[0]?.url;
  })).toBe(site('a', '/token'));
  const workspace = await sw.evaluate(async () => JSON.stringify((await chrome.storage.local.get('workspace')).workspace));
  await split.getByRole('button', { name: '使い方', exact: true }).click();
  const tour = split.getByRole('dialog', { name: 'Split12 の使い方' });
  await split.keyboard.press('Alt+Shift+ArrowUp');
  await sw.evaluate(async () => {
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!;
    await (globalThis as unknown as { __split8Test: { handleCommand(command: string, tab: chrome.tabs.Tab): Promise<void> } }).__split8Test.handleCommand('pane-increase', tab);
  });
  for (let step = 2; step <= 9; step++) await tour.getByRole('button', { name: '次へ →', exact: true }).click();
  await tour.getByRole('button', { name: '完了', exact: true }).click();
  await expect(token).toHaveText(original!);
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('4');
  expect(await pane(split, 0).boundingBox()).toEqual(bounds);
  expect(context.pages()).toHaveLength(tabs);
  expect(await sw.evaluate(async () => JSON.stringify((await chrome.storage.local.get('workspace')).workspace))).toBe(workspace);
  // Existing actions work normally once the tour has closed.
  await split.getByRole('spinbutton', { name: '表示数', exact: true }).fill('5'); await split.getByRole('spinbutton', { name: '表示数', exact: true }).press('Enter');
  await expect(split.getByRole('spinbutton', { name: '表示数', exact: true })).toHaveValue('5');
});

test('R-14 キーボードでツアーを移動し終了後は元の使い方ボタンに戻る', async ({ split }) => {
  const guide = split.getByRole('button', { name: '使い方', exact: true });
  await guide.click();
  const tour = split.getByRole('dialog', { name: 'Split12 の使い方' });
  await split.keyboard.press('ArrowRight');
  await expect(tour.getByText('2 / 9', { exact: true })).toBeVisible();
  await split.keyboard.press('ArrowLeft');
  await expect(tour.getByText('1 / 9', { exact: true })).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await split.keyboard.press('Tab');
    expect(await tour.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await split.keyboard.press('Shift+Tab');
  expect(await tour.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await split.keyboard.press('Escape');
  await expect(tour).not.toBeVisible();
  await expect(guide).toBeFocused();
});

test('R-14 最大化・狭い画面・ダーク表示でもガイドを画面内で読める', async ({ split }, testInfo) => {
  await pane(split, 2).locator('.pane-number').dblclick();
  await split.getByRole('button', { name: '上部ツールバーを開く' }).click();
  await split.setViewportSize({ width: 460, height: 520 });
  await split.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await split.getByRole('button', { name: '使い方', exact: true }).click();
  const tour = split.getByRole('dialog', { name: 'Split12 の使い方' });
  for (let step = 1; step <= 9; step++) {
    await expect(tour.getByText(`${step} / 9`, { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const rect = await tour.locator('.tour-card').boundingBox();
      const viewport = split.viewportSize()!;
      return Boolean(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height);
    }).toBe(true);
    if (step === 6) {
      const highlight = (await tour.locator('.tour-spotlight').boundingBox())!;
      const active = (await pane(split, 2).boundingBox())!;
      expect(highlight.y).toBeGreaterThanOrEqual(active.y);
      await split.screenshot({ path: testInfo.outputPath('tour-dark.png') });
    }
    if (step < 9) await tour.getByRole('button', { name: '次へ →', exact: true }).click();
    if (step === 4) await split.setViewportSize({ width: 620, height: 440 });
  }
  await tour.getByRole('button', { name: '完了', exact: true }).click();
  await expect(pane(split, 2).locator('.pane-number')).toHaveAttribute('aria-label', /元に戻す/);
});
