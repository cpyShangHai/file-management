const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const ftp = require('basic-ftp');
const SftpClient = require('ssh2-sftp-client');
const { encodeFtpPath, listDirectory: ftpListDirectory, withFtpDirectory, listCurrentDirectory, retrieveFile, applyFtpControlEncoding, decodeTextBuffer, normalizeEncoding, SUPPORTED_ENCODINGS } = require('./ftp-encoding');
const { encryptPassword, decryptPassword, isAvailable: canStorePassword } = require('./credential-store');

const REMOTE_PREFIX = 'remote://';

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

const activeConnections = new Map();
const activeDownloads = new Map();

class DownloadCancelledError extends Error {
  constructor() {
    super('下载已取消');
    this.code = 'DOWNLOAD_CANCELLED';
  }
}

function isDownloadCancelledError(err) {
  return err?.code === 'DOWNLOAD_CANCELLED' || err?.message === 'DOWNLOAD_CANCELLED';
}

function cancelDownload(downloadId) {
  const entry = activeDownloads.get(downloadId);
  if (!entry) return false;
  entry.cancelled = true;
  entry.cleanup?.();
  return true;
}
let connectionsFile = '';
let settingsFile = '';
let downloadDir = '';

function loadDownloadDir() {
  if (!settingsFile || !fs.existsSync(settingsFile)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    if (typeof data.remoteDownloadDir === 'string' && data.remoteDownloadDir.trim()) {
      return path.resolve(data.remoteDownloadDir.trim());
    }
  } catch { /* ignore */ }
  return null;
}

function saveDownloadDir(dir) {
  let data = {};
  try {
    if (fs.existsSync(settingsFile)) {
      data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
  } catch { /* ignore */ }
  data.remoteDownloadDir = dir;
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2), 'utf8');
}

function init(userDataPath, options = {}) {
  connectionsFile = path.join(userDataPath, 'remote-connections.json');
  settingsFile = path.join(userDataPath, 'app-settings.json');
  const defaultDir = path.join(
    options.downloadsPath || path.join(os.homedir(), 'Downloads'),
    '文件管理下载',
  );
  downloadDir = loadDownloadDir() || defaultDir;
  fs.mkdirSync(downloadDir, { recursive: true });
}

function setRemoteDownloadDir(dir) {
  const resolved = path.resolve(String(dir || '').trim());
  if (!resolved) throw new Error('请选择有效的文件夹');
  fs.mkdirSync(resolved, { recursive: true });
  downloadDir = resolved;
  saveDownloadDir(resolved);
  return resolved;
}

function isRemotePath(targetPath) {
  return typeof targetPath === 'string' && targetPath.startsWith(REMOTE_PREFIX);
}

function normalizeRemotePath(remotePath) {
  if (!remotePath || remotePath === '/') return '/';
  let normalized = String(remotePath).replace(/\\/g, '/');
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/+/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function parseRemotePath(virtualPath) {
  if (!isRemotePath(virtualPath)) return null;
  const rest = virtualPath.slice(REMOTE_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash === -1) {
    return { connId: rest, remotePath: '/' };
  }
  return {
    connId: rest.slice(0, slash),
    remotePath: normalizeRemotePath(rest.slice(slash) || '/'),
  };
}

function buildRemotePath(connId, remotePath = '/') {
  const normalized = normalizeRemotePath(remotePath);
  if (normalized === '/') return `${REMOTE_PREFIX}${connId}`;
  return `${REMOTE_PREFIX}${connId}${normalized}`;
}

function joinRemotePath(basePath, name) {
  const base = normalizeRemotePath(basePath);
  if (base === '/') return `/${name}`;
  return `${base}/${name}`;
}

function getConnection(connId) {
  const conn = activeConnections.get(connId);
  if (!conn) throw new Error('远程连接已断开，请重新连接');
  return conn;
}

function createTaskQueue() {
  let chain = Promise.resolve();
  return {
    run(task) {
      const current = chain.then(() => task());
      chain = current.catch(() => {});
      return current;
    },
  };
}

async function ensureFtpClient(conn) {
  if (conn.protocol !== 'ftp') return;
  if (conn.client?.ftp) {
    applyFtpControlEncoding(conn.client, conn.encoding);
  }
  if (!conn.client.closed) return;
  conn.client = await connectFtpWithMode({
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: conn.password,
    secure: conn.secure,
    encoding: conn.encoding,
  }, conn.ftpPassive !== false);
}

function withConnection(connId, fn) {
  const conn = getConnection(connId);
  if (!conn.taskQueue) conn.taskQueue = createTaskQueue();
  return conn.taskQueue.run(async () => {
    await ensureFtpClient(conn);
    return fn(conn);
  });
}

function formatRemoteEntry(connId, parentPath, item) {
  const remotePath = joinRemotePath(parentPath, item.name);
  const ext = item.isFile ? path.extname(item.name).toLowerCase() : '';
  return {
    name: item.name,
    path: buildRemotePath(connId, remotePath),
    isDirectory: item.isDirectory,
    isFile: item.isFile,
    size: item.size || 0,
    modified: item.modified || 0,
    extension: ext,
    isText: TEXT_EXTENSIONS.has(ext),
    isImage: IMAGE_EXTENSIONS.has(ext),
    isRemote: true,
  };
}

function readSavedConnections() {
  if (!connectionsFile || !fs.existsSync(connectionsFile)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(connectionsFile, 'utf8'));
    if (!Array.isArray(data)) return [];
    return data.map((item) => ({
      ...item,
      host: normalizeHost(item.host),
      hasPassword: Boolean(item.passwordEnc),
    }));
  } catch {
    return [];
  }
}

