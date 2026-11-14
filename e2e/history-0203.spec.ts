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

test('R-99 日本語入力の変換中（英字を含む）でも候補を出し、Enterは変換の確定後にだけ効く', async ({ split, context }) => {
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  await input.focus();
  // macOS の日本語入力で Shift を押しながら打った「YOutube」は、確定するまで変換中の文字として届く。
  await input.evaluate(element => {
    const field = element as HTMLInputElement;
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    field.value = 'YOutube';
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: 'YOutube', isComposing: true }));
  });
  const list = split.getByRole('listbox', { name: 'アドレスの候補' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('option', { name: /https:\/\/www\.youtube\.com\// })).toBeVisible();
  await expect(list.getByRole('option', { name: /Google で「YOutube」を検索/ })).toHaveAttribute('aria-selected', 'true');
  const pages = context.pages().length;
  await input.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
  await expect(pane(split, 0).locator('iframe')).toHaveCount(0);
  await expect(input).toHaveValue('YOutube');
  await input.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'YOutube' })));
  await expect(list.getByRole('option', { name: /Google で「YOutube」を検索/ })).toHaveAttribute('aria-selected', 'true');
  await input.press('Enter');
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('search-result')).toHaveText('search-result');
  expect(new URL(await input.inputValue()).searchParams.get('q')).toBe('YOutube');
  expect(context.pages()).toHaveLength(pages);
});

test('R-98 閉じたタブのページを Chrome の閲覧履歴から題名付きで候補にし、選ぶとその枠で開く', async ({ split, context }) => {
  expect(await split.evaluate(() => typeof chrome.history?.search)).toBe('function');
  const url = site('b', '/page2?from-history');
  const visited = await context.newPage(); await visited.goto(url);
  await expect(visited.getByTestId('marker')).toHaveText('page2');
  await visited.close();
  await split.bringToFront();
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  await input.click(); await input.pressSequentially('page2?from', { delay: 20 });
  const list = split.getByRole('listbox', { name: 'アドレスの候補' });
  const option = list.getByRole('option', { name: /Fixture \/page2/ });
  await expect(option).toBeVisible();
  await expect(option).toContainText(url);
  // The closed tab is not an open tab, and no view saved this URL: history is the only source that knows its title.
  await expect(pane(split, 1).getByRole('list', { name: '開いているタブ' }).getByRole('listitem').filter({ hasText: 'from-history' })).toHaveCount(0);
  await option.click();
  await expect(pane(split, 0).frameLocator('iframe').getByTestId('marker')).toHaveText('page2');
  await expect(input).toHaveValue(url);
});

test('R-98 閲覧履歴の候補は一致する語がなければ出ず、候補の上限6件も変わらない', async ({ split, context }) => {
  for (const index of [0, 1, 2, 3, 4, 5, 6]) {
    const visited = await context.newPage(); await visited.goto(site('b', `/plain?many=${index}`));
    await expect(visited.getByTestId('marker')).toHaveText('plain'); await visited.close();
  }
  await split.bringToFront();
  const input = pane(split, 0).getByRole('combobox', { name: 'アドレス' });
  await input.click(); await input.pressSequentially('plain?many', { delay: 20 });
  const list = split.getByRole('listbox', { name: 'アドレスの候補' });
  await expect(list.getByRole('option')).toHaveCount(6);
  await expect(list.getByRole('option').last()).toContainText('Google で');
  await input.fill('nothing-matches-this');
  await expect(list.getByRole('option')).toHaveCount(1);
  await expect(list.getByRole('option')).toContainText('Google で');
});
