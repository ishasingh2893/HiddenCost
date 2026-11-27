(() => {
  const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

  async function syncApartments(apartments) {
    const response = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apartments })
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Could not save apartments');
  }

  window.HiddenCostPythonSync = syncApartments;

  document.getElementById('analyzeBtn')?.addEventListener('click', async event => {
    event.stopImmediatePropagation();
    const input = document.getElementById('listingText');
    const output = document.getElementById('analyzerResult');
    output.hidden = false;
    output.textContent = 'Analyzing with HiddenCost Python…';
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input.value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');
      if (!data.items.length) {
        output.innerHTML = '<div class="warn">No clearly labeled amounts found. Try the example or enter values manually.</div>';
        return;
      }
      const bullets = data.items.map(item => `<li>${item.label}: <strong>${item.field === 'months' ? item.value + ' months' : money(item.value)}</strong></li>`).join('');
      const warnings = data.warnings.length ? `<div class="warn">${data.warnings.map(value => '⚠ ' + value).join('<br>')}</div>` : '';
      output.innerHTML = `<strong class="ok">Found ${data.items.length} item(s). Review before applying:</strong><ul>${bullets}</ul>${warnings}<button class="primary" type="button" id="applyPythonListing" style="margin-top:12px">Apply to form</button>`;
      document.getElementById('applyPythonListing').onclick = () => {
        for (const [key, value] of Object.entries(data.values)) {
          const field = document.getElementById(key);
          if (field) field.value = String(value);
        }
      };
    } catch (error) {
      output.innerHTML = `<div class="warn">${error.message}</div>`;
    }
  }, true);

  document.getElementById('calculateCommute')?.addEventListener('click', async event => {
    event.stopImmediatePropagation();
    const status = document.getElementById('commuteStatus');
    const destination = document.getElementById('destination').value.trim();
    status.textContent = 'Calculating commutes with Python…';
    try {
      const apartments = typeof window.HiddenCostGetEntries === 'function' ? window.HiddenCostGetEntries() : [];
      const response = await fetch('/api/commute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, apartments })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Commute calculation failed');
      status.textContent = `Calculated ${data.routes.filter(route => route.driving || route.walking).length} of ${data.routes.length} apartment routes.`;
      const insight = document.getElementById('commuteInsight');
      if (insight) {
        const measured = data.routes.filter(route => route.driving);
        measured.sort((a, b) => a.driving.miles - b.driving.miles);
        insight.innerHTML = measured.length
          ? `<strong>Commute insights:</strong> ${measured[0].name} has the shortest measured driving distance (${measured[0].driving.miles.toFixed(1)} mi).`
          : '<strong>Commute insights:</strong> No apartment has a calculated drive route yet.';
      }
    } catch (error) {
      status.textContent = error.message;
    }
  }, true);
})();
