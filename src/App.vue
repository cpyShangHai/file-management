<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import AppSidebar from './components/AppSidebar.vue';
import AppToolbar from './components/AppToolbar.vue';
import Breadcrumb from './components/Breadcrumb.vue';
import FileList from './components/FileList.vue';
import FilePreview from './components/FilePreview.vue';
import AppModal from './components/AppModal.vue';
import ContextMenu from './components/ContextMenu.vue';
import RemoteConnectModal from './components/RemoteConnectModal.vue';
import DownloadProgress from './components/DownloadProgress.vue';
import { useFileManager } from './composables/useFileManager';
import { useRemoteConnections } from './composables/useRemoteConnections';
import { buildEntryContextMenu, buildBlankContextMenu, buildRemoteContextMenu } from './composables/useContextMenu';

const fm = useFileManager();
const remote = useRemoteConnections();

const {
  currentPath,
  quickAccess,
  selectedPaths,
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
  selectRange,
  selectAll,
  clearSelection,
  createFolder,
  createFile,
  renameEntry,
  deleteSelected,
  cutSelected,
  copySelected,
  pasteToCurrent,
  pasteToDirectory,
  duplicateSelected,
  pickDirectoryAndNavigate,
  pickMoveTarget,
  pickCopyTarget,
  exportToDesktop,
  copyPathToClipboard,
  copyNameToClipboard,
  revealInFinder,
  closePreview,
  openInSystem,
  openInTerminal,
  loadDirectory,
  transferPaths,
  importExternalFiles,
  importFromDialog,
  isRemote,
  remoteConnection,
} = fm;

const {
  connections: remoteConnections,
  loading: remoteLoading,
  refresh: refreshRemoteConnections,
  connect: connectRemote,
  disconnect: disconnectRemote,
  removeConnection: removeRemoteConnection,
  setEncoding: setRemoteEncoding,
} = remote;

const modal = ref({ type: null, target: null });
const modalInput = ref('');
const remoteModal = ref({ visible: false, target: null });
const contextMenu = ref({ visible: false, x: 0, y: 0, target: null });
const toast = ref('');
const downloadTask = ref(null);
const remoteCacheDir = ref('');
let unsubscribeDownload = null;

const selectedCount = computed(() => selectedPaths.value.size);

const ftpEncoding = computed(() => remoteConnection.value?.encoding || 'gbk');
const showFtpEncoding = computed(() => isRemote.value && remoteConnection.value?.protocol === 'ftp');

const pathLabels = computed(() => {
  const labels = {};
  for (const item of remoteConnections.value) {
    labels[item.id] = item.name;
  }
  if (remoteConnection.value?.id) {
    labels[remoteConnection.value.id] = remoteConnection.value.name;
  }
  return labels;
});

const contextMenuItems = computed(() => {
  const { target } = contextMenu.value;
  if (!target) return [];

  if (target.type === 'remote') {
    return buildRemoteContextMenu({ item: target.item });
  }

  if (target.type === 'blank') {
    return buildBlankContextMenu({ hasClipboard: hasClipboard(), isRemote: isRemote.value });
  }

  const entry = target.entry;
  return buildEntryContextMenu({
    entry,
    selectedCount: selectedCount.value,
    hasClipboard: hasClipboard(),
    isText: entry.isText,
    isImage: entry.isImage,
    isRemote: isRemote.value,
  });
});

function showToast(msg) {
  toast.value = msg;
  setTimeout(() => { toast.value = ''; }, 2800);
}

function setSearchQuery(value) {
  searchQuery.value = value;
}

function setViewMode(mode) {
  viewMode.value = mode;
}

async function runAction(fn, successMsg) {
  try {
    const result = await fn();
    if (successMsg && result !== false) showToast(successMsg);
    return result !== false;
  } catch (err) {
    showToast(err.message || '操作失败');
    return false;
  }
}

function openNewFolderModal() {
  modalInput.value = '新建文件夹';
  modal.value = { type: 'newfolder', target: null };
}

function openNewFileModal() {
  modalInput.value = '新建文件.txt';
  modal.value = { type: 'newfile', target: null };
}

