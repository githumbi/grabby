<script setup lang="ts">
import TodoItem from './components/TodoItem.vue';

const todos = [
  { id: 1, title: 'Write the launch post', done: true },
  { id: 2, title: 'Record a demo video', done: false },
  { id: 3, title: 'Reply to early feedback', done: false },
];
</script>

<template>
  <main class="page">
    <h1>Today</h1>
    <p class="hint">Press <kbd>⌥G</kbd> / <kbd>Alt+G</kbd>, click anything, and leave a comment.</p>
    <ul class="list">
      <TodoItem v-for="todo in todos" :key="todo.id" :title="todo.title" :done="todo.done" />
    </ul>
    <button class="add">Add task</button>
  </main>
</template>

<style scoped>
.page { max-width: 560px; margin: 40px auto; font-family: system-ui, sans-serif; color: #0f172a; }
h1 { font-size: 32px; margin: 0; }
.hint { color: #64748b; }
kbd { background: #e2e8f0; border-radius: 4px; padding: 1px 6px; }
.list { list-style: none; padding: 0; }
.add { background: #16a34a; color: #fff; border: 0; border-radius: 8px; padding: 10px 14px; font-weight: 600; }
</style>