function getSavedPassword(connId) {
  if (!connectionsFile || !fs.existsSync(connectionsFile)) return '';
  try {
    const data = JSON.parse(fs.readFileSync(connectionsFile, 'utf8'));
    const item = Array.isArray(data) ? data.find((row) => row.id === connId) : null;
    if (!item?.passwordEnc) return '';
    return decryptPassword(item.passwordEnc);
  } catch {
    return '';
  }
}

function getSavedConnectionPassword(connId) {
  const exists = readSavedConnections().some((item) => item.id === connId);
  if (!exists) return '';
  return getSavedPassword(connId);
}

function applyPasswordToProfile(profile, password, savePassword) {
  if (savePassword !== false && password) {
    const encrypted = encryptPassword(password);
    if (encrypted) {
      profile.passwordEnc = encrypted;
      profile.hasPassword = true;
      return;
    }
  }
  if (savePassword === false) {
    delete profile.passwordEnc;
    profile.hasPassword = false;
  }
}

function writeSavedConnections(list) {
  fs.mkdirSync(path.dirname(connectionsFile), { recursive: true });
  fs.writeFileSync(connectionsFile, JSON.stringify(list, null, 2), 'utf8');
}

function parseRemoteUrl(input) {
  const raw = String(input || '').trim();
  const match = raw.match(/^(ftps?):\/\/([^/#?]+)/i) || raw.match(/^sftp:\/\/([^/#?]+)/i);
  if (!match) return null;

  const isSftp = raw.toLowerCase().startsWith('sftp://');
  const protocol = isSftp ? 'sftp' : 'ftp';
  const secure = !isSftp && match[1].toLowerCase() === 'ftps';
  const hostPart = isSftp ? match[1] : match[2];

  let host = hostPart;
  let port = protocol === 'ftp' ? 21 : 22;
  if (hostPart.includes(':')) {
    const idx = hostPart.lastIndexOf(':');
    host = hostPart.slice(0, idx);
    port = Number(hostPart.slice(idx + 1)) || port;
  }

  return { protocol, host: host.trim(), port, secure };
}

function normalizeHost(host) {
  const parsed = parseRemoteUrl(host);
  if (parsed) return parsed.host;

  let value = String(host || '').trim();
  value = value.replace(/^(https?|ftps?|sftp):\/\//i, '');
  value = value.split('/')[0];
  value = value.replace(/:\d+$/, '');
  return value.trim();
}

function formatConnectionError(err, config) {
  const code = err?.code || '';
  const msg = String(err?.message || err || '');

  if (code === 'ENOTFOUND' || msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
    return `无法解析主机「${config.host}」，请只填写 IP 或域名（不要带 http://）`;
  }
  if (code === 'ECONNREFUSED') {
    const hint = config.protocol === 'ftp'
      ? '。若服务器实际是 SFTP，请将协议改为 SFTP，端口改为 22'
      : '。请确认 SSH 服务已开启且端口正确';
    return `连接被拒绝（${config.host}:${config.port}）${hint}`;
  }
  if (msg.includes('Timeout') || code === 'ETIMEDOUT') {
    if (config.protocol === 'ftp') {
      return `FTP 连接超时（${config.host}:${config.port}）。请确认：① 协议选 FTP、端口 21；② 用户名密码正确；③ 此服务器不支持 FTPS 时不要勾选 TLS`;
    }
    return `连接超时（${config.host}:${config.port}），请检查网络、端口和防火墙`;
  }
  if (/530|531|not logged in|login incorrect|authentication methods failed/i.test(msg)) {
    return '认证失败，请检查用户名和密码';
  }
  if (/auth|password|login|denied/i.test(msg)) {
    return '认证失败，请检查用户名和密码';
  }
  if (/501/.test(msg)) {
    const enc = config.encoding || 'gbk';
    return `FTP 命令无效（501），路径或编码可能不匹配。请尝试在工具栏切换文件编码（当前：${enc.toUpperCase()}）`;
  }
  if (/550/.test(msg) || code === 550) {
    return '找不到远程文件。请确认工具栏编码为 GBK，并重新进入该目录后再试';
  }
  return msg || '连接失败';
}

function normalizeConnectConfig(config) {
  const urlParsed = parseRemoteUrl(config.host);
  const protocol = urlParsed?.protocol || (config.protocol === 'ftp' ? 'ftp' : 'sftp');
  const host = urlParsed?.host || normalizeHost(config.host);
  if (!host) throw new Error('请填写有效的主机地址');

  return {
    ...config,
    protocol,
    host,
    port: urlParsed?.port || Number(config.port) || (protocol === 'ftp' ? 21 : 22),
    username: String(config.username || '').trim(),
    password: config.password || '',
    secure: urlParsed ? urlParsed.secure : Boolean(config.secure),
    encoding: normalizeEncoding(config.encoding),
    savePassword: config.savePassword !== false,
  };
}

function mergeWithSavedConnection(config) {
  if (!config?.id) return config;
  const saved = readSavedConnections().find((item) => item.id === config.id);
  if (!saved) return config;
  return {
    name: saved.name,
    protocol: saved.protocol,
    host: saved.host,
    port: saved.port,
    username: saved.username,
    secure: saved.secure,
    encoding: saved.encoding,
    ...config,
    id: config.id,
  };
}

function isFtpAuthError(err) {
  const msg = String(err?.message || '');
  return /530|531|not logged in|login incorrect|invalid user/i.test(msg);
}

async function connectFtpWithMode(config, passive) {
  const client = new ftp.Client(30_000);
  client.ftp.verbose = false;
  client.ftp.passive = passive;
  await client.access({
    host: config.host,
    port: config.port || 21,
    user: config.username,
    password: config.password || '',
    secure: Boolean(config.secure),
  });
  applyFtpControlEncoding(client, config.encoding || 'gbk');
  await ftpListDirectory(client, '/', config.encoding || 'gbk');
  return client;
}

async function connectFtp(config) {
  if (config.secure) {
    const client = await connectFtpWithMode(config, true);
    client._ftpPassive = true;
    return client;
  }

  let lastErr;
  for (const passive of [true, false]) {
    try {
      const client = await connectFtpWithMode(config, passive);
      client._ftpPassive = passive;
      return client;
    } catch (err) {
      lastErr = err;
      if (isFtpAuthError(err)) throw err;
    }
  }
  throw lastErr;
}

async function connectSftp(config) {
  const client = new SftpClient();
  await client.connect({
    host: config.host,
    port: config.port || 22,
    username: config.username,
    password: config.password || '',
    readyTimeout: 20_000,
  });
  return client;
}

async function connect(config) {
  const merged = mergeWithSavedConnection(config);
  const normalized = normalizeConnectConfig(merged);
  const id = normalized.id || randomUUID();

  if (!normalized.password) {
    normalized.password = getSavedPassword(id);
  }
  if (!normalized.password) {
    throw new Error('请填写密码');
  }

  if (activeConnections.has(id)) {
    await disconnect(id);
  }

  let client;
  try {
    client = normalized.protocol === 'ftp'
      ? await connectFtp(normalized)
      : await connectSftp(normalized);
  } catch (err) {
    throw new Error(formatConnectionError(err, normalized));
  }

  const profile = {
    id,
    name: normalized.name || `${normalized.username}@${normalized.host}`,
    protocol: normalized.protocol,
    host: normalized.host,
    port: normalized.port,
    username: normalized.username,
    secure: Boolean(normalized.secure),
    encoding: normalized.encoding,
    hasPassword: false,
  };

  applyPasswordToProfile(profile, normalized.password, normalized.savePassword);

  activeConnections.set(id, {
    ...profile,
    client,
    password: normalized.password,
    ftpPassive: client._ftpPassive !== false,
    taskQueue: createTaskQueue(),
    nameCache: new Map(),
  });

  const saved = readSavedConnections();
  const idx = saved.findIndex((item) => item.id === id);
  const stored = { ...profile };
  delete stored.hasPassword;
  if (idx >= 0) saved[idx] = stored;
  else saved.push(stored);
  writeSavedConnections(saved);

  const { passwordEnc, ...safeProfile } = profile;
  return {
    ...safeProfile,
    hasPassword: Boolean(passwordEnc),
    rootPath: buildRemotePath(id, '/'),
    canStorePassword: canStorePassword(),
  };
}

async function disconnect(connId) {
  const conn = activeConnections.get(connId);
  if (!conn) return false;
  try {
    if (conn.protocol === 'ftp') await conn.client.close();
    else await conn.client.end();
  } catch { /* ignore */ }
  activeConnections.delete(connId);
  return true;
}

function getSavedConnections() {
  return readSavedConnections().map((item) => {
    const { passwordEnc, ...safe } = item;
    return {
      ...safe,
      connected: activeConnections.has(item.id),
      rootPath: buildRemotePath(item.id, '/'),
      canStorePassword: canStorePassword(),
    };
  });
}

function getActiveConnections() {
  return [...activeConnections.values()].map((conn) => ({
    id: conn.id,
    name: conn.name,
    protocol: conn.protocol,
    host: conn.host,
    port: conn.port,
    username: conn.username,
    secure: conn.secure,
    rootPath: buildRemotePath(conn.id, '/'),
  }));
}

function deleteSavedConnection(connId) {
  disconnect(connId);
  const next = readSavedConnections().filter((item) => item.id !== connId);
  writeSavedConnections(next);
  return true;
}

async function listRemoteDirectory(conn, remotePath) {
  if (conn.protocol === 'ftp') {
    const list = await ftpListDirectory(conn.client, remotePath, conn.encoding);
    const currentName = remotePath === '/' ? '' : path.posix.basename(remotePath);
    return list
      .filter((item) => item.name !== '.' && item.name !== '..')
      .filter((item) => !(currentName && item.isDirectory && item.name === currentName))
      .map((item) => ({
        name: item.name,
        isDirectory: item.isDirectory,
        isFile: item.isFile,
        size: item.size || 0,
        modified: item.modifiedAt ? new Date(item.modifiedAt).getTime() : 0,
      }));
  }

  const list = await conn.client.list(remotePath);
  return list
    .filter((item) => item.name !== '.' && item.name !== '..')
    .map((item) => ({
      name: item.name,
      isDirectory: item.type === 'd',
      isFile: item.type === '-' || item.type === 'l',
      size: item.size || 0,
      modified: item.modifyTime || 0,
    }));
}

function readDirectory(virtualPath) {
  const parsed = parseRemotePath(virtualPath);
  if (!parsed) throw new Error('无效的远程路径');

  return withConnection(parsed.connId, async (conn) => {
    let items;
    try {
      items = await listRemoteDirectory(conn, parsed.remotePath);
    } catch (err) {
      throw new Error(formatConnectionError(err, conn));
    }
    if (conn.nameCache) {
      for (const item of items) {
        const remotePath = joinRemotePath(parsed.remotePath, item.name);
        conn.nameCache.set(buildRemotePath(parsed.connId, remotePath), item.name);
      }
    }
    return {
      path: buildRemotePath(parsed.connId, parsed.remotePath),
      entries: items
        .map((item) => formatRemoteEntry(parsed.connId, parsed.remotePath, item))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' });
        }),
      connection: {
        id: conn.id,
        name: conn.name,
        protocol: conn.protocol,
        encoding: conn.encoding,
      },
    };
  });
}

function getParentPath(virtualPath) {
  const parsed = parseRemotePath(virtualPath);
  if (!parsed) return null;
  if (parsed.remotePath === '/') return null;
  const parts = parsed.remotePath.split('/').filter(Boolean);
  parts.pop();
  const parent = parts.length ? `/${parts.join('/')}` : '/';
  return buildRemotePath(parsed.connId, parent);
}

function sanitizeName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('名称不能为空');
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('名称不能包含路径分隔符');
  }
  return trimmed;
}

