<script setup lang="ts">
defineProps<{ title: string; done: boolean }>();
</script>

<template>
  <li class="item" :class="{ done }">
    <input type="checkbox" :checked="done" :aria-label="`Mark ${title} done`" />
    <span class="title">{{ title }}</span>
  </li>
</template>

<style scoped>
.item { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
.done .title { text-decoration: line-through; color: #94a3b8; }
</style>
