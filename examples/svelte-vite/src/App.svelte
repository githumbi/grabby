<script>
  import Stat from './lib/Stat.svelte';
</script>

<main class="page">
  <h1>Dashboard</h1>
  <p class="hint">Press <kbd>⌥G</kbd> / <kbd>Alt+G</kbd>, click anything, and leave a comment.</p>
  <div class="stats">
    <Stat label="Visitors" value="12,480" trend="+8%" />
    <Stat label="Sign-ups" value="342" trend="+2%" />
    <Stat label="Churn" value="1.9%" trend="-0.4%" />
  </div>
</main>

<style>
  .page { max-width: 760px; margin: 40px auto; font-family: system-ui, sans-serif; color: #0f172a; }
  .hint { color: #64748b; }
  kbd { background: #e2e8f0; border-radius: 4px; padding: 1px 6px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
</style>