async function createFolder(parentPath, name) {
  const parsed = parseRemotePath(parentPath);
  if (!parsed) throw new Error('无效的远程路径');
  const folderName = sanitizeName(name);
  const target = joinRemotePath(parsed.remotePath, folderName);

  return withConnection(parsed.connId, async (conn) => {
    if (conn.protocol === 'ftp') {
      await withFtpDirectory(conn.client, parsed.remotePath, conn.encoding, async () => {
        await conn.client.ensureDir(encodeFtpPath(folderName, conn.encoding));
      });
    } else {
      await conn.client.mkdir(target, true);
    }
    return buildRemotePath(parsed.connId, target);
  });
}

async function createFile(parentPath, name) {
  const parsed = parseRemotePath(parentPath);
  if (!parsed) throw new Error('无效的远程路径');
  const fileName = sanitizeName(name);
  const target = joinRemotePath(parsed.remotePath, fileName);
  const tempFile = internalTempPath(parsed.connId, fileName);

  return withConnection(parsed.connId, async (conn) => {
    fs.writeFileSync(tempFile, '');
    try {
      if (conn.protocol === 'ftp') {
        await withFtpDirectory(conn.client, parsed.remotePath, conn.encoding, async () => {
          await conn.client.uploadFrom(tempFile, encodeFtpPath(fileName, conn.encoding));
        });
      } else {
        await conn.client.put(tempFile, target);
      }
    } finally {
      fs.rmSync(tempFile, { force: true });
    }
    return buildRemotePath(parsed.connId, target);
  });
}

