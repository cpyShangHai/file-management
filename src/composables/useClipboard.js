import { ref, markRaw } from 'vue';

/** IPC 只能传递可结构化克隆的数据，路径须为纯字符串 */
export function toPlainPaths(paths) {
  if (!paths) return [];
  if (typeof paths === 'string') return [paths];
  return Array.from(paths, (p) => String(p)).filter(Boolean);
}

export function useClipboard() {
  const clipboardState = ref(null);

  function setClipboard(operation, paths) {
    const plain = toPlainPaths(paths);
    if (!plain.length) {
      clipboardState.value = null;
      return;
    }
    clipboardState.value = {
      operation,
      paths: markRaw(plain),
    };
  }

  function clearClipboard() {
    clipboardState.value = null;
  }

  function hasClipboard() {
    return Boolean(clipboardState.value?.paths?.length);
  }

  function getClipboardPaths() {
    return toPlainPaths(clipboardState.value?.paths);
  }

  return {
    clipboardState,
    setClipboard,
    clearClipboard,
    hasClipboard,
    getClipboardPaths,
  };
}