function openRenameModal() {
  const entry = selectedEntries.value[0];
  if (!entry) return;
  modalInput.value = entry.name;
  modal.value = { type: 'rename', target: entry };
}

function openDeleteModal() {
  if (!selectedCount.value) return;
  modal.value = { type: 'delete', target: null };
}

function openRemoteModal(target = null) {
  remoteModal.value = { visible: true, target };
}

function closeRemoteModal() {
  remoteModal.value = { visible: false, target: null };
}

async function onRemoteConnect(config) {
  if (!config.host || !config.username) {
    return showToast('请填写主机和用户名');
  }
  const ok = await runAction(async () => {
    const result = await connectRemote(config);
    await navigate(result.rootPath, { replaceHistory: true });
    closeRemoteModal();
  }, '已连接远程服务器');
  if (!ok) return;
}

async function onConnectSavedRemote(item) {
  if (item.connected) {
    await runAction(() => navigate(item.rootPath, { replaceHistory: true }));
    return;
  }
  if (item.hasPassword) {
    const ok = await runAction(async () => {
      const result = await connectRemote({ id: item.id, savePassword: true });
      await navigate(result.rootPath, { replaceHistory: true });
    }, '已连接远程服务器');
    if (!ok) openRemoteModal(item);
    return;
  }
  openRemoteModal(item);
}

async function onDisconnectRemote(item) {
  await runAction(async () => {
    await disconnectRemote(item.id);
    if (currentPath.value.startsWith(`remote://${item.id}`)) {
      const home = await window.fileManager.getHomePath();
      await navigate(home, { replaceHistory: true });
    }
  }, '已断开连接');
}

function requestRemoveRemote(item) {
  modal.value = { type: 'deleteRemote', target: item };
}

async function onRemoveRemote() {
  const item = modal.value.target;
  modal.value = { type: null, target: null };
  if (!item) return;
  await runAction(async () => {
    await removeRemoteConnection(item.id);
    if (currentPath.value.startsWith(`remote://${item.id}`)) {
      const home = await window.fileManager.getHomePath();
      await navigate(home, { replaceHistory: true });
    }
  }, '已删除连接配置');
}

async function onEncodingChange(encoding) {
  if (!remoteConnection.value?.id) return;
  await runAction(async () => {
    await setRemoteEncoding(remoteConnection.value.id, encoding);
    remoteConnection.value = { ...remoteConnection.value, encoding };
    await loadDirectory(currentPath.value);
  }, '编码已切换');
}

async function confirmModal() {
  const { type, target } = modal.value;
  const value = modalInput.value.trim();
  modal.value = { type: null, target: null };
  modalInput.value = '';

  if (type === 'newfolder') {
    if (!value) return showToast('文件夹名称不能为空');
    await runAction(() => createFolder(value), '文件夹已创建');
  } else if (type === 'newfile') {
    if (!value) return showToast('文件名称不能为空');
    await runAction(() => createFile(value), '文件已创建');
  } else if (type === 'rename' && target) {
    if (!value) return showToast('名称不能为空');
    await runAction(() => renameEntry(target, value), '已重命名');
  } else if (type === 'delete') {
    await runAction(() => deleteSelected(), '已删除');
  }
}

function cancelModal() {
  modal.value = { type: null, target: null };
  modalInput.value = '';
}

async function onOpenEntry(entry) {
  await runAction(() => openEntry(entry));
}

function closeDownloadPanel() {
  const task = downloadTask.value;
  if (task?.downloadId && (task.phase === 'start' || task.phase === 'progress')) {
    window.fileManager?.cancelDownload?.(task.downloadId);
  }
  downloadTask.value = null;
}

async function cancelDownload() {
  const id = downloadTask.value?.downloadId;
  if (!id) return;
  await window.fileManager?.cancelDownload?.(id);
}

async function revealDownloadFile() {
  if (!downloadTask.value?.localPath) return;
  await runAction(() => window.fileManager.showInFolder(downloadTask.value.localPath));
}

async function changeRemoteDownloadDir() {
  const dir = await window.fileManager.pickRemoteDownloadDir();
  if (!dir) return;
  remoteCacheDir.value = dir;
  showToast(`下载文件夹已设为：${dir}`);
}

