const { spawn } = require('child_process');
const child = spawn('npx -y @githumbi/grabby-server@latest', { stdio: 'inherit', shell: true });
child.on('exit', code => process.exit(code ?? 0));
