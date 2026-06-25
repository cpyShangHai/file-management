<script setup>
defineProps({
  type: { type: String, default: 'file' },
  size: { type: Number, default: 20 },
});

const colors = {
  folder: '#faad14',
  file: '#8c8c8c',
  image: '#52c41a',
  video: '#722ed1',
  audio: '#eb2f96',
  pdf: '#ff4d4f',
  archive: '#fa8c16',
  code: '#1677ff',
  text: '#13c2c2',
};
</script>

<template>
  <span class="file-icon" :style="{ width: `${size}px`, height: `${size}px`, color: colors[type] || colors.file }">
    <svg v-if="type === 'folder'" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
    </svg>
    <svg v-else-if="type === 'image'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
    <svg v-else-if="type === 'video'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m10 9 6 3-6 3V9z" fill="currentColor" stroke="none" />
    </svg>
    <svg v-else-if="type === 'audio'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
    <svg v-else-if="type === 'pdf'" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2 5 5h-5V4zM8 13h2v5H8v-5zm3 0h2c1.1 0 2 .9 2 2v1c0 1.1-.9 2-2 2h-2v-5zm2 3v-1h-1v1h1z" />
    </svg>
    <svg v-else-if="type === 'archive'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </svg>
    <svg v-else-if="type === 'code'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </svg>
    <svg v-else-if="type === 'text'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  </span>
</template>

<style scoped>
.file-icon {
  display: inline-flex;
}
</style>
