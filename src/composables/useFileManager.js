import { ref, computed, watch } from 'vue';
import { useClipboard, toPlainPaths } from './useClipboard';
import { isRemotePath } from './useRemoteConnections';

function getApi() {
  if (!window.fileManager?.isElectron) {
    throw new Error('请在 Electron 环境中运行（请使用 npm run dev 启动）');
  }
  return window.fileManager;
}

export function useFileManager() {
  const currentPath = ref('');
  const entries = ref([]);
  const quickAccess = ref([]);
  const selectedPaths = ref(new Set());
  const lastSelectedPath = ref('');
  const loading = ref(false);
  const error = ref('');
  const searchQuery = ref('');
  const viewMode = ref(localStorage.getItem('fm-view-mode') || 'list');

  watch(viewMode, (mode) => {
    localStorage.setItem('fm-view-mode', mode);
  });
  const previewFile = ref(null);
  const previewMode = ref(null);
  const previewContent = ref('');
  const previewImageUrl = ref('');
  const previewImageSize = ref({ width: 0, height: 0 });
  const previewTruncated = ref(false);
  const history = ref([]);
  const historyIndex = ref(-1);
  const selectionInfo = ref({ count: 0, files: 0, folders: 0, totalSize: 0 });
  const remoteConnection = ref(null);

  const isRemote = computed(() => isRemotePath(currentPath.value));
  let loadSeq = 0;

  const { clipboardState, setClipboard, clearClipboard, hasClipboard, getClipboardPaths } = useClipboard();

  const filteredEntries = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return entries.value;
    return entries.value.filter((e) => e.name.toLowerCase().includes(q));
  });

  const selectedEntries = computed(() =>
    entries.value.filter((e) => selectedPaths.value.has(e.path)),
  );

  const canGoBack = computed(() => historyIndex.value > 0);
  const canGoForward = computed(() => historyIndex.value < history.value.length - 1);

  async function refreshSelectionInfo() {
    const paths = [...selectedPaths.value];
    if (!paths.length) {
      selectionInfo.value = { count: 0, files: 0, folders: 0, totalSize: 0 };
      return;
    }
    selectionInfo.value = await getApi().getEntriesInfo(paths);
  }

  async function init() {
    const api = getApi();
    quickAccess.value = await api.getQuickAccess();
    const home = await api.getHomePath();
    await navigate(home, { replaceHistory: true });
  }

  async function loadDirectory(dirPath, { keepSelection = false } = {}) {
    const api = getApi();
    const seq = ++loadSeq;
    loading.value = true;
    error.value = '';
    const prevSelection = keepSelection ? new Set(selectedPaths.value) : new Set();
    try {
      const result = await api.readDirectory(dirPath);
      if (seq !== loadSeq) return;
      currentPath.value = result.path;
      entries.value = result.entries;
      remoteConnection.value = result.connection || null;
      if (keepSelection) {
        const valid = new Set(result.entries.map((e) => e.path));
        selectedPaths.value = new Set([...prevSelection].filter((p) => valid.has(p)));
      } else {
        selectedPaths.value = new Set();
        lastSelectedPath.value = '';
      }
      previewFile.value = null;
      previewMode.value = null;
      previewContent.value = '';
      previewImageUrl.value = '';
      previewImageSize.value = { width: 0, height: 0 };
      await refreshSelectionInfo();
    } catch (err) {
      if (seq !== loadSeq) return;
      error.value = err.message || '读取目录失败';
    } finally {
      if (seq === loadSeq) loading.value = false;
    }
  }

  async function navigate(dirPath, { replaceHistory = false } = {}) {
    if (!dirPath) return;

    if (replaceHistory || history.value.length === 0) {
      history.value = [dirPath];
      historyIndex.value = 0;
    } else if (history.value[historyIndex.value] !== dirPath) {
      history.value = history.value.slice(0, historyIndex.value + 1);
      history.value.push(dirPath);
      historyIndex.value = history.value.length - 1;
    }

    await loadDirectory(dirPath);
  }

  async function goBack() {
    if (!canGoBack.value) return;
    historyIndex.value -= 1;
    await loadDirectory(history.value[historyIndex.value]);
  }

  async function goForward() {
    if (!canGoForward.value) return;
    historyIndex.value += 1;
    await loadDirectory(history.value[historyIndex.value]);
  }

  async function goUp() {
    const parent = await getApi().getParentPath(currentPath.value);
    if (parent) await navigate(parent);
  }

  async function openRemoteFile(entry) {
    const localPath = await getApi().openPath(entry.path, {
      fileName: entry.name,
      fileSize: entry.size || 0,
    });
    return localPath !== null;
  }

  async function openEntry(entry) {
    if (entry.isDirectory) {
      await navigate(entry.path);
      return;
    }
    if (entry.isImage) {
      await previewImageFile(entry);
      return;
    }
    if (entry.isText) {
      await previewTextFile(entry);
      return;
    }
    if (isRemotePath(entry.path)) {
      return openRemoteFile(entry);
    }
    await getApi().openPath(entry.path);
  }

  function resetPreview() {
    previewFile.value = null;
    previewMode.value = null;
    previewContent.value = '';
    previewImageUrl.value = '';
    previewImageSize.value = { width: 0, height: 0 };
    previewTruncated.value = false;
  }

  async function previewTextFile(entry) {
    try {
      const result = await getApi().readTextFile(entry.path);
      previewFile.value = entry;
      previewMode.value = 'text';
      previewContent.value = result.content;
      previewImageUrl.value = '';
      previewTruncated.value = result.truncated;
    } catch (err) {
      error.value = err.message || '无法预览文件';
    }
  }

  async function previewImageFile(entry) {
    try {
      const result = await getApi().readImageFile(entry.path);
      previewFile.value = entry;
      previewMode.value = 'image';
      previewImageUrl.value = result.dataUrl;
      previewImageSize.value = { width: result.width, height: result.height };
      previewContent.value = '';
      previewTruncated.value = false;
    } catch (err) {
      error.value = err.message || '无法预览图片';
    }
  }

  function setSelection(paths) {
    selectedPaths.value = new Set(paths);
    refreshSelectionInfo();
  }

  function toggleSelect(entry, multi = false) {
    const next = multi ? new Set(selectedPaths.value) : new Set();
    if (next.has(entry.path)) next.delete(entry.path);
    else next.add(entry.path);
    selectedPaths.value = next;
    lastSelectedPath.value = entry.path;
    refreshSelectionInfo();
  }

  function selectEntry(entry, { multi = false, range = false } = {}) {
    const list = filteredEntries.value;
    if (range && lastSelectedPath.value) {
      const start = list.findIndex((e) => e.path === lastSelectedPath.value);
      const end = list.findIndex((e) => e.path === entry.path);
      if (start >= 0 && end >= 0) {
        const [lo, hi] = [Math.min(start, end), Math.max(start, end)];
        const next = multi ? new Set(selectedPaths.value) : new Set();
        for (let i = lo; i <= hi; i += 1) next.add(list[i].path);
        selectedPaths.value = next;
        lastSelectedPath.value = entry.path;
        refreshSelectionInfo();
        return;
      }
    }
    toggleSelect(entry, multi);
  }

  function selectRange(paths) {
    selectedPaths.value = new Set(paths);
    if (paths.length) lastSelectedPath.value = paths[paths.length - 1];
    refreshSelectionInfo();
  }

  function selectAll() {
    selectedPaths.value = new Set(filteredEntries.value.map((e) => e.path));
    refreshSelectionInfo();
  }

  function clearSelection() {
    selectedPaths.value = new Set();
    lastSelectedPath.value = '';
    refreshSelectionInfo();
  }

  function getSelectedPaths() {
    return toPlainPaths(selectedPaths.value);
  }

  async function createFolder(name) {
    await getApi().createFolder(currentPath.value, name);
    searchQuery.value = '';
    await loadDirectory(currentPath.value);
  }

  async function createFile(name) {
    await getApi().createFile(currentPath.value, name);
    searchQuery.value = '';
    await loadDirectory(currentPath.value);
  }

  async function renameEntry(entry, newName) {
    await getApi().rename(entry.path, newName);
    searchQuery.value = '';
    await loadDirectory(currentPath.value);
  }

  async function deleteSelected() {
    const paths = getSelectedPaths();
    if (!paths.length) return;
    await getApi().delete(paths);
    clearClipboard();
    await loadDirectory(currentPath.value);
  }

  async function cutSelected() {
    const paths = getSelectedPaths();
    if (!paths.length) return;
    setClipboard('cut', paths);
  }

  async function copySelected() {
    const paths = getSelectedPaths();
    if (!paths.length) return;
    setClipboard('copy', paths);
  }

  async function pasteToCurrent() {
    if (!hasClipboard()) return;
    const { operation } = clipboardState.value;
    const paths = getClipboardPaths();
    const dest = String(currentPath.value);
    const api = getApi();
    if (operation === 'cut') {
      await api.move(paths, dest);
      clearClipboard();
    } else {
      await api.copy(paths, dest);
    }
    await loadDirectory(currentPath.value);
  }

  async function pasteToDirectory(destDir) {
    if (!hasClipboard()) return;
    const { operation } = clipboardState.value;
    const paths = getClipboardPaths();
    const dest = String(destDir);
    const api = getApi();
    if (operation === 'cut') {
      await api.move(paths, dest);
      clearClipboard();
    } else {
      await api.copy(paths, dest);
    }
    await loadDirectory(currentPath.value, { keepSelection: true });
  }

  async function duplicateSelected() {
    const paths = getSelectedPaths();
    if (!paths.length) return;
    await getApi().duplicate(paths);
    await loadDirectory(currentPath.value);
  }

  async function moveSelectedTo(destDir) {
    const paths = getSelectedPaths();
    if (!paths.length || !destDir) return;
    await getApi().move(paths, String(destDir));
    clearClipboard();
    await loadDirectory(currentPath.value);
  }

  async function copySelectedTo(destDir) {
    const paths = getSelectedPaths();
    if (!paths.length || !destDir) return;
    await getApi().copy(paths, String(destDir));
    await loadDirectory(currentPath.value, { keepSelection: true });
  }

  async function transferPaths(sourcePaths, destDir, { copy = false } = {}) {
    const paths = toPlainPaths(sourcePaths);
    const dest = String(destDir);
    if (!paths.length || !dest) return;
    const api = getApi();
    if (copy) await api.copy(paths, dest);
    else await api.move(paths, dest);
    await loadDirectory(currentPath.value, { keepSelection: !copy });
  }

  async function importExternalFiles(sourcePaths) {
    const paths = toPlainPaths(sourcePaths);
    if (!paths.length) return;
    await getApi().importFiles(String(currentPath.value), paths);
    await loadDirectory(currentPath.value);
  }

  async function importFromDialog() {
    const files = await getApi().selectFiles('导入文件到当前目录');
    if (!files.length) return false;
    await importExternalFiles(files);
    return true;
  }

  async function pickDirectory(title) {
    return getApi().selectDirectory(title);
  }

  async function pickDirectoryAndNavigate() {
    const picked = await pickDirectory('浏览文件夹');
    if (!picked) return false;
    await navigate(picked);
    return true;
  }

  async function pickMoveTarget() {
    const picked = await pickDirectory('移动到…');
    if (!picked) return false;
    await moveSelectedTo(picked);
    return true;
  }

  async function pickCopyTarget() {
    const picked = await pickDirectory('复制到…');
    if (!picked) return false;
    await copySelectedTo(picked);
    return true;
  }

  async function exportToDesktop() {
    const paths = getSelectedPaths();
    if (!paths.length) return false;
    const api = getApi();
    const quick = await api.getQuickAccess();
    const desktop = quick.find((item) => item.id === 'desktop')?.path;
    if (!desktop) throw new Error('找不到桌面文件夹');
    await api.copy(paths, String(desktop));
    await loadDirectory(currentPath.value, { keepSelection: true });
    return true;
  }

  async function copyPathToClipboard(entryOrPaths) {
    const paths = Array.isArray(entryOrPaths)
      ? entryOrPaths
      : entryOrPaths
        ? [entryOrPaths.path]
        : getSelectedPaths();
    if (!paths.length) return;
    await getApi().writeClipboard(paths.join('\n'));
  }

  async function copyNameToClipboard(entryOrPaths) {
    const items = Array.isArray(entryOrPaths)
      ? entryOrPaths
      : entryOrPaths
        ? [entryOrPaths]
        : selectedEntries.value;
    if (!items.length) return;
    const names = items.map((e) => (typeof e === 'string' ? e : e.name));
    await getApi().writeClipboard(names.join('\n'));
  }

  async function openInSystem(entry) {
    if (isRemotePath(entry.path)) {
      await openRemoteFile(entry);
      return;
    }
    await getApi().openPath(entry.path);
  }

  async function revealInFinder(entryOrPath) {
    const target = typeof entryOrPath === 'string' ? entryOrPath : entryOrPath.path;
    await getApi().showInFolder(target);
  }

  async function openInTerminal(entryOrPath) {
    const target = typeof entryOrPath === 'string'
      ? entryOrPath
      : entryOrPath?.path ?? currentPath.value;
    await getApi().openInTerminal(target);
  }

  function closePreview() {
    resetPreview();
  }

  return {
    currentPath,
    entries,
    quickAccess,
    selectedPaths,
    lastSelectedPath,
    loading,
    error,
    searchQuery,
    viewMode,
    previewFile,
    previewMode,
    previewContent,
    previewImageUrl,
    previewImageSize,
    previewTruncated,
    selectionInfo,
    remoteConnection,
    isRemote,
    clipboardState,
    filteredEntries,
    selectedEntries,
    canGoBack,
    canGoForward,
    hasClipboard,
    init,
    navigate,
    goBack,
    goForward,
    goUp,
    openEntry,
    selectEntry,
    toggleSelect,
    selectRange,
    selectAll,
    clearSelection,
    setSelection,
    getSelectedPaths,
    createFolder,
    createFile,
    renameEntry,
    deleteSelected,
    cutSelected,
    copySelected,
    pasteToCurrent,
    pasteToDirectory,
    duplicateSelected,
    moveSelectedTo,
    copySelectedTo,
    transferPaths,
    importExternalFiles,
    importFromDialog,
    pickDirectoryAndNavigate,
    pickMoveTarget,
    pickCopyTarget,
    exportToDesktop,
    copyPathToClipboard,
    copyNameToClipboard,
    openInSystem,
    revealInFinder,
    openInTerminal,
    closePreview,
    loadDirectory,
    clearClipboard,
  };
}
