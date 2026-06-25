/**
 * 启动 Electron 桌面版
 * 清除 ELECTRON_RUN_AS_NODE，避免在 Cursor 等环境中以 Node 模式运行导致 API 失效
 */
const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

if (!env.NODE_ENV) {
  env.NODE_ENV = 'development';
}

const child = spawn(electronPath, ['.'], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
