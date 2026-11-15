(() => {
  const sections = [...document.querySelectorAll('.activity-tabs button[aria-controls]')];
  const panels = sections.map(button => document.getElementById(button.getAttribute('aria-controls')));
  let active = -1;

  function showSection(index) {
    if (active === 1 && index !== 1) document.getElementById('rp-pause').click();
    active = index;
    sections.forEach((button, i) => {
      button.setAttribute('aria-expanded', String(i === active));
      panels[i].hidden = i !== active;
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
    if (location.hash === '#reading') showSection(0);
    else if (['#start-simulation', '#simulation-panel', '#rp-heading'].includes(location.hash)) showSection(1);
    else showSection(-1);
  }

  sections.forEach((button, index) => {
    button.addEventListener('click', () => {
      clearFragment();
      showSection(active === index ? -1 : index);
    });
  });

  document.querySelector('.reading-guide > a[href="#start-simulation"]').addEventListener('click', event => {
    event.preventDefault();
    clearFragment();
    showSection(1);
    document.getElementById('simulation-intro-title').focus();
  });

  document.getElementById('rp-reset-activity').addEventListener('click', () => {
    clearFragment();
    showSection(1);
    document.getElementById('start-simulation').focus();
  });

  window.addEventListener('hashchange', syncFromHash);
  syncFromHash();
})();
