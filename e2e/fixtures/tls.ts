import https from 'node:https';
import type { RequestListener } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { launch } from '../fixtures';

// Real HTTPS and Cookie handling, without sending test traffic to the public hosts.
export async function localTlsContext(profile: string, hosts: string[], handler: RequestListener) {
  const keyPath = join(profile, 'test-key.pem');
  const certPath = join(profile, 'test-cert.pem');
  await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', `/CN=${hosts[0]}`, '-days', '1']);
  const server = https.createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, handler);
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as { port: number }).port;
  try {
    const context = await launch(profile, { resolver: [...hosts.map(host => `MAP ${host} 127.0.0.1:${port}`), 'MAP *.test 127.0.0.1'].join(', '), testTls: true });
    return { context, async close() { await context.close(); server.close(); } };
  } catch (error) { server.close(); throw error; }
}
