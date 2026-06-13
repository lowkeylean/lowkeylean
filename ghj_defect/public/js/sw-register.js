// One-time purge of the old v1 cache-first service worker, which pinned
// stale deploys. After purging once, register the v2 network-first worker.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      if (!localStorage.getItem('sw-v3-purged')) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        localStorage.setItem('sw-v3-purged', '1');
        if (regs.length > 0) {
          location.reload();
          return;
        }
      }
      navigator.serviceWorker.register('/sw.js');
    } catch {
      // Service worker is an enhancement; never block the app on it.
    }
  });
}