async function renameEntry(oldPath, newName) {
  const parsed = parseRemotePath(oldPath);
  if (!parsed) throw new Error('无效的远程路径');
  const trimmed = sanitizeName(newName);
  const parent = path.posix.dirname(parsed.remotePath);
  const parentRemote = parent === '.' ? '/' : parent;
  const target = joinRemotePath(parentRemote, trimmed);

  return withConnection(parsed.connId, async (conn) => {
    if (conn.protocol === 'ftp') {
      const parentDir = parentRemote === '/' ? '/' : parentRemote;
      await withFtpDirectory(conn.client, parentDir, conn.encoding, async () => {
        await conn.client.rename(
          encodeFtpPath(path.posix.basename(parsed.remotePath), conn.encoding),
          encodeFtpPath(trimmed, conn.encoding),
        );
      });
    } else {
      await conn.client.rename(parsed.remotePath, target);
    }
    return buildRemotePath(parsed.connId, target);
  });
}

async function isRemoteDirectory(conn, remotePath) {
  if (conn.protocol === 'sftp') {
    const stat = await conn.client.stat(remotePath);
    return stat.isDirectory();
  }
  try {
    await ftpListDirectory(conn.client, remotePath);
    return true;
  } catch {
    return false;
  }
}

async function deleteRemotePath(conn, remotePath) {
  const isDirectory = await isRemoteDirectory(conn, remotePath);
  if (conn.protocol === 'ftp') {
    const dir = path.posix.dirname(remotePath === '/' ? '/' : remotePath);
    const base = path.posix.basename(remotePath);
    const parentDir = dir === '.' ? '/' : dir;
    await withFtpDirectory(conn.client, parentDir, conn.encoding, async () => {
      if (isDirectory) await conn.client.removeDir(encodeFtpPath(base, conn.encoding));
      else await conn.client.remove(encodeFtpPath(base, conn.encoding));
    });
    return;
  }
  if (isDirectory) await conn.client.rmdir(remotePath, true);
  else await conn.client.delete(remotePath);
}

