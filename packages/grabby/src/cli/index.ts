import { init } from './commands/init';
import { addMcp } from './commands/add-mcp';

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

function run(fn: () => Promise<void>): void {
  fn().catch((err) => {
    console.error('\x1b[31mError:\x1b[0m', err.message);
    process.exit(1);
  });
}

if (command === 'init' || !command) {
  run(init);
} else if (command === 'add' && subcommand === 'mcp') {
  run(addMcp);
} else {
  console.error(`Unknown command: ${args.join(' ')}`);
  console.log('\nUsage:');
  console.log('  npx grabby init      Set up grabby in your project');
  console.log('  npx grabby add mcp   Add MCP server for AI coding agents');
  process.exit(1);
}
