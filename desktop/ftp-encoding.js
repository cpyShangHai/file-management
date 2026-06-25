const { Writable } = require('stream');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const { downloadTo } = require('basic-ftp/dist/transfer');
const { parseList } = require('basic-ftp/dist/parseList');

const SUPPORTED_ENCODINGS = ['gbk', 'gb18030', 'utf8', 'big5', 'latin1'];

function normalizeEncoding(encoding) {
  const value = String(encoding || 'gbk').toLowerCase();
  return SUPPORTED_ENCODINGS.includes(value) ? value : 'gbk';
}

/** FTP 控制通道 socket 编码：多字节文件名需用 latin1 发送原始字节 */
function getFtpSocketEncoding(encoding) {
  const enc = normalizeEncoding(encoding);
  if (enc === 'utf8') return 'utf8';
  return 'latin1';
}

function applyFtpControlEncoding(client, encoding) {
  client.ftp.encoding = getFtpSocketEncoding(encoding);
}

function encodeFtpPath(utf8Path, encoding = 'gbk') {
  if (!utf8Path || utf8Path === '/') return utf8Path;
  const enc = normalizeEncoding(encoding);
  if (enc === 'utf8' || enc === 'latin1') return utf8Path;
  return iconv.encode(utf8Path, enc).toString('latin1');
}

function decodeListing(chunks, encoding = 'gbk') {
  const buf = Buffer.concat(chunks);
  const enc = normalizeEncoding(encoding);
  if (enc === 'utf8') return buf.toString('utf8');
  if (enc === 'latin1') return buf.toString('latin1');
  return iconv.decode(buf, enc);
}

function decodeTextBuffer(buffer, encoding = 'gbk') {
  const enc = normalizeEncoding(encoding);
  if (enc === 'utf8') return buffer.toString('utf8');
  if (enc === 'latin1') return buffer.toString('latin1');
  return iconv.decode(buffer, enc);
}

async function cwdToPath(client, remotePath, encoding) {
  await client.cd('/');
  if (!remotePath || remotePath === '/') return;
  const parts = remotePath.split('/').filter(Boolean);
  for (const part of parts) {
    await client.cd(encodeFtpPath(part, encoding));
  }
}

async function listCurrentDirectory(client, encoding) {
  let lastError;
  for (const candidate of client.availableListCommands) {
    await client.prepareTransfer(client.ftp);
    try {
      const chunks = [];
      const sink = new Writable({
        write(chunk, _, cb) {
          chunks.push(chunk);
          cb();
        },
      });
      await downloadTo(sink, {
        ftp: client.ftp,
        tracker: client._progressTracker,
        command: candidate,
        remotePath: '',
        type: 'list',
      });
      const parsedList = parseList(decodeListing(chunks, encoding));
      client.availableListCommands = [candidate];
      return parsedList;
    } catch (err) {
      const shouldTryNext = err?.name === 'FTPError' || err?.code;
      if (!shouldTryNext) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

async function listDirectory(client, remotePath, encoding = 'gbk') {
  const enc = normalizeEncoding(encoding);
  await cwdToPath(client, remotePath, enc);
  try {
    return await listCurrentDirectory(client, enc);
  } finally {
    try {
      await client.cd('/');
    } catch { /* ignore */ }
  }
}

async function withFtpDirectory(client, remotePath, encoding, fn) {
  const enc = normalizeEncoding(encoding);
  await cwdToPath(client, remotePath, enc);
  try {
    return await fn();
  } finally {
    try {
      await client.cd('/');
    } catch { /* ignore */ }
  }
}

async function retrieveFile(client, fileName, localPath, encoding = 'gbk', onProgress, options = {}) {
  const { isCancelled, registerCleanup } = options;
  const enc = normalizeEncoding(encoding);
  const encodedName = encodeFtpPath(fileName, enc);
  if (onProgress) {
    client.trackProgress((info) => {
      if (info.type === 'download') {
        onProgress({ bytes: info.bytesOverall });
      }
    });
  }
  await client.send('TYPE I');
  await client.prepareTransfer(client.ftp);
  const destination = fs.createWriteStream(localPath);
  const onError = (err) => client.ftp.closeWithError(err);
  destination.once('error', onError);

  registerCleanup?.(() => {
    try { destination.destroy(); } catch { /* ignore */ }
    try { client.ftp.dataSocket?.destroy(); } catch { /* ignore */ }
    try { client.trackProgress(); } catch { /* ignore */ }
  });

  const cancelTimer = setInterval(() => {
    if (isCancelled?.()) {
      clearInterval(cancelTimer);
      try { destination.destroy(); } catch { /* ignore */ }
      try { client.ftp.dataSocket?.destroy(); } catch { /* ignore */ }
    }
  }, 150);

  try {
    await downloadTo(destination, {
      ftp: client.ftp,
      tracker: client._progressTracker,
      command: `RETR ${encodedName}`,
      remotePath: encodedName,
      type: 'download',
    });
    if (isCancelled?.()) {
      throw Object.assign(new Error('DOWNLOAD_CANCELLED'), { code: 'DOWNLOAD_CANCELLED' });
    }
  } catch (err) {
    if (isCancelled?.()) {
      throw Object.assign(new Error('DOWNLOAD_CANCELLED'), { code: 'DOWNLOAD_CANCELLED' });
    }
    throw err;
  } finally {
    clearInterval(cancelTimer);
    destination.removeListener('error', onError);
    destination.end();
    if (onProgress) client.trackProgress();
  }
}

module.exports = {
  SUPPORTED_ENCODINGS,
  normalizeEncoding,
  getFtpSocketEncoding,
  applyFtpControlEncoding,
  encodeFtpPath,
  decodeListing,
  decodeTextBuffer,
  cwdToPath,
  listDirectory,
  withFtpDirectory,
  listCurrentDirectory,
  retrieveFile,
};
