(() => {
  const root = document.getElementById('wcmp-exercise');
  const find = id => document.getElementById('exercise-' + id);
  const uplinks = ['a', 'b', 'c', 'd'];
  const zones = new Map([...root.querySelectorAll('[data-drop-zone]')].map(zone => [zone.dataset.dropZone, zone]));
  const placements = Array(12).fill('bank');
  let selected = null;
  let drag = null;
  let suppressClick = false;

  function describeZone(place) {
    return place === 'bank' ? 'the flow bank' : `uplink ${place.toUpperCase()}`;
  }

  const tokens = placements.map((_, index) => {
    const token = document.createElement('button');
    token.type = 'button';
    token.className = 'exercise-token';
    token.dataset.flow = index;
    token.textContent = index + 1;
    zones.get('bank').querySelector('[data-tokens]').append(token);
    return token;
  });

  function updateDiagram(counts, allocating) {
    const loads = [counts[0] + counts[1], counts[2], counts[3]];
    const assigned = loads.reduce((total, count) => total + count, 0);
    uplinks.forEach((uplink, index) => {
      const count = counts[index];
      find('link-' + uplink).textContent = allocating ? `${uplink.toUpperCase()} · ${count}` : count;
      find('uplink-arrow-' + uplink).classList.toggle('empty-flow', count === 0);
    });
    loads.forEach((count, index) => {
      find('downlink-' + index).textContent = count;
      const arrow = index === 0 ? find('shared-link') : find('downlink-arrow-' + index);
      arrow.classList.toggle('empty-flow', count === 0);
    });
    find('source-count').textContent = assigned;
    find('source-arrow').classList.toggle('empty-flow', assigned === 0);
    find('assigned').textContent = `${assigned} / 12`;
    find('rate').textContent = assigned === 12 ? `${(10 / Math.max(...loads)).toFixed(2)} Gb/s` : 'Assign all 12 flows';
    find('diagram-desc').textContent = `${assigned} of 12 flows assigned. Uplink counts: ${counts.join(', ')}. Destination link counts: ${loads.join(', ')}.`;
    const solved = allocating && loads.every(count => count === 4);
    const success = find('success');
    const justSolved = solved && success.hidden;
    success.hidden = !solved;
    if (justSolved) success.scrollIntoView({ block: 'nearest' });
  }

  function updateAllocation() {
    const counts = { bank: 0, a: 0, b: 0, c: 0, d: 0 };
    placements.forEach((place, index) => {
      counts[place]++;
      const token = tokens[index];
      const container = zones.get(place).querySelector('[data-tokens]');
      if (token.parentElement !== container) container.append(token);
      token.setAttribute('aria-pressed', String(index === selected));
      token.setAttribute('aria-label', `Flow ${index + 1} in ${describeZone(place)}`);
    });
    zones.forEach((zone, place) => {
      zone.querySelector('[data-count]').textContent = counts[place];
    });
    updateDiagram(uplinks.map(place => counts[place]), true);
  }

  function placeFlow(index, destination) {
    const previous = placements[index];
    placements[index] = destination;
    selected = null;
    updateAllocation();
    find('move-status').textContent = previous === destination
      ? `Flow ${index + 1} stayed in ${describeZone(destination)}.`
      : `Moved flow ${index + 1} to ${describeZone(destination)}.`;
  }

  function dropTargetAt(event) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    return target?.closest('[data-drop-zone], [data-diagram-drop]') ?? null;
  }

  function positionGhost(event) {
    drag.ghost.style.left = `${event.clientX}px`;
    drag.ghost.style.top = `${event.clientY}px`;
    const target = dropTargetAt(event);
    if (target !== drag.target) {
      drag.target?.classList.remove('drop-target');
      target?.classList.add('drop-target');
      drag.target = target;
    }
  }

  function endDrag(event, canceled = false) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { index, ghost, target } = drag;
    drag = null;
    if (!ghost) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    ghost.remove();
    target?.classList.remove('drop-target');
    tokens[index].classList.remove('is-dragging');
    const destination = canceled ? null : dropTargetAt(event);
    if (destination) placeFlow(index, destination.dataset.dropZone ?? destination.dataset.diagramDrop);
  }

  tokens.forEach((token, index) => {
    token.addEventListener('click', () => {
      if (suppressClick) return;
      selected = selected === index ? null : index;
      find('move-status').textContent = selected === null
        ? 'Selection canceled.'
        : `Flow ${index + 1} selected. Choose an uplink or the flow bank.`;
      updateAllocation();
    });
    token.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      drag = { index, pointerId: event.pointerId, x: event.clientX, y: event.clientY, ghost: null, target: null };
      token.setPointerCapture(event.pointerId);
    });
    token.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.ghost) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
        drag.ghost = document.createElement('span');
        drag.ghost.className = 'exercise-token exercise-drag-ghost';
        drag.ghost.textContent = index + 1;
        drag.ghost.setAttribute('aria-hidden', 'true');
        document.body.append(drag.ghost);
        token.classList.add('is-dragging');
      }
      positionGhost(event);
    });
    token.addEventListener('pointerup', endDrag);
    token.addEventListener('pointercancel', event => endDrag(event, true));
    token.addEventListener('lostpointercapture', event => endDrag(event, true));
  });

  root.querySelectorAll('[data-place]').forEach(button => {
    button.addEventListener('click', () => {
      if (selected === null) {
        find('move-status').textContent = 'Select a numbered flow first.';
        return;
      }
      placeFlow(selected, button.dataset.place);
    });
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || selected === null) return;
    selected = null;
    updateAllocation();
    find('move-status').textContent = 'Selection canceled.';
  });

  find('answer').addEventListener('submit', event => {
    event.preventDefault();
    const correct = new FormData(event.currentTarget).get('cause') === 'shared';
    const feedback = find('feedback');
    feedback.textContent = correct
      ? 'Correct. The two sets of three flows meet at S2₀ and share one 10 Gb/s link to the destination.'
      : 'Try again. Compare the counts on the four uplink arrows with the counts entering the destination.';
    feedback.classList.toggle('success', correct);
    feedback.hidden = false;
    find('shared-link').classList.toggle('bottleneck', correct);
    find('continue').hidden = !correct;
  });

  find('continue').addEventListener('click', () => {
    find('diagnosis').hidden = true;
    find('allocation').hidden = false;
    find('shared-link').classList.remove('bottleneck');
    updateAllocation();
    find('allocation-title').focus();
  });

  find('reset').addEventListener('click', () => {
    placements.fill('bank');
    selected = null;
    updateAllocation();
    find('move-status').textContent = 'All 12 flows are back in the bank.';
  });
})();