async function downloadRemoteEntry(conn, remotePath, localDest) {
  const isDirectory = await isRemoteDirectory(conn, remotePath);
  if (!isDirectory) {
    fs.mkdirSync(path.dirname(localDest), { recursive: true });
    await downloadRemoteFile(conn, remotePath, localDest);
    return;
  }
  fs.mkdirSync(localDest, { recursive: true });
  const items = await listRemoteDirectory(conn, remotePath);
  for (const item of items) {
    const childRemote = joinRemotePath(remotePath, item.name);
    const childLocal = path.join(localDest, item.name);
    await downloadRemoteEntry(conn, childRemote, childLocal);
  }
}

async function uploadLocalEntry(conn, localPath, remotePath) {
  const stat = fs.statSync(localPath);
  if (conn.protocol === 'ftp') {
    const dir = path.posix.dirname(remotePath === '/' ? '/' : remotePath);
    const base = path.posix.basename(remotePath);
    const parentDir = dir === '.' ? '/' : dir;
    if (stat.isDirectory()) {
      await withFtpDirectory(conn.client, parentDir, conn.encoding, async () => {
        await conn.client.ensureDir(encodeFtpPath(base, conn.encoding));
        await conn.client.uploadFromDir(localPath, encodeFtpPath(base, conn.encoding));
      });
    } else {
      await withFtpDirectory(conn.client, parentDir, conn.encoding, async () => {
        await conn.client.uploadFrom(localPath, encodeFtpPath(base, conn.encoding));
      });
    }
    return;
  }
  if (stat.isDirectory()) {
    await conn.client.mkdir(remotePath, true);
    await conn.client.uploadDir(localPath, remotePath);
  } else {
    await conn.client.fastPut(localPath, remotePath);
  }
}

async function deleteEntries(targetPaths) {
  const paths = Array.isArray(targetPaths) ? targetPaths : [targetPaths];
  for (const item of paths) {
    const parsed = parseRemotePath(item);
    if (!parsed) throw new Error('无效的远程路径');
    await withConnection(parsed.connId, (conn) => deleteRemotePath(conn, parsed.remotePath));
  }
  return true;
}

function getRemoteCacheDir() {
  return downloadDir;
}

function sanitizeLocalFileName(fileName) {
  return String(fileName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'download';
}

function downloadFilePath(fileName) {
  return uniqueDestPath(downloadDir, sanitizeLocalFileName(fileName));
}

function internalTempPath(connId, fileName) {
  const tmpRoot = path.join(downloadDir, '.tmp');
  fs.mkdirSync(tmpRoot, { recursive: true });
  const safeName = sanitizeLocalFileName(fileName);
  return path.join(tmpRoot, `${connId}-${Date.now()}-${safeName}`);
}

function tempFilePath(connId, fileName) {
  return internalTempPath(connId, fileName);
}

async function downloadRemoteFile(conn, remotePath, localPath, options = {}) {
  const { onProgress, totalBytes, isCancelled, registerCleanup } = options;

  const report = (bytes, total = totalBytes || 0) => {
    if (isCancelled?.()) return;
    onProgress?.({
      bytes,
      total,
      percent: total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : null,
    });
  };

  if (conn.protocol === 'ftp') {
    const dir = path.posix.dirname(remotePath === '/' ? '/' : remotePath);
    const base = path.posix.basename(remotePath);
    const parentDir = dir === '.' ? '/' : dir;
    const virtualPath = buildRemotePath(conn.id, remotePath);
    const cachedName = conn.nameCache?.get(virtualPath);

    await withFtpDirectory(conn.client, parentDir, conn.encoding, async () => {
      let serverName = cachedName;
      if (!serverName) {
        const files = await listCurrentDirectory(conn.client, conn.encoding);
        const entry = files.find((f) => f.name === base && f.isFile)
          || files.find((f) => f.name === base);
        if (!entry) throw new Error(`找不到文件「${base}」`);
        serverName = entry.name;
      }

      let total = totalBytes || 0;
      if (!total) {
        try {
          total = await conn.client.size(encodeFtpPath(serverName, conn.encoding));
        } catch { /* SIZE 不支持时仅显示已下载量 */ }
      }

      await retrieveFile(
        conn.client,
        serverName,
        localPath,
        conn.encoding,
        (data) => report(data.bytes, total),
        { isCancelled, registerCleanup },
      );
    });
  } else {
    let total = totalBytes || 0;
    if (!total) {
      try {
        const stat = await conn.client.stat(remotePath);
        total = stat?.size || 0;
      } catch { /* ignore */ }
    }
    await downloadSftpFile(conn, remotePath, localPath, {
      onProgress: (data) => report(data.bytes, total),
      isCancelled,
      registerCleanup,
    });
  }
}

async function downloadSftpFile(conn, remotePath, localPath, options = {}) {
  const { onProgress, isCancelled, registerCleanup } = options;

  return new Promise((resolve, reject) => {
    const readStream = conn.client.createReadStream(remotePath);
    const writeStream = fs.createWriteStream(localPath);
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearInterval(cancelTimer);
      if (err) reject(err);
      else resolve();
    };

    registerCleanup?.(() => {
      readStream.destroy();
      writeStream.destroy();
    });

    const cancelTimer = setInterval(() => {
      if (isCancelled?.()) {
        finish(new DownloadCancelledError());
      }
    }, 150);

    let bytes = 0;
    readStream.on('data', (chunk) => {
      bytes += chunk.length;
      onProgress?.({ bytes });
      if (isCancelled?.()) finish(new DownloadCancelledError());
    });
    readStream.on('error', (err) => finish(err));
    writeStream.on('error', (err) => finish(err));
    writeStream.on('finish', () => finish());
    readStream.pipe(writeStream);
  });
}

