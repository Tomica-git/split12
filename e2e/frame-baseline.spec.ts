import { test, expect, site } from './fixtures';

test('通常ページのクロスオリジン iframe のリンクをクリックできる', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(site('a', `/frame?src=${encodeURIComponent(site('b', '/link'))}`));
  const frame = page.frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('link');
  await frame.getByTestId('link').click();
  await expect(frame.getByTestId('marker')).toHaveText('page2');
});
test('通常ページの sandbox iframe のリンクをクリックできる', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(site('a', `/frame?sandbox=1&src=${encodeURIComponent(site('b', '/link'))}`));
  const frame = page.frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('link');
  await frame.getByTestId('link').hover();
  await expect.poll(() => frame.getByTestId('link').evaluate(element => element.matches(':hover'))).toBe(true);
  await frame.getByTestId('link').click();
  await expect(frame.getByTestId('marker')).toHaveText('page2');
});
for (const boot of [false, true]) {
  test(`拡張ページの最小 iframe のリンクをクリックできる boot=${boot}`, async ({ split }) => {
    await split.evaluate(({ url, boot }) => {
      document.body.replaceChildren();
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads');
      frame.style.cssText = 'width: 600px; height: 300px';
      frame.src = boot ? `${chrome.runtime.getURL('pane-boot.html')}?pane=99&to=${encodeURIComponent(url)}` : url;
      document.body.append(frame);
    }, { url: site('b', '/link'), boot });
    const frame = split.frameLocator('iframe');
    await expect(frame.getByTestId('marker')).toHaveText('link');
    const bounds = await split.locator('iframe').boundingBox();
    if (bounds) await split.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 20 });
    await frame.getByTestId('link').click();
    await expect(frame.getByTestId('marker')).toHaveText('page2');
  });
}
test('拡張ページの最小 iframe をスタイルなしで操作できる', async ({ split }) => {
  await split.evaluate(url => {
    document.querySelector('link[rel="stylesheet"]')?.remove();
    document.body.replaceChildren();
    const frame = document.createElement('iframe');
    frame.src = url; frame.width = '600'; frame.height = '300'; document.body.append(frame);
  }, site('b', '/link'));
  const frame = split.frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('link');
  const bounds = await split.locator('iframe').boundingBox();
  if (bounds) await split.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 20 });
  await frame.getByTestId('link').click();
  await expect(frame.getByTestId('marker')).toHaveText('page2');
});
test('分割画面の処理を持たない拡張ページの iframe を操作できる', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pane-boot.html`);
  await page.evaluate(url => {
    const frame = document.createElement('iframe');
    frame.src = url; frame.width = '600'; frame.height = '300'; document.body.append(frame);
  }, site('b', '/link'));
  const frame = page.frameLocator('iframe');
  await expect(frame.getByTestId('marker')).toHaveText('link');
  await frame.getByTestId('link').click();
  await expect(frame.getByTestId('marker')).toHaveText('page2');
});
