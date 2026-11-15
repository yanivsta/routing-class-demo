(() => {
  const root = document.getElementById('reading');
  const items = [...root.querySelectorAll('[data-read-item]')];
  const papers = [...root.querySelectorAll('[data-reading-paper]')].map(paper => ({
    all: paper.querySelector('[data-read-all]'),
    items: [...paper.querySelectorAll('[data-read-item]')],
  }));
  const key = 'routing-lab-reading-progress';

  function syncPapers() {
    papers.forEach(({ all, items }) => {
      const completed = items.filter(item => item.checked).length;
      all.checked = completed === items.length;
      all.indeterminate = completed > 0 && completed < items.length;
    });
  }

  function save() {
    syncPapers();
    try {
      localStorage.setItem(key, JSON.stringify(items.filter(item => item.checked).map(item => item.dataset.readItem)));
    } catch { /* Checkboxes still work for the current session. */ }
  }

  try {
    const saved = JSON.parse(localStorage.getItem(key));
    items.forEach(item => { item.checked = Array.isArray(saved) && saved.includes(item.dataset.readItem); });
  } catch { /* An unavailable or invalid saved state starts unchecked. */ }
  syncPapers();

  items.forEach(item => item.addEventListener('change', save));
  papers.forEach(({ all, items }) => all.addEventListener('change', () => {
    items.forEach(item => { item.checked = all.checked; });
    save();
  }));

  document.getElementById('rp-reset-activity').addEventListener('click', () => {
    items.forEach(item => { item.checked = false; });
    save();
  });
})();
