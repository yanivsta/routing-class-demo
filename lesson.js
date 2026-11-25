(() => {
  const stages = [...document.querySelectorAll('.stage')];
  const nav = document.getElementById('lesson-nav');
  const picker = document.getElementById('stage-picker');
  const previous = document.getElementById('previous-stage');
  const next = document.getElementById('next-stage');
  let activeIndex = 0;
  let activeDemo = null;
  let animationFrame = 0;
  const demonstrations = new Map();
  const colors = ['#63e6a5', '#ffa261', '#91afff', '#fa95df', '#f8dc6d', '#64dcee'];
  const policyNames = { ecmp: 'ECMP', wcmp: 'WCMP', fb: 'FlowBender' };
  const policyColors = { ecmp: '#546b7b', wcmp: '#147c69', fb: '#8b4d9e' };

  stages.forEach((stage, index) => {
    const link = document.createElement('a');
    link.href = '#' + stage.id;
    const number = document.createElement('span');
    number.className = 'step-number';
    number.textContent = index + 1;
    const label = document.createElement('span');
    label.textContent = stage.dataset.title;
    link.append(number, label);
    nav.append(link);
    picker.add(new Option((index + 1) + ' · ' + stage.dataset.title, stage.id));
  });

  function stopDemo() {
    cancelAnimationFrame(animationFrame);
    if (!activeDemo) return;
    activeDemo.state.running = false;
    updateDemoControls();
  }

  function showStage(index, moveFocus = false) {
    stopDemo();
    if (activeDemo) activeDemo.host.replaceChildren();
    activeDemo = null;
    activeIndex = Math.max(0, Math.min(stages.length - 1, index));
    stages.forEach((stage, position) => { stage.hidden = position !== activeIndex; });
    [...nav.children].forEach((link, position) => {
      if (position === activeIndex) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    const stage = stages[activeIndex];
    picker.value = stage.id;
    document.getElementById('stage-count').textContent = (activeIndex + 1) + ' מתוך ' + stages.length;
    document.getElementById('stage-time').textContent = stage.dataset.minutes + ' דקות מוצעות';
    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === stages.length - 1;
    document.getElementById('copy-status').textContent = '';
    const slot = stage.querySelector('[data-demo]');
    if (slot) mountDemo(slot);
    if (moveFocus) {
      document.getElementById('stage-content').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    document.title = stage.dataset.title + ' | ניתוב ואיזון עומסים';
  }

  function fromHash(moveFocus = false) {
    const index = stages.findIndex(stage => '#' + stage.id === location.hash);
    showStage(index < 0 ? 0 : index, moveFocus);
  }

  function goTo(index) {
    if (index < 0 || index >= stages.length) return;
    location.hash = stages[index].id;
  }

  picker.addEventListener('change', () => { location.hash = picker.value; });
  document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    document.getElementById('stage-content').focus();
  });
  previous.addEventListener('click', () => goTo(activeIndex - 1));
  next.addEventListener('click', () => goTo(activeIndex + 1));
  window.addEventListener('hashchange', () => fromHash(true));
  document.addEventListener('keydown', event => {
    if (event.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    if (event.key === 'PageDown' || event.key === 'ArrowLeft') { event.preventDefault(); goTo(activeIndex + 1); }
    if (event.key === 'PageUp' || event.key === 'ArrowRight') { event.preventDefault(); goTo(activeIndex - 1); }
  });
  document.getElementById('projection').addEventListener('click', event => {
    const enabled = document.body.classList.toggle('projecting');
    event.currentTarget.setAttribute('aria-pressed', enabled);
  });
  document.getElementById('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      document.getElementById('copy-status').textContent = 'אפשר להפעיל מסך מלא מתפריט הדפדפן.';
    }
  });
  document.addEventListener('fullscreenchange', () => {
    document.getElementById('fullscreen').textContent = document.fullscreenElement ? 'יציאה ממסך מלא' : 'מסך מלא';
  });
  document.getElementById('copy-link').addEventListener('click', async () => {
    const url = new URL(location.protocol === 'file:' ? 'https://yanivsta.github.io/routing-class-demo/lesson.html' : location.href);
    url.hash = stages[activeIndex].id;
    try {
      await navigator.clipboard.writeText(url.href);
      document.getElementById('copy-status').textContent = 'הקישור הועתק';
    } catch {
      document.getElementById('copy-status').textContent = 'אפשר להעתיק את הקישור משורת הכתובת.';
    }
  });

  const dialog = document.getElementById('figure-dialog');
  document.querySelectorAll('.figure-zoom').forEach(button => {
    button.addEventListener('click', () => {
      const image = button.querySelector('img');
      const enlarged = document.getElementById('enlarged-figure');
      enlarged.src = image.src;
      enlarged.alt = image.alt;
      document.getElementById('enlarged-caption').textContent = button.closest('figure').querySelector('figcaption').textContent;
      dialog.classList.remove('actual-size');
      document.getElementById('figure-actual-size').setAttribute('aria-pressed', 'false');
      dialog.showModal();
    });
  });
  document.getElementById('close-figure').addEventListener('click', () => dialog.close());
  document.getElementById('figure-actual-size').addEventListener('click', event => {
    const enabled = dialog.classList.toggle('actual-size');
    event.currentTarget.setAttribute('aria-pressed', enabled);
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  function renderWeights() {
    const sets = { full: [2, 2, 3, 5], reduced: [1, 1, 2, 3], small: [1, 1, 1, 2] };
    const weights = sets[document.getElementById('weight-mode').value];
    const entries = weights.flatMap((weight, port) => Array(weight).fill(port + 1));
    const hash = Number(document.getElementById('hash-value').value);
    const offset = hash % entries.length;
    document.getElementById('hash-output').textContent = hash;
    const buckets = document.getElementById('hash-buckets');
    buckets.replaceChildren();
    entries.forEach((port, index) => {
      const entry = document.createElement('div');
      entry.className = 'hash-bucket' + (index === offset ? ' selected' : '');
      entry.style.setProperty('--bucket-color', colors[port - 1]);
      const label = document.createElement('strong');
      label.textContent = 'P' + port;
      const address = document.createElement('small');
      address.textContent = '[' + index + ']';
      entry.append(label, address);
      buckets.append(entry);
    });
    document.getElementById('hash-choice').textContent = hash + ' mod ' + entries.length + ' = ' + offset + '  →  Port ' + entries[offset];
    const full = sets.full;
    const oversubscription = Math.max(...weights.map((weight, index) => (weight / entries.length) / (full[index] / 12)));
    document.getElementById('weight-metrics').innerHTML =
      '<div class="metric"><strong>' + entries.length + '</strong><span>כניסות בטבלה</span></div>' +
      '<div class="metric"><strong>' + Math.round((1 - entries.length / 12) * 100) + '%</strong><span>חיסכון מול הייצוג המלא</span></div>' +
      '<div class="metric"><strong>' + oversubscription.toFixed(3) + '</strong><span>עומס יחסי מרבי</span></div>';
    document.getElementById('weight-shares').innerHTML = weights.map((weight, index) =>
      '<div class="share-row"><strong>P' + (index + 1) + '</strong><div class="share-track"><i style="width:' + 100 * weight / entries.length + '%"></i></div><span>' + (100 * weight / entries.length).toFixed(1) + '%</span></div>'
    ).join('');
  }
  document.getElementById('weight-mode').addEventListener('change', renderWeights);
  document.getElementById('hash-value').addEventListener('input', renderWeights);
  renderWeights();

  let receivedRounds = 0;
  function renderRounds() {
    const threshold = Number(document.getElementById('threshold').value);
    const required = Number(document.getElementById('consecutive').value);
    const sequence = document.getElementById('feedback-sequence').value === 'burst' ? [8, 0, 0, 0] : [8, 8, 8, 8];
    let consecutive = 0;
    let attempts = 0;
    const cells = sequence.map((fraction, index) => {
      if (index >= receivedRounds) return '<div class="rtt-round"><small>RTT ' + (index + 1) + '</small><strong>?</strong><span>Waiting</span></div>';
      consecutive = fraction > threshold ? consecutive + 1 : 0;
      const trigger = consecutive >= required;
      if (trigger) { consecutive = 0; attempts++; }
      return '<div class="rtt-round reached' + (trigger ? ' triggered' : '') + '"><small>RTT ' + (index + 1) + '</small><strong>F = ' + fraction + '%</strong><span>' + (trigger ? 'Change V' : 'Keep V') + '</span><small>Counter ' + consecutive + '</small></div>';
    });
    document.getElementById('rtt-rounds').innerHTML = cells.join('');
    document.getElementById('next-rtt').disabled = receivedRounds === sequence.length;
    document.getElementById('rtt-status').textContent = receivedRounds === 0 ? 'קבלו את הסבב הראשון והחליטו אם יש מספיק מידע לפעולה.'
      : 'התקבלו ' + receivedRounds + ' סבבים. ניסיונות שינוי שיבוץ: ' + attempts + '.';
  }
  document.getElementById('next-rtt').addEventListener('click', () => { receivedRounds++; renderRounds(); });
  document.getElementById('reset-rtt').addEventListener('click', () => { receivedRounds = 0; renderRounds(); });
  for (const id of ['threshold', 'consecutive', 'feedback-sequence']) {
    document.getElementById(id).addEventListener('change', () => { receivedRounds = 0; renderRounds(); });
  }
  renderRounds();

  const note = document.getElementById('exit-note');
  try { note.value = localStorage.getItem('routing-lesson-exit-note') || ''; } catch { /* The note remains usable. */ }
  note.addEventListener('input', () => {
    try { localStorage.setItem('routing-lesson-exit-note', note.value); }
    catch { document.getElementById('note-status').textContent = 'התשובה זמינה כל עוד הדף פתוח.'; }
  });

  function newRun(state) {
    state.model = new window.RoutingPacketRun(state.caseId, state.policy, state.condition === 'healthy');
    state.model.healthy = state.condition === 'healthy';
    state.running = false;
  }

  function mountDemo(host) {
    const caseId = host.dataset.demo;
    if (!demonstrations.has(caseId)) {
      const state = { caseId, policy: 'ecmp', condition: 'changed', speed: 2, path: 0, results: { healthy: {}, changed: {} }, running: false, model: null };
      newRun(state);
      demonstrations.set(caseId, state);
    }
    const state = demonstrations.get(caseId);
    host.innerHTML = '<section class="demo-panel" aria-label="הדגמת רשת"><div class="demo-top"><h2>המקרה מההכנה · ' + caseId.toUpperCase() + '</h2>' +
      '<label>מצב הרשת<select data-control="condition"><option value="healthy">רשת תקינה</option><option value="changed">התנאים השתנו</option></select></label>' +
      '<label>מדיניות<select data-control="policy" dir="ltr"><option value="ecmp">ECMP</option><option value="wcmp">WCMP</option><option value="fb">FlowBender</option></select></label></div>' +
      '<div class="demo-run-controls"><button type="button" data-action="run" class="primary">הרצה</button><button type="button" data-action="pause">השהיה</button><button type="button" data-action="finish">סיום מיידי</button><button type="button" data-action="reset">איפוס הרצה</button>' +
      '<label>מהירות <output data-speed-label></output><input type="range" data-control="speed" min=".25" max="2" step=".25" aria-label="מהירות ההדגמה"></label></div>' +
      '<svg class="demo-network" dir="ltr" viewBox="0 0 780 390" role="img" aria-label="שולחים, מסלולים, תורים וחבילות ACK זהובות שחוזרות למקור"></svg>' +
      '<p class="demo-status" role="status"></p><div class="demo-result" hidden><h3>התוצאות בתנאי הרשת שנבחרו</h3><div class="demo-score-table"></div>' +
      '<label>תור במסלול <select data-control="path" dir="ltr"><option value="0">A</option><option value="1">B</option></select></label><svg class="demo-chart" dir="ltr" viewBox="0 0 640 185" role="img" aria-label="מספר החבילות בתור בכל מחזור"></svg><div class="demo-legend"></div></div>' +
      '<p class="model-note">מודל לימודי מתוך ההכנה. כל קישור פעיל מעביר חבילה אחת במחזור. סימון ECN מוחזר באישורי ACK. המשקלים בניסיון WCMP זמינים מתחילת ההרצה; בקרת קצב, אובדן ושינוי סדר ההגעה מפושטים במודל.</p></section>';
    activeDemo = { host, state };
    for (const control of ['policy', 'condition', 'speed', 'path']) host.querySelector('[data-control="' + control + '"]').value = state[control];
    host.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'run' && !state.model.done) {
        state.running = true;
        state.lastTime = 0;
        updateDemoControls();
        animationFrame = requestAnimationFrame(animateDemo);
      } else if (action === 'pause') {
        stopDemo();
      } else if (action === 'reset') {
        stopDemo(); newRun(state); drawDemo(); renderDemoResults();
      } else if (action === 'finish' && !state.model.done) {
        stopDemo();
        while (!state.model.done) state.model.tick();
        finishDemo();
        drawDemo();
      }
    }));
    for (const control of ['policy', 'condition']) host.querySelector('[data-control="' + control + '"]').addEventListener('change', event => {
      stopDemo(); state[control] = event.target.value; newRun(state); drawDemo(); renderDemoResults();
    });
    host.querySelector('[data-control="speed"]').addEventListener('input', event => {
      state.speed = Number(event.target.value); state.lastTime = 0; updateDemoControls();
    });
    host.querySelector('[data-control="path"]').addEventListener('change', event => {
      state.path = Number(event.target.value); renderDemoResults();
    });
    drawDemo();
    renderDemoResults();
  }

  function updateDemoControls() {
    if (!activeDemo) return;
    const { host, state } = activeDemo;
    host.querySelector('[data-action="run"]').disabled = state.running || state.model.done;
    host.querySelector('[data-action="run"]').textContent = state.running ? 'בהרצה' : state.model.t && !state.model.done ? 'המשך' : 'הרצה';
    host.querySelector('[data-action="pause"]').disabled = !state.running;
    host.querySelector('[data-action="finish"]').disabled = state.model.done;
    host.querySelector('[data-speed-label]').textContent = state.speed + '×';
  }

  function finishDemo() {
    const { state } = activeDemo;
    stopDemo();
    state.results[state.condition][state.policy] = { cycles: state.model.t, history: state.model.queueHistory.map(history => [...history]) };
    renderDemoResults();
  }

  function animateDemo(now) {
    if (!activeDemo || !activeDemo.state.running) return;
    const { state } = activeDemo;
    if (!state.lastTime) state.lastTime = now;
    const duration = 480 / state.speed;
    if (now - state.lastTime >= duration) {
      state.lastTime = now;
      state.model.tick();
      if (state.model.done) finishDemo();
      drawDemo();
    } else if (!state.lastPaint || now - state.lastPaint >= 40) {
      state.lastPaint = now;
      drawDemo((now - state.lastTime) / duration);
    }
    if (state.running) animationFrame = requestAnimationFrame(animateDemo);
  }

  function position(points, fraction) {
    const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
    let remaining = lengths.reduce((sum, length) => sum + length, 0) * fraction;
    for (let index = 0; index < lengths.length; index++) {
      if (remaining <= lengths[index] || index === lengths.length - 1) {
        const part = lengths[index] ? remaining / lengths[index] : 0;
        return [points[index][0] + (points[index + 1][0] - points[index][0]) * part, points[index][1] + (points[index + 1][1] - points[index][1]) * part];
      }
      remaining -= lengths[index];
    }
  }

  function drawDemo(alpha = 0) {
    if (!activeDemo) return;
    const { state, host } = activeDemo;
    const model = state.model;
    const levels = [76, 230];
    const text = (x, y, value, attributes = '') => '<text x="' + x + '" y="' + y + '" ' + attributes + '>' + value + '</text>';
    let drawing = '<title>Data packets move right. Gold ACK packets return ECN feedback to the senders.</title>';
    drawing += text(65, 49, 'Senders') + text(725, 190, 'Receiver');
    model.flows.forEach(flow => {
      const y = 90 + flow.id * 25;
      drawing += '<path d="M55 ' + y + ' L175 155" fill="none" stroke="#66848e"/><circle cx="55" cy="' + y + '" r="12" fill="' + colors[flow.id] + '"/>' + text(55, y + 4, flow.id + 1, 'class="packet-label"');
    });
    for (let path = 0; path < 2; path++) {
      const y = levels[path];
      drawing += '<path d="M175 155 V' + y + ' H365 M625 ' + y + ' V155 H725" stroke="#66848e" fill="none"/>';
      drawing += '<rect x="357" y="' + (y - 8) + '" width="16" height="16" fill="#355461" stroke="#9eb7bf"/>';
      for (let lane = 0; lane < 3; lane++) drawing += '<path d="M380 ' + (y + (lane - 1) * 8) + ' H615" stroke="' + (lane < model.caps[path] ? '#d4e7ee' : '#7b929e') + '" stroke-width="2" ' + (lane >= model.caps[path] ? 'stroke-dasharray="4 5"' : '') + '/>';
      drawing += text(490, y - 34, 'Path ' + (path ? 'B' : 'A') + ' · Capacity ' + model.caps[path]);
      drawing += text(490, y - 14, model.flows.filter(flow => flow.path === path).length + ' flows');
      model.queues[path].slice(0, 18).forEach((packet, index) => {
        drawing += '<rect x="' + (331 + index % 9 * 11) + '" y="' + (y + 17 + Math.floor(index / 9) * 11) + '" width="8" height="8" fill="' + colors[packet.flow] + '"/>';
      });
      drawing += text(380, y + 57, model.done ? 'Peak queue ' + model.peak[path] : 'Queued ' + model.queues[path].length);
    }
    drawing += '<circle cx="725" cy="155" r="12" fill="#355461" stroke="#9eb7bf"/>';
    for (const packet of model.flights) {
      const progress = Math.min(1, Math.max(0, (model.t + alpha - packet.start) / (packet.end - packet.start)));
      const y = levels[packet.path];
      const laneY = y + ((packet.lane || 0) - 1) * 8;
      const points = packet.phase === 'in' ? [[55, 90 + packet.flow * 25], [175, 155], [175, y], [365, y]] : [[365, y], [380, laneY], [615, laneY], [625, y], [625, 155], [725, 155]];
      const [x, py] = position(points, progress);
      drawing += '<g transform="translate(' + x.toFixed(1) + ',' + py.toFixed(1) + ')"><circle r="9" fill="' + colors[packet.flow] + '" stroke="' + (packet.marked ? '#fff' : '#17333d') + '" stroke-width="' + (packet.marked ? 3 : 1) + '"/>' + text(0, 4, packet.flow + 1, 'class="packet-label"') + '</g>';
    }
    drawing += '<path d="M725 172 V330 H55 L65 324 M55 330 L65 336" fill="none" stroke="#ffd17a" stroke-dasharray="4 5"/>';
    model.acks.slice(-12).forEach(ack => {
      const x = 700 - 620 * Math.min(1, (model.t + alpha - ack.start) / 4);
      const y = 330 + (ack.flow % 3 - 1) * 20;
      drawing += '<g transform="translate(' + x.toFixed(1) + ',' + y + ')"><rect x="-23" y="-9" width="46" height="18" rx="4" fill="#ffd17a"/>' + text(-5, 4, 'ACK', 'class="ack-label"') + '<circle cx="15" r="6" fill="' + colors[ack.flow] + '"/>' + text(15, 3, ack.flow + 1, 'class="ack-label"') + '</g>';
    });
    drawing += text(390, 378, 'ECN feedback · receiver to senders', 'style="fill:#ffd17a"');
    host.querySelector('.demo-network').innerHTML = drawing;
    const delivered = model.flows.reduce((sum, flow) => sum + flow.received, 0);
    host.querySelector('.demo-status').textContent = 'מחזור ' + model.t + ' · התקבלו ' + delivered + ' מתוך ' + model.flows.length * 48 + ' חבילות' + (model.moves ? ' · שינויי מסלול ' + model.moves : '');
    updateDemoControls();
  }

  function renderDemoResults() {
    const { host, state } = activeDemo;
    const entries = Object.entries(state.results[state.condition]);
    const panel = host.querySelector('.demo-result');
    panel.hidden = entries.length === 0;
    if (!entries.length) return;
    host.querySelector('.demo-score-table').innerHTML = '<table dir="ltr"><thead><tr><th>Policy</th><th>Cycles until all packets arrive</th></tr></thead><tbody>' +
      entries.map(([policy, run]) => '<tr><td>' + policyNames[policy] + '</td><td>' + run.cycles + '</td></tr>').join('') + '</tbody></table>';
    const maxCycle = Math.max(...entries.map(([, run]) => run.cycles));
    const maxQueue = Math.max(1, ...entries.flatMap(([, run]) => run.history[state.path]));
    let drawing = '<path d="M45 20 V150 H610" stroke="#b0c1ce" fill="none"/>';
    drawing += '<text x="45" y="15">Queued</text><text x="302" y="178">Cycles</text><text x="12" y="151">0</text><text x="12" y="30">' + maxQueue + '</text><text x="595" y="168">' + maxCycle + '</text>';
    entries.forEach(([policy, run]) => {
      const points = run.history[state.path].map((queue, cycle) => (45 + cycle / maxCycle * 565).toFixed(1) + ',' + (150 - queue / maxQueue * 120).toFixed(1)).join(' ');
      drawing += '<polyline points="' + points + '" fill="none" stroke="' + policyColors[policy] + '" stroke-width="2.5" ' + (policy === 'ecmp' ? 'stroke-dasharray="6 4"' : '') + '/>';
    });
    host.querySelector('.demo-chart').innerHTML = drawing;
    host.querySelector('.demo-legend').innerHTML = entries.map(([policy]) => '<span><i style="--series:' + policyColors[policy] + ';' + (policy === 'ecmp' ? 'border-top-style:dashed' : '') + '"></i>' + policyNames[policy] + '</span>').join('');
  }

  fromHash();
})();