async function uploadLocalFile(conn, localPath, remotePath) {
  await uploadLocalEntry(conn, localPath, remotePath);
}

async function readTextFile(filePath, maxBytes = 512 * 1024) {
  const parsed = parseRemotePath(filePath);
  if (!parsed) throw new Error('无效的远程路径');
  const localPath = tempFilePath(parsed.connId, path.posix.basename(parsed.remotePath));

  return withConnection(parsed.connId, async (conn) => {
    await downloadRemoteFile(conn, parsed.remotePath, localPath);
    try {
      const stat = fs.statSync(localPath);
      const textEncoding = conn.protocol === 'ftp' ? conn.encoding : 'utf8';
      const content = decodeTextBuffer(fs.readFileSync(localPath), textEncoding);
      if (stat.size > maxBytes) {
        return { truncated: true, content: content.slice(0, maxBytes), size: stat.size };
      }
      return { truncated: false, content, size: stat.size };
    } finally {
      fs.rmSync(localPath, { force: true });
    }
  });
}

async function readImageFile(filePath, maxBytes = 20 * 1024 * 1024) {
  const parsed = parseRemotePath(filePath);
  if (!parsed) throw new Error('无效的远程路径');
  const ext = path.posix.extname(parsed.remotePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) throw new Error('不是支持的图片格式');

  const localPath = tempFilePath(parsed.connId, path.posix.basename(parsed.remotePath));
  return withConnection(parsed.connId, async (conn) => {
    await downloadRemoteFile(conn, parsed.remotePath, localPath);
    try {
      const stat = fs.statSync(localPath);
      if (stat.size > maxBytes) {
        throw new Error(`图片过大（${Math.round(stat.size / 1024 / 1024)}MB），请下载后用系统应用打开`);
      }
      const mime = IMAGE_MIME[ext] || 'application/octet-stream';
      const buffer = fs.readFileSync(localPath);
      return {
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
        width: 0,
        height: 0,
        size: stat.size,
        mime,
      };
    } finally {
      fs.rmSync(localPath, { force: true });
    }
  });
}

