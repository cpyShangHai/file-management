<script setup>
import { ref, computed } from 'vue';
import FileIcon from './FileIcon.vue';
import { formatSize, formatDate, getFileIcon } from '@/composables/useFormat';

const props = defineProps({
  file: { type: Object, default: null },
  mode: { type: String, default: null },
  content: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  imageSize: { type: Object, default: () => ({ width: 0, height: 0 }) },
  truncated: Boolean,
});

const emit = defineEmits(['close', 'open-system']);

const imageScale = ref(100);

const dimensionLabel = computed(() => {
  const { width, height } = props.imageSize;
  if (width && height) return `${width} × ${height}`;
  return '';
});

function zoomIn() {
  imageScale.value = Math.min(imageScale.value + 25, 300);
}

function zoomOut() {
  imageScale.value = Math.max(imageScale.value - 25, 25);
}

function resetZoom() {
  imageScale.value = 100;
}
</script>

<template>
  <Transition name="slide">
    <aside v-if="file" class="preview-panel" :class="{ 'is-image': mode === 'image' }">
      <div class="preview-header">
        <div class="preview-title">
          <FileIcon :type="getFileIcon(file)" :size="18" />
          <span class="name" :title="file.name">{{ file.name }}</span>
        </div>
        <button class="close-btn" title="关闭预览" @click="emit('close')">×</button>
      </div>

      <div class="preview-meta">
        <span>{{ formatSize(file.size) }}</span>
        <span>{{ formatDate(file.modified) }}</span>
        <span v-if="dimensionLabel">{{ dimensionLabel }}</span>
      </div>

      <div v-if="mode === 'image'" class="image-toolbar">
        <button class="tool-btn" title="缩小" @click="zoomOut">−</button>
        <button class="tool-btn scale-label" title="重置缩放" @click="resetZoom">{{ imageScale }}%</button>
        <button class="tool-btn" title="放大" @click="zoomIn">+</button>
        <button class="tool-btn open-btn" @click="emit('open-system')">系统打开</button>
      </div>

      <div v-if="truncated" class="preview-warn">文件较大，仅显示前 512KB</div>

      <div v-if="mode === 'image'" class="image-wrap">
        <img
          :src="imageUrl"
          :alt="file.name"
          class="preview-image"
          :style="{ width: `${imageScale}%` }"
          draggable="false"
        />
      </div>

      <pre v-else-if="mode === 'text'" class="preview-content">{{ content }}</pre>
    </aside>
  </Transition>
</template>

<style scoped>
.preview-panel {
  width: 380px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.preview-panel.is-image {
  width: 420px;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.preview-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 20px;
  line-height: 1;
  color: var(--muted);
}

.close-btn:hover {
  background: var(--surface-2);
}

.preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.image-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
}

.tool-btn {
  min-width: 32px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
  background: var(--surface-2);
}

.tool-btn:hover {
  background: var(--border);
}

.scale-label {
  min-width: 52px;
  font-size: 12px;
}

.open-btn {
  margin-left: auto;
  font-size: 12px;
}

.preview-warn {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--danger);
  background: var(--danger-soft);
}

.image-wrap {
  flex: 1;
  overflow: auto;
  padding: 16px;
  background:
    linear-gradient(45deg, #eee 25%, transparent 25%),
    linear-gradient(-45deg, #eee 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #eee 75%),
    linear-gradient(-45deg, transparent 75%, #eee 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-color: #fafafa;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.preview-image {
  max-width: none;
  height: auto;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  background: #fff;
}

.preview-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
}
</style>
