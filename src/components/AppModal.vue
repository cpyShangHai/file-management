<script setup>
defineProps({
  visible: Boolean,
  title: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  danger: Boolean,
  loading: Boolean,
});

const emit = defineEmits(['confirm', 'cancel']);

const model = defineModel({ type: String, default: '' });
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="modal-overlay" @click.self="emit('cancel')">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">{{ title }}</div>
          <div class="modal-body">
            <slot>
              <input
                v-model="model"
                class="modal-input"
                autofocus
                @keydown.enter="emit('confirm')"
                @keydown.esc="emit('cancel')"
              />
            </slot>
          </div>
          <div class="modal-footer">
            <button class="btn" @click="emit('cancel')">{{ cancelText }}</button>
            <button
              class="btn primary"
              :class="{ danger }"
              :disabled="loading"
              @click="emit('confirm')"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 900;
}

.modal {
  width: 400px;
  max-width: calc(100vw - 32px);
  background: var(--surface);
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.modal-header {
  padding: 16px 20px 0;
  font-size: 16px;
  font-weight: 600;
}

.modal-body {
  padding: 16px 20px;
}

.modal-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  outline: none;
}

.modal-input:focus {
  border-color: var(--accent);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 20px 16px;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
}

.btn:hover {
  background: var(--surface-2);
}

.btn.primary {
  background: var(--accent);
  color: #fff;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

.btn.primary.danger {
  background: var(--danger);
}
</style>