function onSelect(entry, opts = {}) {
  if (opts.marquee) {
    const next = opts.additive ? new Set([...selectedPaths.value, ...opts.marquee]) : new Set(opts.marquee);
    selectRange([...next]);
    return;
  }
  if (!entry) return;
  selectEntry(entry, opts);
}

function onPrepareDrag(entry) {
  if (!selectedPaths.value.has(entry.path)) {
    selectEntry(entry, { multi: false });
  }
}

function onRemoteContextMenu(item, event) {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    target: { type: 'remote', item },
  };
}

function onContextMenu(target, event) {
  event.preventDefault();
  if (target.type === 'entry' && !selectedPaths.value.has(target.entry.path)) {
    selectEntry(target.entry, { multi: false });
  }
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, target };
}

function closeContextMenu() {
  contextMenu.value = { visible: false, x: 0, y: 0, target: null };
}

async function onContextSelect(action) {
  const { target } = contextMenu.value;
  closeContextMenu();
  if (!target) return;

  if (target.type === 'remote') {
    const item = target.item;
    switch (action) {
      case 'remoteConnect':
        await onConnectSavedRemote(item);
        break;
      case 'remoteEdit':
        openRemoteModal(item);
        break;
      case 'remoteDisconnect':
        await onDisconnectRemote(item);
        break;
      case 'remoteDelete':
        requestRemoveRemote(item);
        break;
      default:
        break;
    }
    return;
  }

  const entry = target.entry;

  switch (action) {
    case 'open':
      if (entry) await runAction(() => openEntry(entry));
      break;
    case 'preview':
      if (entry && (entry.isText || entry.isImage)) await runAction(() => openEntry(entry));
      break;
    case 'cut':
      await runAction(() => cutSelected(), '已剪切到剪贴板');
      break;
    case 'copy':
      await runAction(() => copySelected(), '已复制到剪贴板');
      break;
    case 'paste':
      if (entry?.isDirectory) await runAction(() => pasteToDirectory(entry.path), '已粘贴');
      else await runAction(() => pasteToCurrent(), '已粘贴');
      break;
    case 'duplicate':
      await runAction(() => duplicateSelected(), '已创建副本');
      break;
    case 'rename':
      if (entry) openRenameModal();
      break;
    case 'delete':
      openDeleteModal();
      break;
    case 'moveTo':
      await runAction(() => pickMoveTarget(), '已移动');
      break;
    case 'copyTo':
      await runAction(() => pickCopyTarget(), '已复制');
      break;
    case 'exportDesktop':
      await runAction(() => exportToDesktop(), '已导出到桌面');
      break;
    case 'exportLocal':
      await runAction(() => pickCopyTarget(), '已导出到本地');
      break;
    case 'copyPath':
      await runAction(() => copyPathToClipboard(entry), '路径已复制');
      break;
    case 'copyName':
      await runAction(() => copyNameToClipboard(entry), '名称已复制');
      break;
    case 'reveal':
      if (entry) await runAction(() => revealInFinder(entry));
      break;
    case 'terminal':
      if (target.type === 'blank') {
        await runAction(() => openInTerminal(currentPath.value), '已在终端中打开');
      } else if (entry) {
        await runAction(() => openInTerminal(entry), '已在终端中打开');
      }
      break;
    case 'newFolder':
      openNewFolderModal();
      break;
    case 'newFile':
      openNewFileModal();
      break;
    case 'import':
      await runAction(() => importFromDialog(), '文件已导入');
      break;
    case 'selectAll':
      selectAll();
      break;
    case 'refresh':
      await runAction(() => loadDirectory(currentPath.value));
      break;
    default:
      break;
  }
}

async function onTransfer({ paths, destDir, copy }) {
  const label = copy ? '已复制' : '已移动';
  await runAction(() => transferPaths(paths, destDir, { copy }), label);
}

async function onImportExternal(paths) {
  await runAction(() => importExternalFiles(paths), `已导入 ${paths.length} 项`);
}

