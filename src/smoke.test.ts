import { expect, test } from 'vitest';

test('M0 manifest は外部からの接続を許可しない', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile('static/manifest.json', 'utf8'));
  expect(manifest.manifest_version).toBe(3);
  expect(manifest).not.toHaveProperty('web_accessible_resources');
  expect(manifest).not.toHaveProperty('externally_connectable');
  expect(Object.values(manifest.commands).filter((command: unknown) => Boolean((command as { suggested_key?: unknown }).suggested_key)).length).toBeLessThanOrEqual(4);
});
