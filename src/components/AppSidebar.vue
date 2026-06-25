<script setup>
const props = defineProps({
  items: { type: Array, default: () => [] },
  remoteItems: { type: Array, default: () => [] },
  activePath: { type: String, default: '' },
});

const emit = defineEmits(['navigate', 'pick', 'add-remote', 'connect-remote', 'disconnect-remote', 'remove-remote', 'remote-contextmenu']);

function onRemoteContextMenu(item, event) {
  event.preventDefault();
  event.stopPropagation();
  emit('remote-contextmenu', item, event);
}

const icons = {
  home: 'M12 3 2 12h3v8h6v-5h2v5h6v-8h3L12 3z',
  desktop: 'M4 4h16v12H4V4zm0 14h16v2H4v-2z',
  documents: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z',
  downloads: 'M12 3v10m0 0 4-4m-4 4-4-4M4 19h16',
  pictures: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm4 10 3-3 4 5 3-4 4 5H7z',
  music: 'M9 18V5l12-2v13M9 9l12-2',
  videos: 'M4 5h16v14H4V5zm4 4v6l6-3-6-3z',
  remote: 'M4 7h16v10H4V7zm2 2v6h12V9H6zm3 8h6',
};

function isRemoteActive(item) {
  const root = item.rootPath || `remote://${item.id}`;
  return props.activePath === root || props.activePath.startsWith(`${root}/`);
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="logo">📁</span>
      <span class="title">文件管理</span>
    </div>

    <div class="section">
      <div class="section-label">快速访问</div>
      <button
        v-for="item in items"
        :key="item.id"
        class="nav-item"
        :class="{ active: activePath === item.path || activePath.startsWith(item.path + '/') }"
        @click="emit('navigate', item.path)"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path :d="icons[item.icon] || icons.documents" />
        </svg>
        {{ item.label }}
      </button>
    </div>

    <div class="section">
      <div class="section-label section-row">
        <span>远程连接</span>
        <button class="icon-btn" title="添加连接" @click="emit('add-remote')">+</button>
      </div>
      <div
        v-for="item in remoteItems"
        :key="item.id"
        class="nav-item remote-item"
        :class="{ active: isRemoteActive(item) }"
        role="button"
        tabindex="0"
        @click="emit('connect-remote', item)"
        @keydown.enter="emit('connect-remote', item)"
        @contextmenu="onRemoteContextMenu(item, $event)"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path :d="icons.remote" />
        </svg>
        <span class="remote-label">
          <span class="remote-name">
            <span v-if="item.connected" class="connected-dot" title="已连接" />
            {{ item.name }}
          </span>
          <span class="remote-host">{{ item.protocol.toUpperCase() }} · {{ item.host }}</span>
        </span>
        <div class="remote-actions">
          <button
            v-if="item.connected"
            class="action-btn"
            title="断开连接"
            @click.stop="emit('disconnect-remote', item)"
          >
            ⏻
          </button>
          <button
            class="action-btn delete-btn"
            title="删除保存的配置"
            @click.stop="emit('remove-remote', item)"
          >
            ×
          </button>
        </div>
      </div>
      <div v-if="!remoteItems.length" class="empty-remote">暂无远程连接</div>
    </div>

    <div class="sidebar-footer">
      <button class="nav-item pick-btn" @click="emit('pick')">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M12 5v14M5 12h14" />
        </svg>
        浏览其他位置…
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border);
}

.logo {
  font-size: 22px;
}

.title {
  font-size: 15px;
  font-weight: 600;
}

.section {
  padding: 12px 8px;
  flex: 1;
  overflow-y: auto;
}

.section-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 10px 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius);
  color: var(--text);
  font-size: 13px;
  text-align: left;
  transition: background 0.15s;
}

.nav-item:hover {
  background: var(--surface-2);
}

.nav-item.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--border);
}

.pick-btn {
  color: var(--muted);
}

.section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.icon-btn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--accent);
  font-size: 16px;
  line-height: 1;
}

.icon-btn:hover {
  background: var(--surface-2);
}

.remote-item {
  position: relative;
  padding-right: 52px;
  cursor: pointer;
}

.remote-label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.remote-name {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connected-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #52c41a;
  flex-shrink: 0;
}

.remote-host {
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-actions {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.remote-item:hover .remote-actions {
  opacity: 1;
}

.action-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.action-btn.delete-btn:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.empty-remote {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--muted);
}
</style>