function onKeydown(e) {
  if (modal.value.type) return;
  const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !inInput) {
    e.preventDefault();
    selectAll();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !inInput && selectedCount.value) {
    e.preventDefault();
    if (e.altKey) runAction(() => copyPathToClipboard(), '路径已复制');
    else runAction(() => copySelected(), '已复制到剪贴板');
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x' && !inInput && selectedCount.value) {
    e.preventDefault();
    runAction(() => cutSelected(), '已剪切到剪贴板');
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && !inInput && hasClipboard()) {
    e.preventDefault();
    runAction(() => pasteToCurrent(), '已粘贴');
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'n' && !inInput) {
    e.preventDefault();
    openNewFolderModal();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'n' && !inInput) {
    e.preventDefault();
    openNewFileModal();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm' && !inInput && selectedCount.value) {
    e.preventDefault();
    runAction(() => pickMoveTarget(), '已移动');
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd' && !inInput && selectedCount.value) {
    e.preventDefault();
    runAction(() => pickCopyTarget(), '已复制');
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't' && !inInput && !isRemote.value) {
    e.preventDefault();
    const target = selectedCount.value === 1
      ? selectedEntries.value[0]
      : currentPath.value;
    runAction(() => openInTerminal(target), '已在终端中打开');
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r' && !inInput) {
    e.preventDefault();
    if (isRemote.value) {
      runAction(() => loadDirectory(currentPath.value));
      return;
    }
    if (selectedCount.value === 1) runAction(() => revealInFinder(selectedEntries.value[0]));
    else runAction(() => loadDirectory(currentPath.value));
    return;
  }

  if (e.key === 'Backspace' && !inInput && !e.metaKey) {
    e.preventDefault();
    runAction(() => goUp());
    return;
  }

  if ((e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) && selectedCount.value && !inInput) {
    e.preventDefault();
    openDeleteModal();
    return;
  }

  if (e.key === 'F2' && selectedCount.value === 1 && !inInput) {
    openRenameModal();
    return;
  }

  if (e.key === 'Enter' && selectedCount.value === 1 && !inInput) {
    runAction(() => openEntry(selectedEntries.value[0]));
    return;
  }

  if (e.key === 'Escape') {
    if (previewFile.value) closePreview();
    else clearSelection();
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown);
  if (window.fileManager?.onDownloadProgress) {
    unsubscribeDownload = window.fileManager.onDownloadProgress((data) => {
      downloadTask.value = { ...(downloadTask.value || {}), ...data };
    });
  }
  if (window.fileManager?.getRemoteCacheDir) {
    remoteCacheDir.value = await window.fileManager.getRemoteCacheDir();
  }
  await refreshRemoteConnections();
  await runAction(() => init());
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  unsubscribeDownload?.();
});
</script>

