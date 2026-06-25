import { getDragPaths } from './useDragSession';

export const DRAG_TYPE = 'application/x-file-manager-paths';

export function canAcceptDrop(event) {
  if (getDragPaths()?.length) return true;
  const types = [...(event.dataTransfer?.types || [])];
  return types.includes(DRAG_TYPE)
    || types.includes('text/plain')
    || types.includes('Files');
}

export function parseDragPaths(event) {
  const session = getDragPaths();
  if (session?.length) {
    return { paths: session, internal: true };
  }

  const raw = event.dataTransfer.getData(DRAG_TYPE);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data.paths?.length) return { paths: data.paths, internal: true };
    } catch { /* ignore */ }
  }

  const plain = event.dataTransfer.getData('text/plain');
  if (plain) {
    const paths = plain.split('\n').map((p) => p.trim()).filter(Boolean);
    if (paths.length && paths.every((p) => p.startsWith('/') || p.startsWith('remote://'))) {
      return { paths, internal: true };
    }
  }

  const external = [];
  for (const file of event.dataTransfer.files) {
    if (file.path) external.push(file.path);
  }
  if (external.length) return { paths: external, internal: false };

  return null;
}

export function isDropBlocked(targetPath, sourcePaths) {
  const dest = targetPath.replace(/[/\\]+$/, '');
  return sourcePaths.some((src) => {
    const s = src.replace(/[/\\]+$/, '');
    if (s.startsWith('remote://') || dest.startsWith('remote://')) {
      if (s === dest) return true;
      if (s.startsWith('remote://') && dest.startsWith('remote://')) {
        return dest.startsWith(`${s}/`);
      }
      return false;
    }
    return s === dest || dest.startsWith(`${s}/`);
  });
}
