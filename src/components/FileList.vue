<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import FileIcon from "./FileIcon.vue";
import { formatSize, formatDate, getFileIcon } from "@/composables/useFormat";
import {
  DRAG_TYPE,
  canAcceptDrop,
  parseDragPaths,
  isDropBlocked,
} from "@/composables/useDragTransfer";
import {
  setDragPaths,
  clearDragPaths,
  getDragPaths,
} from "@/composables/useDragSession";

const props = defineProps({
  entries: { type: Array, default: () => [] },
  selectedPaths: { type: Object, required: true },
  viewMode: { type: String, default: "list" },
  loading: Boolean,
  currentPath: { type: String, default: "" },
});

const emit = defineEmits([
  "open",
  "select",
  "contextmenu",
  "transfer",
  "import-external",
  "prepare-drag",
]);

const areaRef = ref(null);
const dropTargetPath = ref("");
const isDraggingOver = ref(false);
const marquee = ref(null);
const draggingPaths = ref([]);

const marqueeStyle = computed(() => {
  if (!marquee.value) return null;
  const { x, y, w, h } = marquee.value;
  return {
    left: `${Math.min(x, x + w)}px`,
    top: `${Math.min(y, y + h)}px`,
    width: `${Math.abs(w)}px`,
    height: `${Math.abs(h)}px`,
  };
});

function isSelected(path) {
  return props.selectedPaths.has(path);
}

function onClick(entry, event) {
  emit("select", entry, {
    multi: event.metaKey || event.ctrlKey,
    range: event.shiftKey,
  });
}

function onDblClick(entry) {
  emit("open", entry);
}

function onEntryContextMenu(entry, event) {
  emit("contextmenu", { type: "entry", entry }, event);
}

function onBlankContextMenu(event) {
  if (event.target.closest(".file-entry")) return;
  emit("contextmenu", { type: "blank" }, event);
}

function resolveDragPaths(entry) {
  emit("prepare-drag", entry);
  const selected = [...props.selectedPaths];
  return selected.length ? selected : [entry.path];
}

function resolveDropData(event) {
  return parseDragPaths(event);
}

function activeDragPaths() {
  return getDragPaths() || draggingPaths.value;
}

function onDragStart(entry, event) {
  const paths = resolveDragPaths(entry);
  draggingPaths.value = paths;
  setDragPaths(paths);

  const ghost = document.createElement("div");
  ghost.textContent = paths.length > 1 ? `${paths.length} 项` : entry.name;
  ghost.style.cssText = [
    "position:fixed;top:-1000px;left:-1000px;",
    "padding:6px 12px;background:#1677ff;color:#fff;",
    "border-radius:6px;font-size:12px;pointer-events:none;",
  ].join("");
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 0, 0);
  requestAnimationFrame(() => ghost.remove());

  event.dataTransfer.setData(
    DRAG_TYPE,
    JSON.stringify({ paths, internal: true }),
  );
  event.dataTransfer.effectAllowed = "copyMove";
}

function onDragEnd() {
  draggingPaths.value = [];
  clearDragPaths();
  dropTargetPath.value = "";
  isDraggingOver.value = false;
}

