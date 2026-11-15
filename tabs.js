(() => {
  const sections = [...document.querySelectorAll('.activity-tabs button[aria-controls]')];
  let active = '';

  function showSection(id) {
    if (active === 'simulation-panel' && id !== active) document.getElementById('rp-pause').click();
    active = id;
    sections.forEach(button => {
      const panelId = button.getAttribute('aria-controls');
      button.setAttribute('aria-expanded', String(panelId === active));
      document.getElementById(panelId).hidden = panelId !== active;
    });
  }

  function clearFragment() {
    if (!location.hash) return;
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      location.hash = '';
    }
  }

  function syncFromHash() {
    if (location.hash === '#reading') showSection('reading');
    else if (location.hash === '#wcmp-exercise') showSection('wcmp-exercise');
    else if (['#start-simulation', '#simulation-panel', '#rp-heading'].includes(location.hash)) showSection('simulation-panel');
    else showSection('');
  }

  sections.forEach(button => {
    button.addEventListener('click', () => {
      clearFragment();
      const id = button.getAttribute('aria-controls');
      showSection(active === id ? '' : id);
    });
  });

  document.querySelectorAll('a[data-open-section]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      clearFragment();
      const id = link.dataset.openSection;
      showSection(id);
      document.getElementById(id === 'wcmp-exercise' ? 'exercise-title' : 'simulation-intro-title').focus();
    });
  });

  document.getElementById('rp-reset-activity').addEventListener('click', () => {
    clearFragment();
    showSection('simulation-panel');
    document.getElementById('start-simulation').focus();
  });

  window.addEventListener('hashchange', syncFromHash);
  syncFromHash();
})();
