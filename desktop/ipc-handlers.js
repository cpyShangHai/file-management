const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { ipcMain, dialog, shell, clipboard, nativeImage, app } = require('electron');
const remoteFs = require('./remote-fs');

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.css', '.html',
  '.xml', '.yaml', '.yml', '.csv', '.log', '.env', '.py', '.java', '.go',
  '.rs', '.sh', '.sql', '.ini', '.cfg', '.conf',
]);

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico', '.svg',
]);

const IMAGE_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

const HANDLERS = {
  'fs:getQuickAccess': () => getQuickAccessPaths(),
  'fs:getHomePath': () => os.homedir(),
  'fs:readDirectory': (_event, dirPath) => readDirectory(dirPath),
  'fs:selectDirectory': async (_event, title) => selectDirectory(title),
  'fs:selectFiles': async (_event, title) => selectFiles(title),
  'fs:createFolder': (_event, parentPath, name) => createFolder(parentPath, name),
  'fs:createFile': (_event, parentPath, name) => createFile(parentPath, name),
  'fs:rename': (_event, oldPath, newName) => renameEntry(oldPath, newName),
  'fs:delete': (_event, targetPaths) => deleteEntries(targetPaths),
  'fs:move': (_event, sourcePaths, destDir) => moveEntries(sourcePaths, destDir),
  'fs:copy': (_event, sourcePaths, destDir) => copyEntries(sourcePaths, destDir),
  'fs:duplicate': (_event, sourcePaths) => duplicateEntries(sourcePaths),
  'fs:importFiles': (_event, destDir, sourcePaths) => importFiles(destDir, sourcePaths),
  'fs:readTextFile': (_event, filePath, maxBytes) => readTextFile(filePath, maxBytes),
  'fs:readImageFile': (_event, filePath, maxBytes) => readImageFile(filePath, maxBytes),
  'fs:openPath': (event, targetPath, options) => openPath(event, targetPath, options),
  'fs:getRemoteCacheDir': () => remoteFs.getRemoteCacheDir(),
  'fs:pickRemoteDownloadDir': async () => {
    const result = await dialog.showOpenDialog({
      title: '选择远程文件下载保存位置',
      buttonLabel: '选择',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return remoteFs.setRemoteDownloadDir(result.filePaths[0]);
  },
  'fs:showInFolder': (_event, targetPath) => showInFolder(targetPath),
  'fs:openInTerminal': (_event, targetPath) => openInTerminal(targetPath),
  'fs:getParentPath': (_event, targetPath) => getParentPath(targetPath),
  'fs:writeClipboard': (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  },
  'fs:getEntriesInfo': (_event, targetPaths) => getEntriesInfo(targetPaths),
  'fs:cancelDownload': (_event, downloadId) => remoteFs.cancelDownload(downloadId),
  'remote:connect': async (_event, config) => {
    try {
      return { ok: true, data: await remoteFs.connect(config) };
    } catch (err) {
      return { ok: false, error: err?.message || '连接失败' };
    }
  },
  'remote:disconnect': (_event, connId) => remoteFs.disconnect(connId),
  'remote:getConnections': () => remoteFs.getSavedConnections(),
  'remote:deleteConnection': (_event, connId) => remoteFs.deleteSavedConnection(connId),
  'remote:getSavedPassword': (_event, connId) => ({
    password: remoteFs.getSavedConnectionPassword(connId) || '',
  }),
  'remote:getActive': () => remoteFs.getActiveConnections(),
  'remote:setEncoding': (_event, connId, encoding) => remoteFs.setEncoding(connId, encoding),
  'remote:getEncodings': () => remoteFs.SUPPORTED_ENCODINGS,
};

function shellQuote(str) {
  return `'${String(str).replace(/'/g, `'\\''`)}'`;
}

function resolveTerminalCwd(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    throw new Error('路径不存在');
  }
  const stat = fs.statSync(resolved);
  return stat.isDirectory() ? resolved : path.dirname(resolved);
}

function openInTerminal(targetPath) {
  if (remoteFs.isRemotePath(targetPath)) {
    throw new Error('远程路径不支持在终端中打开');
  }
  const cwd = resolveTerminalCwd(targetPath);
  const cdCmd = `cd ${shellQuote(cwd)} && clear`;
  let child;

  if (process.platform === 'darwin') {
    child = spawn('osascript', [
      '-e', 'tell application "Terminal" to activate',
      '-e', `tell application "Terminal" to do script "${cdCmd.replace(/"/g, '\\"')}"`,
    ], { detached: true, stdio: 'ignore' });
  } else if (process.platform === 'win32') {
    child = spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${cwd}"`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child = spawn('gnome-terminal', ['--working-directory', cwd], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => {
      spawn('x-terminal-emulator', ['--working-directory', cwd], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    });
  }

  child.unref();
  return cwd;
}