function onDragOverEntry(entry, event) {
  if (!entry.isDirectory || !canAcceptDrop(event)) return;
  const paths = activeDragPaths();
  if (isDropBlocked(entry.path, paths)) {
    event.dataTransfer.dropEffect = "none";
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = event.altKey ? "copy" : "move";
  dropTargetPath.value = entry.path;
}

function onDragLeaveEntry(entry, event) {
  const related = event.relatedTarget;
  if (related && event.currentTarget.contains(related)) return;
  if (dropTargetPath.value === entry.path) dropTargetPath.value = "";
}

function onDropEntry(entry, event) {
  event.preventDefault();
  event.stopPropagation();
  dropTargetPath.value = "";
  isDraggingOver.value = false;
  if (!entry.isDirectory) return;
  const data = resolveDropData(event);
  if (!data || isDropBlocked(entry.path, data.paths)) return;
  emit("transfer", {
    paths: data.paths,
    destDir: entry.path,
    copy: event.altKey || !data.internal,
    internal: data.internal,
  });
}

function onAreaDragOver(event) {
  if (!canAcceptDrop(event)) return;
  event.preventDefault();
  isDraggingOver.value = true;
  const isInternal =
    Boolean(activeDragPaths().length) ||
    event.dataTransfer.types.includes(DRAG_TYPE) ||
    event.dataTransfer.types.includes("text/plain");
  event.dataTransfer.dropEffect = isInternal && !event.altKey ? "move" : "copy";
}

function onAreaDragLeave(event) {
  const related = event.relatedTarget;
  if (related && areaRef.value?.contains(related)) return;
  isDraggingOver.value = false;
  dropTargetPath.value = "";
}

function onAreaDrop(event) {
  if (event.target.closest(".file-entry")) return;
  event.preventDefault();
  isDraggingOver.value = false;
  dropTargetPath.value = "";

  const data = resolveDropData(event);
  if (!data) return;

  if (data.internal) {
    emit("transfer", {
      paths: data.paths,
      destDir: props.currentPath,
      copy: event.altKey,
      internal: true,
    });
  } else {
    emit("import-external", data.paths);
  }
}

function getRelativePoint(event) {
  const rect = areaRef.value.getBoundingClientRect();
  return {
    x: event.clientX - rect.left + areaRef.value.scrollLeft,
    y: event.clientY - rect.top + areaRef.value.scrollTop,
  };
}

function onMarqueeStart(event) {
  if (event.button !== 0) return;
  if (event.target.closest(".file-entry")) return;
  const start = getRelativePoint(event);
  marquee.value = {
    x: start.x,
    y: start.y,
    w: 0,
    h: 0,
    additive: event.metaKey || event.ctrlKey,
  };

  function onMove(e) {
    const cur = getRelativePoint(e);
    marquee.value = {
      ...marquee.value,
      w: cur.x - marquee.value.x,
      h: cur.y - marquee.value.y,
    };
  }

  function onUp() {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    if (!marquee.value) return;

    const box = marquee.value;
    const left = Math.min(box.x, box.x + box.w);
    const top = Math.min(box.y, box.y + box.h);
    const right = left + Math.abs(box.w);
    const bottom = top + Math.abs(box.h);

    if (Math.abs(box.w) > 4 || Math.abs(box.h) > 4) {
      const nodes = areaRef.value.querySelectorAll("[data-path]");
      const paths = [];
      nodes.forEach((node) => {
        const nr = node.getBoundingClientRect();
        const ar = areaRef.value.getBoundingClientRect();
        const nx = nr.left - ar.left + areaRef.value.scrollLeft;
        const ny = nr.top - ar.top + areaRef.value.scrollTop;
        const intersect =
          nx < right &&
          nx + nr.width > left &&
          ny < bottom &&
          ny + nr.height > top;
        if (intersect) paths.push(node.dataset.path);
      });
      emit("select", null, { marquee: paths, additive: box.additive });
    }
    marquee.value = null;
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

onMounted(() => {
  areaRef.value?.addEventListener("mousedown", onMarqueeStart);
});

onUnmounted(() => {
  areaRef.value?.removeEventListener("mousedown", onMarqueeStart);
});
</script>

<template>
  <div
    ref="areaRef"
    class="file-area"
    :class="{ 'drag-over': isDraggingOver }"
    @dragover="onAreaDragOver"
    @dragleave="onAreaDragLeave"
    @drop="onAreaDrop"
    @contextmenu="onBlankContextMenu"
  >
    <div v-if="loading" class="state">加载中…</div>
    <div v-else-if="!entries.length" class="state empty">
      此文件夹为空 — 可拖拽文件到此处导入
    </div>

    <!-- 列表视图：使用 div 布局，避免 table 行无法拖拽 -->
    <div v-else-if="viewMode === 'list'" class="list-view">
      <div class="list-header">
        <div class="col-name">名称</div>
        <div class="col-size">大小</div>
        <div class="col-date">修改时间</div>
      </div>
      <div
        v-for="entry in entries"
        :key="entry.path"
        class="list-row file-entry"
        :data-path="entry.path"
        draggable="true"
        :class="{
          selected: isSelected(entry.path),
          'drop-target': dropTargetPath === entry.path,
        }"
        @click="onClick(entry, $event)"
        @dblclick="onDblClick(entry)"
        @contextmenu="onEntryContextMenu(entry, $event)"
        @dragstart="onDragStart(entry, $event)"
        @dragend="onDragEnd"
        @dragover="onDragOverEntry(entry, $event)"
        @dragleave="onDragLeaveEntry(entry, $event)"
        @drop="onDropEntry(entry, $event)"
      >
        <div class="col-name">
          <FileIcon :type="getFileIcon(entry)" :size="20" />
          <span class="entry-name" :title="entry.name">{{ entry.name }}</span>
        </div>
        <div class="col-size">
          {{ entry.isDirectory ? "—" : formatSize(entry.size) }}
        </div>
        <div class="col-date">{{ formatDate(entry.modified) }}</div>
      </div>
    </div>

    <!-- 网格视图 -->
    <div v-else class="file-grid">
      <div
        v-for="entry in entries"
        :key="entry.path"
        class="grid-item file-entry"
        :data-path="entry.path"
        draggable="true"
        :class="{
          selected: isSelected(entry.path),
          'drop-target': dropTargetPath === entry.path,
        }"
        @click="onClick(entry, $event)"
        @dblclick="onDblClick(entry)"
        @contextmenu="onEntryContextMenu(entry, $event)"
        @dragstart="onDragStart(entry, $event)"
        @dragend="onDragEnd"
        @dragover="onDragOverEntry(entry, $event)"
        @dragleave="onDragLeaveEntry(entry, $event)"
        @drop="onDropEntry(entry, $event)"
      >
        <FileIcon :type="getFileIcon(entry)" :size="40" />
        <span class="grid-name" :title="entry.name">{{ entry.name }}</span>
      </div>
    </div>

    <div v-if="marqueeStyle" class="marquee" :style="marqueeStyle" />

    <div v-if="isDraggingOver" class="drop-overlay">
      松开以放入当前文件夹
      <span class="hint">按住 ⌥ 复制 · 否则移动</span>
    </div>
  </div>
</template>

<style scoped>
.file-area {
  flex: 1;
  overflow: auto;
  background: var(--surface);
  position: relative;
}

.file-area.drag-over {
  outline: 2px dashed var(--accent);
  outline-offset: -4px;
}

.state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  font-size: 14px;
}

