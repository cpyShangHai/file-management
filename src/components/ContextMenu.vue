<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';

const props = defineProps({
  visible: Boolean,
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  items: { type: Array, default: () => [] },
});

const emit = defineEmits(['select', 'close']);

const menuRef = ref(null);
const pos = ref({ x: 0, y: 0 });

async function adjustPosition() {
  await nextTick();
  if (!menuRef.value) return;
  const rect = menuRef.value.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - rect.height - 8;
  pos.value = {
    x: Math.min(props.x, Math.max(8, maxX)),
    y: Math.min(props.y, Math.max(8, maxY)),
  };
}

function onDocClick() {
  emit('close');
}

function onKeydown(e) {
  if (e.key === 'Escape') emit('close');
}

watch(() => props.visible, (v) => {
  if (v) adjustPosition();
});

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="context-menu"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
      @click.stop
      @contextmenu.prevent
    >
      <template v-for="item in items" :key="item.id">
        <div v-if="item.type === 'separator'" class="menu-sep" />
        <button
          v-else
          class="menu-item"
          :class="{ danger: item.danger, disabled: item.disabled }"
          :disabled="item.disabled"
          @click="!item.disabled && emit('select', item.id)"
        >
          <span class="label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="shortcut">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 220px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 4px;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  width: 100%;
  padding: 7px 12px;
  text-align: left;
  font-size: 13px;
  border-radius: 6px;
  color: var(--text);
}

.menu-item:hover:not(.disabled) {
  background: var(--surface-2);
}

.menu-item.danger {
  color: var(--danger);
}

.menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.shortcut {
  font-size: 11px;
  color: var(--muted);
}

.menu-sep {
  height: 1px;
  margin: 4px 8px;
  background: var(--border);
}
</style>
