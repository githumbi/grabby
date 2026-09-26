/*
 * A ~1 KB loader for live sites. Ordinary visitors download nothing else;
 * the full Grabby build is fetched only for someone who opened a feedback
 * link (?grabby=<projectKey>) or when the page calls window.grabby.show().
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@githumbi/grabby@0.1/dist/loader.global.js"
 *     data-mode="live" data-server="https://feedback.example.com" data-project-key="pk_…" defer></script>
 */
(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;
  const FLAG = 'grabby:v1:live';
  const key = script.dataset.projectKey;
  let loading = false;

  function active(): boolean {
    try {
      if (sessionStorage.getItem(FLAG) === '1') return true;
    } catch { /* storage blocked */ }
    const value = new URL(location.href).searchParams.get('grabby');
    return !!value && (!key || value === key);
  }

  function load(): void {
    if (loading) return;
    loading = true;
    const full = document.createElement('script');
    full.src = script!.src.replace(/loader\.global\.js(\?.*)?$/, 'grabby.global.js');
    for (const [name, value] of Object.entries(script!.dataset)) {
      if (value !== undefined) full.dataset[name] = value;
    }
    if (script!.nonce) full.nonce = script!.nonce;
    if (script!.crossOrigin) full.crossOrigin = script!.crossOrigin;
    // Subresource Integrity for the second file: the loader's own integrity
    // attribute only covers the loader.
    const sri = script!.dataset.integrity;
    if (sri) {
      full.integrity = sri;
      full.crossOrigin = 'anonymous';
    }
    document.head.appendChild(full);
  }

  // Undelivered feedback from an earlier visit also needs the full build.
  let pending = false;
  try { pending = !!localStorage.getItem('grabby:v1:outbox'); } catch { /* ignore */ }

  if (script.dataset.mode !== 'live' || active() || pending) {
    load();
    return;
  }
  (window as unknown as { grabby: { show(): void } }).grabby = {
    show() {
      try { sessionStorage.setItem(FLAG, '1'); } catch { /* ignore */ }
      load();
    },
  };
})();
