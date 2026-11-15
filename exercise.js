(() => {
  const root = document.getElementById('wcmp-exercise');
  const find = id => document.getElementById('exercise-' + id);
  const uplinks = [...root.querySelectorAll('[data-uplink]')];
  const linkLabels = ['a', 'b', 'c', 'd'];
  const baseline = [3, 3, 3, 3];
  let allocation = [...baseline];
  let source = null;

  function updateAllocation() {
    const loads = [allocation[0] + allocation[1], allocation[2], allocation[3]];
    uplinks.forEach((button, index) => {
      const name = linkLabels[index].toUpperCase();
      const count = allocation[index];
      button.querySelector('strong').textContent = count;
      button.setAttribute('aria-pressed', String(index === source));
      const action = source === null ? 'Select as source' : index === source ? 'Cancel selection' : 'Move one flow here';
      button.setAttribute('aria-label', `Uplink ${name}, ${count} flows. ${action}`);
      find('link-' + linkLabels[index]).textContent = `${name} · ${count}`;
    });
    loads.forEach((count, index) => {
      find('downlink-' + index).textContent = `${count} ${count === 1 ? 'flow' : 'flows'}`;
    });
    find('rate').textContent = `${(10 / Math.max(...loads)).toFixed(2)} Gb/s`;
    find('diagram-desc').textContent =
      `Uplinks A and B share S2₀’s link to the destination. The three destination links carry ${loads.join(', ')} flows.`;
    const solved = loads.every(count => count === 4);
    find('success').hidden = !solved;
    find('start-simulation').hidden = !solved;
  }

  find('answer').addEventListener('submit', event => {
    event.preventDefault();
    const answer = new FormData(event.currentTarget).get('cause');
    const correct = answer === 'shared';
    const feedback = find('feedback');
    feedback.textContent = correct
      ? 'Correct. The three flows from uplink A and the three from B meet at S2₀ and share one 10 Gb/s link to the destination.'
      : 'Try again. Compare the flow counts on the four uplinks with the counts on the three links entering the destination.';
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

  uplinks.forEach((button, index) => {
    button.addEventListener('click', () => {
      const name = linkLabels[index].toUpperCase();
      const status = find('move-status');
      if (source === null) {
        if (allocation[index] === 0) {
          status.textContent = `Uplink ${name} has no flows to move. Choose another uplink.`;
          return;
        }
        source = index;
        status.textContent = `Uplink ${name} selected. Choose where to move one flow.`;
      } else if (source === index) {
        source = null;
        status.textContent = 'Selection canceled.';
      } else {
        allocation[source]--;
        allocation[index]++;
        status.textContent = `Moved one flow from ${linkLabels[source].toUpperCase()} to ${name}.`;
        source = null;
      }
      updateAllocation();
    });
  });

  find('reset').addEventListener('click', () => {
    allocation = [...baseline];
    source = null;
    updateAllocation();
    find('move-status').textContent = 'The original allocation of three flows per uplink is restored.';
  });
})();
