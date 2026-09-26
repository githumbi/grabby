<script>
  let { label, value, trend } = $props();
</script>

<div class="stat">
  <span class="label">{label}</span>
  <strong class="value">{value}</strong>
  <span class="trend">{trend}</span>
</div>

<style>
  .stat { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
  .label { color: #64748b; font-size: 13px; }
  .value { font-size: 26px; }
  .trend { color: #16a34a; font-size: 12px; }
</style>
