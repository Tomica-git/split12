import { expect, test } from 'vitest';
import { normalizeDisplayName } from './names';
import { parseTemplates, shapeFromWorkspace, templateCandidates, treeForOrder } from './templates';
import { defaultWorkspace } from './workspace';
import { defaultTree, validTree } from './splitTree';
import { mapTree } from './workspaceOperations';

test('R-27 テンプレートは表示順に従う配置のみでURL・倍率・固定を含まない', () => {
  const workspace = defaultWorkspace();
  workspace.order = [2, 0, 3, 1, 4, 5, 6, 7, 8, 9, 10, 11];
  workspace.layout = mapTree(defaultTree(4, 'landscape', true), workspace.order);
  workspace.fixedSlot = 2; workspace.panes[2] = { url: 'https://example.test/private', zoom: .67 };
  const shape = shapeFromWorkspace(workspace);
  expect(treeForOrder(shape, workspace.order)).toEqual(workspace.layout);
  expect(JSON.stringify(shape)).not.toMatch(/url|zoom|fixed|https/);
});
test('R-27 破損したテンプレートを除き余計な保存情報を取り除く', () => {
  const item = { id: '12345678-1234-1234-1234-123456789012', name: '配置', createdAt: 1, updatedAt: 1, count: 1, orientation: 'landscape', tree: { pane: 0, url: 'secret' }, url: 'secret' };
  const result = parseTemplates({ schemaVersion: 1, templates: [item, item, { ...item, id: 'bad' }] });
  expect(result).toHaveLength(1); expect(result[0]!.tree).toEqual({ pane: 0 });
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(parseTemplates({ schemaVersion: 2, templates: [item] })).toEqual([]);
});
test('R-27 1〜12枚の配置候補は有効で重複せず決定的に生成される', () => {
  for (let count = 1; count <= 12; count++) {
    const candidates = templateCandidates(count);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(item => validTree(item.tree, count))).toBe(true);
    expect(new Set(candidates.map(item => JSON.stringify(item.tree))).size).toBe(candidates.length);
    expect(templateCandidates(count)).toEqual(candidates);
  }
});
test('R-28 名前は制御文字・方向制御を除去し空名を受け付けない', () => {
  expect(normalizeDisplayName('  仕事\u202e用\n  ', 60)).toBe('仕事用');
  expect(normalizeDisplayName(' \u202e ', 60)).toBeNull();
  expect(normalizeDisplayName('😀a', 1)).toBe('😀');
});
