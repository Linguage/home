// Restore the selected theme before the first paint; storage is optional.
try {
  const saved = localStorage.getItem('linguista-home-theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch { /* Keep the default when storage is unavailable. */ }
