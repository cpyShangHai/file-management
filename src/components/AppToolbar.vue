<script setup>
import { FTP_ENCODING_OPTIONS } from '../composables/useRemoteConnections';

defineProps({
  canGoBack: Boolean,
  canGoForward: Boolean,
  searchQuery: String,
  viewMode: String,
  selectedCount: { type: Number, default: 0 },
  hasClipboard: Boolean,
  showFtpEncoding: Boolean,
  ftpEncoding: { type: String, default: 'gbk' },
});

const emit = defineEmits([
  'back',
  'forward',
  'up',
  'refresh',
  'search',
  'viewMode',
  'newFolder',
  'newFile',
  'import',
  'paste',
  'delete',
  'rename',
  'encodingChange',
]);
</script>

<template>
  <header class="toolbar">
    <div class="nav-group">
      <button class="icon-btn" :disabled="!canGoBack" title="后退" @click="emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <button class="icon-btn" :disabled="!canGoForward" title="前进" @click="emit('forward')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6" /></svg>
      </button>
      <button class="icon-btn" title="上级目录" @click="emit('up')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
      <button class="icon-btn" title="刷新 ⌘R" @click="emit('refresh')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
      </button>
    </div>

    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input
        :value="searchQuery"
        type="search"
        placeholder="搜索当前目录…"
        class="search-input"
        @input="emit('search', $event.target.value)"
      />
    </div>

    <div v-if="showFtpEncoding" class="encoding-wrap">
      <label class="encoding-label" for="ftp-encoding">编码</label>
      <select
        id="ftp-encoding"
        class="encoding-select"
        :value="ftpEncoding"
        title="FTP 文件名与文本预览编码"
        @change="emit('encodingChange', $event.target.value)"
      >
        <option v-for="opt in FTP_ENCODING_OPTIONS" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div class="actions">
      <button class="text-btn" title="新建文件夹 ⌘⇧N" @click="emit('newFolder')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>
        新建文件夹
      </button>
      <button class="text-btn" title="新建文件 ⌘N" @click="emit('newFile')">
        新建文件
      </button>
      <button class="text-btn" @click="emit('import')">导入</button>
      <button
        class="text-btn"
        :disabled="!hasClipboard"
        title="粘贴 ⌘V"
        @click="emit('paste')"
      >
        粘贴
      </button>
      <button
        v-if="selectedCount === 1"
        class="text-btn"
        @click="emit('rename')"
      >
        重命名
      </button>
      <button
        v-if="selectedCount > 0"
        class="text-btn danger"
        @click="emit('delete')"
      >
        删除 ({{ selectedCount }})
      </button>

      <div class="view-toggle">
        <button
          class="icon-btn"
          :class="{ active: viewMode === 'list' }"
          title="列表视图"
          @click="emit('viewMode', 'list')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </button>
        <button
          class="icon-btn"
          :class="{ active: viewMode === 'grid' }"
          title="网格视图"
          @click="emit('viewMode', 'grid')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.nav-group {
  display: flex;
  gap: 4px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text);
}

.icon-btn svg {
  width: 18px;
  height: 18px;
}

.icon-btn:hover:not(:disabled) {
  background: var(--surface-2);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.icon-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.search-wrap {
  flex: 1;
  position: relative;
  max-width: 360px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--muted);
}

.search-input {
  width: 100%;
  padding: 7px 12px 7px 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: var(--accent);
  background: var(--surface);
}

.encoding-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.encoding-label {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}

.encoding-select {
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 12px;
  color: var(--text);
  max-width: 180px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.text-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
}

.text-btn svg {
  width: 16px;
  height: 16px;
}

.text-btn:hover:not(:disabled) {
  background: var(--surface-2);
}

.text-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.text-btn.danger {
  color: var(--danger);
}

.text-btn.danger:hover {
  background: var(--danger-soft);
}

.view-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-2);
  border-radius: 8px;
}
</style>
