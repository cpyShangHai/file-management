<script setup>
import { computed, ref } from 'vue';
import { splitPath } from '@/composables/useFormat';
import { canAcceptDrop, parseDragPaths, isDropBlocked } from '@/composables/useDragTransfer';

const props = defineProps({
  path: { type: String, required: true },
  pathLabels: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['navigate', 'transfer']);

const dropTargetPath = ref('');

const segments = computed(() => splitPath(props.path, props.pathLabels));

function onDragOver(seg, event) {
  if (!canAcceptDrop(event)) return;

  const data = parseDragPaths(event);
  const paths = data?.paths || [];
  if (isDropBlocked(seg.path, paths)) {
    event.dataTransfer.dropEffect = 'none';
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
  dropTargetPath.value = seg.path;
}

function onDragLeave(seg, event) {
  const related = event.relatedTarget;
  if (related && event.currentTarget.contains(related)) return;
  if (dropTargetPath.value === seg.path) dropTargetPath.value = '';
}

function onDrop(seg, event) {
  event.preventDefault();
  event.stopPropagation();
  dropTargetPath.value = '';

  const data = parseDragPaths(event);
  if (!data) return;
  if (isDropBlocked(seg.path, data.paths)) return;

  emit('transfer', {
    paths: data.paths,
    destDir: seg.path,
    copy: event.altKey || !data.internal,
    internal: data.internal,
  });
}

function onDragOverNav(event) {
  if (canAcceptDrop(event)) event.preventDefault();
}

function onDragLeaveNav(event) {
  const related = event.relatedTarget;
  if (related && event.currentTarget.contains(related)) return;
  dropTargetPath.value = '';
}
</script>

<template>
  <nav
    class="breadcrumb"
    aria-label="路径导航"
    @dragover="onDragOverNav"
    @dragleave="onDragLeaveNav"
  >
    <button
      v-for="(seg, idx) in segments"
      :key="seg.path"
      type="button"
      class="crumb"
      :class="{
        last: idx === segments.length - 1,
        'drop-target': dropTargetPath === seg.path,
      }"
      @click="emit('navigate', seg.path)"
      @dragover="onDragOver(seg, $event)"
      @dragleave="onDragLeave(seg, $event)"
      @drop="onDrop(seg, $event)"
    >
      <span v-if="idx > 0" class="sep">/</span>
      {{ seg.name }}
    </button>
  </nav>
</template>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  min-width: 0;
}

.crumb {
  color: var(--muted);
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 6px;
  white-space: nowrap;
  border: 2px solid transparent;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}

.crumb:hover:not(.last) {
  background: var(--surface-2);
  color: var(--accent);
}

.crumb.last {
  color: var(--text);
  font-weight: 500;
}

.crumb.drop-target {
  background: #d9f7be;
  border-color: var(--success);
  color: #237804;
}

.sep {
  margin-right: 4px;
  color: var(--border);
}
</style>
