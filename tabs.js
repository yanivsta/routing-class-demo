(() => {
  const tabs = [...document.querySelectorAll('.activity-tabs [role="tab"]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));

  function showTab(index) {
    if (index === 0) document.getElementById('rp-pause').click();
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
    });
  }

  function navigate(index) {
    const hash = tabs[index].hash;
    if (location.hash !== hash) {
      try {
        history.pushState(null, '', hash);
      } catch {
        location.hash = hash;
      }
    }
    showTab(index);
  }

  function syncFromHash() {
    showTab(['#start-simulation', '#simulation-panel', '#rp-heading'].includes(location.hash) ? 1 : 0);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', event => {
      event.preventDefault();
      navigate(index);
    });
    tab.addEventListener('keydown', event => {
      const next = {
        ArrowRight: 1 - index,
        ArrowLeft: 1 - index,
        Home: 0,
        End: tabs.length - 1,
        ' ': index,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      navigate(next);
      tabs[next].focus();
    });
  });

  document.querySelector('.reading-guide > a[href="#start-simulation"]').addEventListener('click', event => {
    event.preventDefault();
    navigate(1);
    document.getElementById('start-simulation').focus();
  });

  window.addEventListener('hashchange', syncFromHash);
  syncFromHash();
})();