.list-view {
  display: flex;
  flex-direction: column;
  min-width: 100%;
}

.list-header,
.list-row {
  display: grid;
  grid-template-columns: 1fr 100px 160px;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  font-size: 13px;
}

.list-header {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 36px;
  background: var(--surface-2);
  color: var(--muted);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
}

.list-row {
  min-height: 36px;
  border-bottom: 1px solid var(--border);
  cursor: grab;
  user-select: none;
}

.list-row:active {
  cursor: grabbing;
}

.list-row:hover {
  background: var(--surface-2);
}

.list-row.selected {
  background: var(--accent-soft);
}

.list-row.drop-target {
  background: #d9f7be;
  outline: 2px solid var(--success);
  outline-offset: -2px;
}

.col-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.entry-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-size,
.col-date {
  color: var(--muted);
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  padding: 16px;
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 8px;
  border-radius: var(--radius);
  cursor: grab;
  user-select: none;
  text-align: center;
}

.grid-item:active {
  cursor: grabbing;
}

.grid-item:hover {
  background: var(--surface-2);
}

.grid-item.selected {
  background: var(--accent-soft);
}

.grid-item.drop-target {
  background: #d9f7be;
  outline: 2px solid var(--success);
}

.grid-name {
  font-size: 12px;
  line-height: 1.3;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.marquee {
  position: absolute;
  border: 1px solid var(--accent);
  background: rgba(22, 119, 255, 0.067);
  pointer-events: none;
  z-index: 5;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(230, 244, 255, 0.643);
  color: var(--accent);
  font-size: 15px;
  font-weight: 500;
  pointer-events: none;
  z-index: 4;
}

.hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
</style>