function formatEntry(entryPath, dirent) {
  let stat;
  try {
    stat = fs.statSync(entryPath);
  } catch {
    return null;
  }

  const ext = dirent.isFile() ? path.extname(dirent.name).toLowerCase() : '';
  return {
    name: dirent.name,
    path: entryPath,
    isDirectory: dirent.isDirectory(),
    isFile: dirent.isFile(),
    size: stat.size,
    modified: stat.mtimeMs,
    extension: ext,
    isText: TEXT_EXTENSIONS.has(ext),
    isImage: IMAGE_EXTENSIONS.has(ext),
  };
}

function getQuickAccessPaths() {
  const home = os.homedir();
  const candidates = [
    { id: 'home', label: '主目录', icon: 'home', path: home },
    { id: 'desktop', label: '桌面', icon: 'desktop', path: path.join(home, 'Desktop') },
    { id: 'documents', label: '文档', icon: 'documents', path: path.join(home, 'Documents') },
    { id: 'downloads', label: '下载', icon: 'downloads', path: path.join(home, 'Downloads') },
    { id: 'pictures', label: '图片', icon: 'pictures', path: path.join(home, 'Pictures') },
    { id: 'music', label: '音乐', icon: 'music', path: path.join(home, 'Music') },
    { id: 'videos', label: '视频', icon: 'videos', path: path.join(home, 'Movies') },
  ];

  return candidates.filter((item) => {
    try {
      return fs.existsSync(item.path) && fs.statSync(item.path).isDirectory();
    } catch {
      return false;
    }
  });
}

function getParentPath(targetPath) {
  if (remoteFs.isRemotePath(targetPath)) {
    return remoteFs.getParentPath(targetPath);
  }
  const parent = path.dirname(path.resolve(targetPath));
  return parent === targetPath ? null : parent;
}

async function openPath(event, targetPath, options = {}) {
  const emit = (data) => {
    if (event?.sender && !event.sender.isDestroyed()) {
      event.sender.send('fs:downloadProgress', data);
    }
  };

  try {
    const localPath = remoteFs.isRemotePath(targetPath)
      ? await remoteFs.openRemotePath(targetPath, {
        fileSize: Number(options?.fileSize) || 0,
        onProgress: emit,
      })
      : path.resolve(targetPath);
    if (!localPath) return null;
    const result = await shell.openPath(localPath);
    if (result) {
      throw new Error(`无法用系统应用打开：${result}`);
    }
    return localPath;
  } catch (err) {
    if (remoteFs.isRemotePath(targetPath)) {
      emit({
        phase: 'error',
        error: err?.message || '无法打开文件',
        fileName: options?.fileName || path.basename(String(targetPath)),
        localPath: options?.localPath,
      });
    }
    throw new Error(err?.message || '无法打开文件');
  }
}

function showInFolder(targetPath) {
  if (remoteFs.isRemotePath(targetPath)) {
    throw new Error('远程文件不支持在 Finder 中显示');
  }
  shell.showItemInFolder(path.resolve(targetPath));
  return true;
}

