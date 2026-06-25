export function formatSize(bytes) {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getFileIcon(entry) {
  if (entry.isDirectory) return 'folder';
  const ext = entry.extension || '';
  const map = {
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image',
    '.mp4': 'video', '.mov': 'video', '.avi': 'video', '.mkv': 'video',
    '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.aac': 'audio',
    '.pdf': 'pdf',
    '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive', '.gz': 'archive',
    '.js': 'code', '.ts': 'code', '.jsx': 'code', '.tsx': 'code', '.vue': 'code',
    '.py': 'code', '.java': 'code', '.go': 'code', '.rs': 'code', '.html': 'code', '.css': 'code',
    '.json': 'code', '.md': 'text', '.txt': 'text',
  };
  return map[ext] || 'file';
}

export function splitPath(dirPath, labelMap = {}) {
  if (!dirPath) return [];

  if (dirPath.startsWith('remote://')) {
    const match = dirPath.match(/^remote:\/\/([^/]+)(\/.*)?$/);
    if (!match) return [{ name: dirPath, path: dirPath }];
    const connId = match[1];
    const remotePart = match[2] || '';
    const segments = [{
      name: labelMap[connId] || '远程',
      path: `remote://${connId}`,
    }];
    const parts = remotePart.split('/').filter(Boolean);
    let current = `remote://${connId}`;
    for (const part of parts) {
      current = `${current}/${part}`;
      segments.push({ name: part, path: current });
    }
    return segments;
  }

  const parts = dirPath.split(/[/\\]/).filter(Boolean);
  const segments = [];
  let current = dirPath.startsWith('/') ? '/' : '';

  for (let i = 0; i < parts.length; i += 1) {
    current = i === 0 && dirPath.startsWith('/')
      ? `/${parts[i]}`
      : pathJoin(current, parts[i]);
    segments.push({ name: parts[i], path: current });
  }
  return segments;
}

function pathJoin(base, part) {
  if (!base || base === '/') return `/${part}`;
  return `${base.replace(/[/\\]+$/, '')}/${part}`;
}
