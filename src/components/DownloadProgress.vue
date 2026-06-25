<script setup>
import { computed } from 'vue';
import { formatSize } from '../composables/useFormat';

const props = defineProps({
  task: { type: Object, default: null },
  cacheDir: { type: String, default: '' },
});

const emit = defineEmits(['close', 'reveal', 'change-dir', 'cancel']);

const visible = computed(() => Boolean(props.task));
const isActive = computed(() => props.task?.phase === 'start' || props.task?.phase === 'progress');
const isDone = computed(() => props.task?.phase === 'complete');
const isError = computed(() => props.task?.phase === 'error');
const isCancelled = computed(() => props.task?.phase === 'cancelled');

const percent = computed(() => {
  const { bytes = 0, total = 0 } = props.task || {};
  if (total > 0) return Math.min(100, Math.round((bytes / total) * 100));
  if (props.task?.percent != null) return props.task.percent;
  return 0;
});

const progressLabel = computed(() => {
  const { bytes = 0, total = 0 } = props.task || {};
  if (total > 0) return `${formatSize(bytes)} / ${formatSize(total)}`;
  if (bytes > 0) return formatSize(bytes);
  return '准备中…';
});

const title = computed(() => {
  if (isCancelled.value) return '下载已取消';
  if (isError.value) return '下载失败';
  if (isDone.value) return '下载完成';
  return `正在下载「${props.task?.fileName || '文件'}」`;
});
</script>

<template>
  <Transition name="slide-up">
    <div v-if="visible" class="download-panel" role="status">
      <div class="panel-header">
        <span class="title">{{ title }}</span>
        <button type="button" class="close-btn" title="关闭" @click="emit('close')">×</button>
      </div>

      <div v-if="task?.localPath" class="path-row">
        <span class="path-label">保存位置</span>
        <span class="path-value" :title="task.localPath">{{ task.localPath }}</span>
      </div>

      <div v-if="isActive" class="progress-row">
        <div class="progress-track">
          <div
            class="progress-fill"
            :class="{ indeterminate: !task?.total }"
            :style="task?.total ? { width: `${percent}%` } : undefined"
          />
        </div>
        <span class="progress-text">
          <template v-if="task?.total">{{ percent }}%</template>
          <template v-else>下载中</template>
          · {{ progressLabel }}
        </span>
        <button type="button" class="cancel-btn" @click="emit('cancel')">取消下载</button>
      </div>

      <div v-else-if="isCancelled" class="cancelled-row">
        下载已中断，未保存的文件已删除
      </div>

      <div v-else-if="isDone" class="done-row">
        <span class="done-hint">文件已保存，正在用系统应用打开</span>
        <button type="button" class="link-btn" @click="emit('reveal')">在文件夹中显示</button>
      </div>

      <div v-else-if="isError" class="error-row">
        {{ task?.error || '下载失败' }}
      </div>

      <div v-if="cacheDir" class="cache-hint">
        <span>默认下载文件夹：{{ cacheDir }}</span>
        <button type="button" class="link-btn" @click="emit('change-dir')">更改</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.download-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: min(420px, calc(100vw - 40px));
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  z-index: 1050;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 18px;
  line-height: 1;
  color: var(--muted);
}

.close-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.path-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.path-label {
  font-size: 11px;
  color: var(--muted);
}

.path-value {
  font-size: 12px;
  color: var(--text);
  word-break: break-all;
  line-height: 1.4;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.progress-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-track {
  height: 6px;
  background: var(--surface-2);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.2s ease;
}

.progress-fill.indeterminate {
  width: 40% !important;
  animation: indeterminate 1.2s ease-in-out infinite;
}

@keyframes indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}

.progress-text {
  font-size: 12px;
  color: var(--muted);
}

.cancel-btn {
  align-self: flex-start;
  margin-top: 4px;
  font-size: 12px;
  color: var(--danger);
  padding: 0;
}

.cancel-btn:hover {
  text-decoration: underline;
}

.cancelled-row {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}

.done-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.done-hint {
  font-size: 12px;
  color: var(--muted);
}

.link-btn {
  align-self: flex-start;
  font-size: 12px;
  color: var(--accent);
  padding: 0;
}

.link-btn:hover {
  text-decoration: underline;
}

.error-row {
  font-size: 12px;
  color: var(--danger);
  line-height: 1.5;
}

.cache-hint {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: #91a0b4;
  word-break: break-all;
  line-height: 1.4;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