async function openRemotePath(virtualPath, options = {}) {
  const parsed = parseRemotePath(virtualPath);
  if (!parsed) throw new Error('无效的远程路径');
  const conn = getConnection(parsed.connId);
  const baseName = conn.nameCache?.get(virtualPath)
    || path.posix.basename(parsed.remotePath);
  const localPath = downloadFilePath(baseName);
  const totalBytes = options.fileSize || 0;
  const downloadId = randomUUID();
  const downloadState = { cancelled: false, cleanup: null };
  activeDownloads.set(downloadId, downloadState);

  const emit = (payload) => {
    options.onProgress?.({
      downloadId,
      fileName: baseName,
      localPath,
      ...payload,
    });
  };

  const isCancelled = () => downloadState.cancelled;
  const registerCleanup = (fn) => {
    downloadState.cleanup = fn;
  };

  emit({ phase: 'start', bytes: 0, total: totalBytes });

  try {
    await withConnection(parsed.connId, async (activeConn) => {
      let previousTimeout;
      if (activeConn.protocol === 'ftp') {
        previousTimeout = activeConn.client.ftp.timeout;
        activeConn.client.ftp.timeout = 0;
      }
      try {
        await downloadRemoteFile(activeConn, parsed.remotePath, localPath, {
          totalBytes,
          onProgress: (data) => emit({ phase: 'progress', ...data }),
          isCancelled,
          registerCleanup,
        });
      } catch (err) {
        if (isDownloadCancelledError(err) || downloadState.cancelled) {
          throw new DownloadCancelledError();
        }
        throw new Error(formatConnectionError(err, activeConn));
      } finally {
        if (activeConn.protocol === 'ftp' && previousTimeout !== undefined) {
          activeConn.client.ftp.timeout = previousTimeout;
        }
      }
    });

    if (downloadState.cancelled) {
      throw new DownloadCancelledError();
    }

    if (!fs.existsSync(localPath)) {
      throw new Error('文件下载失败');
    }
    const size = fs.statSync(localPath).size;
    if (size === 0) {
      fs.rmSync(localPath, { force: true });
      throw new Error('下载的文件为空');
    }
    emit({ phase: 'complete', bytes: size, total: size, percent: 100 });
    return localPath;
  } catch (err) {
    if (fs.existsSync(localPath)) {
      fs.rmSync(localPath, { force: true });
    }
    if (isDownloadCancelledError(err) || downloadState.cancelled) {
      emit({ phase: 'cancelled' });
      return null;
    }
    throw err;
  } finally {
    activeDownloads.delete(downloadId);
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

async function remoteMoveWithinConn(conn, sourceRemote, destDirRemote, baseName) {
  const targetRemote = joinRemotePath(destDirRemote, baseName);
  const sourceDir = path.posix.dirname(sourceRemote === '/' ? '/' : sourceRemote);

  if (conn.protocol === 'ftp') {
    if (normalizeRemotePath(sourceDir) === normalizeRemotePath(destDirRemote)
      && path.posix.basename(sourceRemote) !== baseName) {
      await withFtpDirectory(conn.client, sourceDir, conn.encoding, async () => {
        await conn.client.rename(
          encodeFtpPath(path.posix.basename(sourceRemote), conn.encoding),
          encodeFtpPath(baseName, conn.encoding),
        );
      });
      return targetRemote;
    }
    if (normalizeRemotePath(sourceRemote) === normalizeRemotePath(targetRemote)) {
      return targetRemote;
    }
    const temp = tempFilePath(conn.id, baseName);
    try {
      await downloadRemoteEntry(conn, sourceRemote, temp);
      await uploadLocalEntry(conn, temp, targetRemote);
      await deleteRemotePath(conn, sourceRemote);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
    return targetRemote;
  }

  await conn.client.rename(sourceRemote, targetRemote);
  return targetRemote;
}

function setEncoding(connId, encoding) {
  const conn = getConnection(connId);
  const enc = normalizeEncoding(encoding);
  conn.encoding = enc;
  if (conn.protocol === 'ftp' && conn.client?.ftp) {
    applyFtpControlEncoding(conn.client, enc);
  }
  const saved = readSavedConnections();
  const idx = saved.findIndex((item) => item.id === connId);
  if (idx >= 0) {
    saved[idx].encoding = enc;
    writeSavedConnections(saved);
  }
  return enc;
}

async function moveEntries(sourcePaths, destDir) {
  const sources = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
  const destIsRemote = isRemotePath(destDir);
  const results = [];

  for (const src of sources) {
    const srcIsRemote = isRemotePath(src);
    if (srcIsRemote && destIsRemote) {
      const sourceParsed = parseRemotePath(src);
      const destParsed = parseRemotePath(destDir);
      if (sourceParsed.connId !== destParsed.connId) {
        throw new Error('暂不支持在不同远程连接之间移动');
      }
      const base = path.posix.basename(sourceParsed.remotePath);
      const targetRemote = await withConnection(sourceParsed.connId, (conn) => remoteMoveWithinConn(
        conn,
        sourceParsed.remotePath,
        destParsed.remotePath,
        base,
      ));
      results.push(buildRemotePath(sourceParsed.connId, targetRemote));
    } else if (srcIsRemote && !destIsRemote) {
      const sourceParsed = parseRemotePath(src);
      const base = path.posix.basename(sourceParsed.remotePath);
      const localDest = path.join(path.resolve(destDir), base);
      if (fs.existsSync(localDest)) throw new Error(`目标位置已存在「${base}」`);
      await withConnection(sourceParsed.connId, async (conn) => {
        await downloadRemoteEntry(conn, sourceParsed.remotePath, localDest);
        await deleteRemotePath(conn, sourceParsed.remotePath);
      });
      results.push(localDest);
    } else if (!srcIsRemote && destIsRemote) {
      const destParsed = parseRemotePath(destDir);
      const resolved = path.resolve(src);
      const base = path.basename(resolved);
      const targetRemote = joinRemotePath(destParsed.remotePath, base);
      await withConnection(destParsed.connId, (conn) => uploadLocalFile(conn, resolved, targetRemote));
      fs.rmSync(resolved, { recursive: true, force: true });
      results.push(buildRemotePath(destParsed.connId, targetRemote));
    } else {
      throw new Error('请使用本地文件操作');
    }
  }
  return results;
}

async function copyEntries(sourcePaths, destDir) {
  const sources = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
  const destIsRemote = isRemotePath(destDir);
  const results = [];

  for (const src of sources) {
    const srcIsRemote = isRemotePath(src);
    if (srcIsRemote && destIsRemote) {
      const sourceParsed = parseRemotePath(src);
      const destParsed = parseRemotePath(destDir);
      if (sourceParsed.connId !== destParsed.connId) {
        throw new Error('暂不支持在不同远程连接之间复制');
      }
      const base = path.posix.basename(sourceParsed.remotePath);
      const tempRoot = path.join(downloadDir, '.tmp', `${sourceParsed.connId}-${Date.now()}`);
      fs.mkdirSync(tempRoot, { recursive: true });
      const temp = path.join(tempRoot, base);
      const targetRemote = joinRemotePath(destParsed.remotePath, base);
      await withConnection(sourceParsed.connId, async (conn) => {
        await downloadRemoteEntry(conn, sourceParsed.remotePath, temp);
        await uploadLocalEntry(conn, temp, targetRemote);
      });
      fs.rmSync(tempRoot, { recursive: true, force: true });
      results.push(buildRemotePath(destParsed.connId, targetRemote));
    } else if (srcIsRemote && !destIsRemote) {
      const sourceParsed = parseRemotePath(src);
      const base = path.posix.basename(sourceParsed.remotePath);
      const localDest = uniqueDestPath(path.resolve(destDir), base);
      await withConnection(sourceParsed.connId, (conn) => downloadRemoteEntry(conn, sourceParsed.remotePath, localDest));
      results.push(localDest);
    } else if (!srcIsRemote && destIsRemote) {
      const destParsed = parseRemotePath(destDir);
      const resolved = path.resolve(src);
      const base = path.basename(resolved);
      const targetRemote = joinRemotePath(destParsed.remotePath, base);
      await withConnection(destParsed.connId, (conn) => uploadLocalFile(conn, resolved, targetRemote));
      results.push(buildRemotePath(destParsed.connId, targetRemote));
    } else {
      throw new Error('请使用本地文件操作');
    }
  }
  return results;
}

async function duplicateEntries(sourcePaths) {
  const paths = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
  const results = [];
  for (const src of paths) {
    const parsed = parseRemotePath(src);
    if (!parsed) throw new Error('无效的远程路径');
    const parent = path.posix.dirname(parsed.remotePath);
    const parentRemote = parent === '.' ? '/' : parent;
    const ext = path.posix.extname(parsed.remotePath);
    const base = path.posix.basename(parsed.remotePath, ext);

    const targetRemote = await withConnection(parsed.connId, async (conn) => {
      let candidate = `${base} 副本${ext}`;
      let n = 2;
      const list = await listRemoteDirectory(conn, parentRemote);
      const names = new Set(list.map((item) => item.name));
      while (names.has(candidate)) {
        candidate = `${base} 副本 ${n}${ext}`;
        n += 1;
      }
      const remoteTarget = joinRemotePath(parentRemote, candidate);
      const tempRoot = path.join(downloadDir, '.tmp', `${parsed.connId}-${Date.now()}`);
      fs.mkdirSync(tempRoot, { recursive: true });
      const temp = path.join(tempRoot, candidate);
      await downloadRemoteEntry(conn, parsed.remotePath, temp);
      await uploadLocalEntry(conn, temp, remoteTarget);
      fs.rmSync(tempRoot, { recursive: true, force: true });
      return remoteTarget;
    });
    results.push(buildRemotePath(parsed.connId, targetRemote));
  }
  return results;
}

async function getEntriesInfo(targetPaths) {
  const paths = Array.isArray(targetPaths) ? targetPaths : [targetPaths];
  let files = 0;
  let folders = 0;
  let totalSize = 0;

  for (const item of paths) {
    const parsed = parseRemotePath(item);
    if (!parsed) continue;
    await withConnection(parsed.connId, async (conn) => {
      if (conn.protocol === 'sftp') {
        const stat = await conn.client.stat(parsed.remotePath);
        if (stat.isDirectory()) folders += 1;
        else {
          files += 1;
          totalSize += stat.size || 0;
        }
        return;
      }
      const parent = path.posix.dirname(parsed.remotePath);
      const list = await listRemoteDirectory(conn, parent === '.' ? '/' : parent);
      const entry = list.find((row) => row.name === path.posix.basename(parsed.remotePath));
      if (entry?.isDirectory) folders += 1;
      else {
        files += 1;
        totalSize += entry?.size || 0;
      }
    });
  }

  return { count: paths.length, files, folders, totalSize };
}

module.exports = {
  init,
  isRemotePath,
  parseRemotePath,
  buildRemotePath,
  connect,
  disconnect,
  getSavedConnections,
  getActiveConnections,
  deleteSavedConnection,
  getSavedConnectionPassword,
  readDirectory,
  getParentPath,
  createFolder,
  createFile,
  renameEntry,
  deleteEntries,
  readTextFile,
  readImageFile,
  openRemotePath,
  getRemoteCacheDir,
  setRemoteDownloadDir,
  cancelDownload,
  moveEntries,
  copyEntries,
  duplicateEntries,
  getEntriesInfo,
  setEncoding,
  SUPPORTED_ENCODINGS,
};
