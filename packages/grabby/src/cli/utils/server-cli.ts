import { spawn } from 'child_process';
import { SERVER_PACKAGE } from '../versions';

/**
 * Runs @githumbi/grabby-server (pinned) with `args`. GRABBY_SERVER_BIN
 * points at a local build instead, for developing Grabby itself.
 */
export function runServer(args: string[], options: { captureStdout?: boolean; env?: Record<string, string | undefined>; cwd?: string } = {}): Promise<{ code: number; stdout: string }> {
  const local = process.env.GRABBY_SERVER_BIN;
  const windows = process.platform === 'win32';
  const argv = local ? [local, ...args] : ['-y', SERVER_PACKAGE, ...args];
  // npx is a .cmd on Windows, which Node only runs through a shell. Only
  // pass plain flag/value characters so nothing can be interpreted by it.
  if (!local && windows && !argv.every((a) => /^[\w@./:=,+-]+$/.test(a))) {
    return Promise.reject(new Error(`unsupported characters in arguments; run it directly: npx ${argv.join(' ')}`));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(local ? process.execPath : windows ? 'npx.cmd' : 'npx', argv, {
      stdio: ['inherit', options.captureStdout ? 'pipe' : 'inherit', 'inherit'],
      shell: !local && windows,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout }));
  });
}
