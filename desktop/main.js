const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { registerFileHandlers } = require('./ipc-handlers');

const isDev = process.env.NODE_ENV === 'development';
const iconPath = path.join(__dirname, '..', 'build', 'icon.jpg');
const appIcon = fs.existsSync(iconPath) ? iconPath : undefined;
let mainWindow = null;

function applyAppIcon() {
  if (!appIcon) return;
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIcon);
  }
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 800,
    minHeight: 520,
    title: '文件管理',
    icon: appIcon,
    backgroundColor: '#f5f7fa',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  applyAppIcon();
  registerFileHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  createWindow();
});