function readDirectory(dirPath) {
  if (remoteFs.isRemotePath(dirPath)) {
    return remoteFs.readDirectory(dirPath);
  }

  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('无效的路径');
  }

  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved)) {
    throw new Error('目录不存在');
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error('不是有效的目录');
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true })
    .map((dirent) => formatEntry(path.join(resolved, dirent.name), dirent))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' });
    });

  return { path: resolved, entries };
}

async function selectDirectory(title = '选择文件夹') {
  const result = await dialog.showOpenDialog({
    title,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
}

async function selectFiles(title = '选择文件') {
  const result = await dialog.showOpenDialog({
    title,
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
}

function sanitizeName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('名称不能为空');
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('名称不能包含路径分隔符');
  }
  return trimmed;
}

function createFolder(parentPath, name) {
  if (remoteFs.isRemotePath(parentPath)) {
    return remoteFs.createFolder(parentPath, name);
  }
  const folderName = sanitizeName(name);
  const target = path.join(path.resolve(parentPath), folderName);
  if (fs.existsSync(target)) throw new Error('该名称已存在');
  fs.mkdirSync(target);
  return target;
}

function createFile(parentPath, name) {
  if (remoteFs.isRemotePath(parentPath)) {
    return remoteFs.createFile(parentPath, name);
  }
  const fileName = sanitizeName(name);
  const target = path.join(path.resolve(parentPath), fileName);
  if (fs.existsSync(target)) throw new Error('该名称已存在');
  fs.writeFileSync(target, '');
  return target;
}

function renameEntry(oldPath, newName) {
  if (remoteFs.isRemotePath(oldPath)) {
    return remoteFs.renameEntry(oldPath, newName);
  }
  const trimmed = sanitizeName(newName);
  const resolved = path.resolve(oldPath);
  const target = path.join(path.dirname(resolved), trimmed);
  if (fs.existsSync(target)) throw new Error('该名称已存在');
  fs.renameSync(resolved, target);
  return target;
}

function deleteEntries(targetPaths) {
  const paths = Array.isArray(targetPaths) ? targetPaths : [targetPaths];
  if (paths.some((item) => remoteFs.isRemotePath(item))) {
    return remoteFs.deleteEntries(targetPaths);
  }
  for (const item of paths) {
    const resolved = path.resolve(item);
    if (!fs.existsSync(resolved)) continue;
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  return true;
}

function readTextFile(filePath, maxBytes = 512 * 1024) {
  if (remoteFs.isRemotePath(filePath)) {
    return remoteFs.readTextFile(filePath, maxBytes);
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error('文件不存在');
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('不是有效的文件');
  if (stat.size > maxBytes) {
    return {
      truncated: true,
      content: fs.readFileSync(resolved, 'utf8').slice(0, maxBytes),
      size: stat.size,
    };
  }
  return {
    truncated: false,
    content: fs.readFileSync(resolved, 'utf8'),
    size: stat.size,
  };
}

function readImageFile(filePath, maxBytes = 20 * 1024 * 1024) {
  if (remoteFs.isRemotePath(filePath)) {
    return remoteFs.readImageFile(filePath, maxBytes);
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error('文件不存在');
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('不是有效的文件');

  const ext = path.extname(resolved).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) throw new Error('不是支持的图片格式');
  if (stat.size > maxBytes) {
    throw new Error(`图片过大（${Math.round(stat.size / 1024 / 1024)}MB），请用系统应用打开`);
  }

  const mime = IMAGE_MIME[ext] || 'application/octet-stream';
  const buffer = fs.readFileSync(resolved);
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;

  let width = 0;
  let height = 0;
  try {
    const img = nativeImage.createFromPath(resolved);
    if (!img.isEmpty()) {
      const size = img.getSize();
      width = size.width;
      height = size.height;
    }
  } catch { /* ignore */ }

  return { dataUrl, width, height, size: stat.size, mime };
}

function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  if (parent === child) return true;
  const rel = path.relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`);
}

function validateTransfer(sourcePaths, destDir) {
  const dest = path.resolve(destDir);
  if (!fs.existsSync(dest) || !fs.statSync(dest).isDirectory()) {
    throw new Error('目标不是有效的文件夹');
  }

  for (const src of sourcePaths) {
    const resolved = path.resolve(src);
    if (!fs.existsSync(resolved)) {
      throw new Error(`源不存在: ${path.basename(resolved)}`);
    }
    if (isPathInside(resolved, dest)) {
      throw new Error(`不能将「${path.basename(resolved)}」移动到其自身或子目录中`);
    }
    const target = path.join(dest, path.basename(resolved));
    if (path.resolve(target) === resolved) {
      throw new Error(`「${path.basename(resolved)}」已在当前位置`);
    }
  }
}

function uniqueDestPath(destDir, baseName) {
  const dir = path.resolve(destDir);
  let candidate = path.join(dir, baseName);
  if (!fs.existsSync(candidate)) return candidate;

  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

function moveEntries(sourcePaths, destDir) {
  const paths = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
  const hasRemote = paths.some((item) => remoteFs.isRemotePath(item)) || remoteFs.isRemotePath(destDir);
  if (hasRemote) {
    return remoteFs.moveEntries(sourcePaths, destDir);
  }
  validateTransfer(paths, destDir);

  const results = [];
  for (const src of paths) {
    const resolved = path.resolve(src);
    const base = path.basename(resolved);
    const dest = path.join(path.resolve(destDir), base);
    if (fs.existsSync(dest)) {
      throw new Error(`目标位置已存在「${base}」`);
    }
    fs.renameSync(resolved, dest);
    results.push(dest);
  }
  return results;
}

function copyEntries(sourcePaths, destDir) {
  const paths = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
  const hasRemote = paths.some((item) => remoteFs.isRemotePath(item)) || remoteFs.isRemotePath(destDir);
  if (hasRemote) {
    return remoteFs.copyEntries(sourcePaths, destDir);
  }
  validateTransfer(paths, destDir);

  const results = [];
  for (const src of paths) {
    const resolved = path.resolve(src);
    const base = path.basename(resolved);
    const dest = uniqueDestPath(destDir, base);
    fs.cpSync(resolved, dest, { recursive: true });
    results.push(dest);
  }
  return results;
}

function duplicateEntries(sourcePaths) {
  const paths = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
  if (paths.some((item) => remoteFs.isRemotePath(item))) {
    return remoteFs.duplicateEntries(sourcePaths);
  }
  const results = [];

  for (const src of paths) {
    const resolved = path.resolve(src);
    if (!fs.existsSync(resolved)) continue;

    const dir = path.dirname(resolved);
    const ext = path.extname(resolved);
    const base = path.basename(resolved, ext);
    let candidate = `${base} 副本${ext}`;
    let n = 2;
    while (fs.existsSync(path.join(dir, candidate))) {
      candidate = `${base} 副本 ${n}${ext}`;
      n += 1;
    }
    const dest = path.join(dir, candidate);
    fs.cpSync(resolved, dest, { recursive: true });
    results.push(dest);
  }
  return results;
}

function importFiles(destDir, sourcePaths) {
  return copyEntries(sourcePaths, destDir);
}

function getEntriesInfo(targetPaths) {
  const paths = Array.isArray(targetPaths) ? targetPaths : [targetPaths];
  if (paths.some((item) => remoteFs.isRemotePath(item))) {
    return remoteFs.getEntriesInfo(targetPaths);
  }
  let files = 0;
  let folders = 0;
  let totalSize = 0;

  for (const item of paths) {
    const resolved = path.resolve(item);
    if (!fs.existsSync(resolved)) continue;
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      folders += 1;
    } else {
      files += 1;
      totalSize += stat.size;
    }
  }

  return { count: paths.length, files, folders, totalSize };
}

function registerFileHandlers() {
  remoteFs.init(app.getPath('userData'), { downloadsPath: app.getPath('downloads') });

  for (const [channel, handler] of Object.entries(HANDLERS)) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, handler);
  }
}

module.exports = { registerFileHandlers };
