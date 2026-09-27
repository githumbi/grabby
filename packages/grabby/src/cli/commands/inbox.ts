import { spawn } from 'child_process';
import { findProjectRoot } from '../utils/detect-stack';
import { readProjectConfig, type ProjectConfig } from '../utils/project-config';

export function sharedConfig(cwd?: string): ProjectConfig {
  const config = readProjectConfig(findProjectRoot(cwd));
  if (!config) throw new Error('this project isn\'t shared yet. Run: npx @githumbi/grabby share');
  return config;
}

/** Opens the private inbox link in the default browser (and prints it). */
export async function openInbox(options: { cwd?: string; print?: boolean } = {}): Promise<void> {
  const { inbox } = sharedConfig(options.cwd);
  if (!inbox) throw new Error('no inbox link saved. Run: npx @githumbi/grabby share --rotate');
  console.log(`\x1b[36m[grabby]\x1b[0m Your inbox (private, don't share it): ${inbox}`);
  if (options.print || !process.stdout.isTTY) return;
  // No shell: the URL is passed as a single argument.
  const [cmd, args] = process.platform === 'darwin' ? ['open', [inbox]]
    : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', inbox]]
      : ['xdg-open', [inbox]];
  spawn(cmd, args as string[], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}