<template>
  <div class="app-shell">
    <AppSidebar
      :items="quickAccess"
      :remote-items="remoteConnections"
      :active-path="currentPath"
      @navigate="(p) => runAction(() => navigate(p))"
      @pick="() => runAction(() => pickDirectoryAndNavigate())"
      @add-remote="openRemoteModal()"
      @connect-remote="onConnectSavedRemote"
      @disconnect-remote="onDisconnectRemote"
      @remove-remote="requestRemoveRemote"
      @remote-contextmenu="onRemoteContextMenu"
    />

    <div class="main">
      <AppToolbar
        :can-go-back="canGoBack"
        :can-go-forward="canGoForward"
        :search-query="searchQuery"
        :view-mode="viewMode"
        :selected-count="selectedCount"
        :has-clipboard="hasClipboard()"
        :show-ftp-encoding="showFtpEncoding"
        :ftp-encoding="ftpEncoding"
        @back="() => runAction(() => goBack())"
        @forward="() => runAction(() => goForward())"
        @up="() => runAction(() => goUp())"
        @refresh="() => runAction(() => loadDirectory(currentPath))"
        @search="setSearchQuery"
        @view-mode="setViewMode"
        @new-folder="openNewFolderModal"
        @new-file="openNewFileModal"
        @import="() => runAction(() => importFromDialog(), '文件已导入')"
        @paste="() => runAction(() => pasteToCurrent(), '已粘贴')"
        @delete="openDeleteModal"
        @rename="openRenameModal"
        @encoding-change="onEncodingChange"
      />

      <div class="path-bar">
        <Breadcrumb
          :path="currentPath"
          :path-labels="pathLabels"
          @navigate="(p) => runAction(() => navigate(p))"
          @transfer="onTransfer"
        />
      </div>

      <div v-if="error" class="error-bar">{{ error }}</div>

      <div class="content">
        <FileList
          :entries="filteredEntries"
          :selected-paths="selectedPaths"
          :view-mode="viewMode"
          :loading="loading"
          :current-path="currentPath"
          @open="onOpenEntry"
          @select="onSelect"
          @prepare-drag="onPrepareDrag"
          @contextmenu="onContextMenu"
          @transfer="onTransfer"
          @import-external="onImportExternal"
        />

        <FilePreview
          :file="previewFile"
          :mode="previewMode"
          :content="previewContent"
          :image-url="previewImageUrl"
          :image-size="previewImageSize"
          :truncated="previewTruncated"
          @close="closePreview()"
          @open-system="() => previewFile && runAction(() => openInSystem(previewFile))"
        />
      </div>

      <footer class="status-bar">
        <span>{{ filteredEntries.length }} 项</span>
        <span v-if="selectedCount">已选 {{ selectedCount }} 项</span>
        <span v-if="isRemote" class="remote-badge">
          {{ remoteConnection?.protocol?.toUpperCase() || 'REMOTE' }}
          <button
            v-if="remoteConnection?.id"
            class="disconnect-link"
            @click="onDisconnectRemote({ id: remoteConnection.id })"
          >
            断开
          </button>
        </span>
        <span class="hint">拖动移动 · 按住 ⌥ 复制 · 右键「导出到桌面」</span>
        <span class="path">{{ currentPath }}</span>
      </footer>
    </div>

    <AppModal
      v-model="modalInput"
      :visible="modal.type === 'newfolder' || modal.type === 'rename' || modal.type === 'newfile'"
      :title="modal.type === 'rename' ? '重命名' : modal.type === 'newfile' ? '新建文件' : '新建文件夹'"
      @confirm="confirmModal"
      @cancel="cancelModal"
    />

    <AppModal
      :visible="modal.type === 'delete'"
      title="确认删除"
      confirm-text="删除"
      danger
      @confirm="confirmModal"
      @cancel="cancelModal"
    >
      <p class="confirm-text">
        确定要删除选中的 {{ selectedCount }} 个项目吗？此操作不可撤销。
      </p>
    </AppModal>

    <ContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenuItems"
      @select="onContextSelect"
      @close="closeContextMenu"
    />

    <AppModal
      :visible="modal.type === 'deleteRemote'"
      title="删除连接配置"
      confirm-text="删除"
      danger
      @confirm="onRemoveRemote"
      @cancel="cancelModal"
    >
      <p class="confirm-text">
        确定删除「{{ modal.target?.name }}」的保存配置吗？<br />
        仅删除侧边栏条目，不会删除服务器上的文件。下次连接需重新输入密码。
      </p>
    </AppModal>

    <RemoteConnectModal
      :visible="remoteModal.visible"
      :initial="remoteModal.target"
      :loading="remoteLoading"
      @confirm="onRemoteConnect"
      @cancel="closeRemoteModal"
    />

    <DownloadProgress
      :task="downloadTask"
      :cache-dir="remoteCacheDir"
      @close="closeDownloadPanel"
      @cancel="cancelDownload"
      @reveal="revealDownloadFile"
      @change-dir="changeRemoteDownloadDir"
    />

    <Transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100%;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.path-bar {
  padding: 8px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.error-bar {
  padding: 8px 16px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
}

.content {
  flex: 1;
  display: flex;
  min-height: 0;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 16px;
  font-size: 12px;
  color: var(--muted);
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.status-bar .hint {
  color: #91a0b4;
  font-size: 11px;
}

.remote-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
}

.disconnect-link {
  padding: 0 4px;
  border-radius: 4px;
  color: var(--accent);
  font-size: 11px;
  text-decoration: underline;
}

.disconnect-link:hover {
  background: rgba(22, 119, 255, 0.12);
}

.status-bar .path {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 36%;
}

.confirm-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted);
}

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  background: rgba(31, 35, 41, 0.92);
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
  z-index: 1100;
  pointer-events: none;
}
</style>
