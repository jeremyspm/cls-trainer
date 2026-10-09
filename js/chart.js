/* chart.js — stage 3: documenting.
   · Chart it: see chart-vs.js.
   · Sign the med chart: retired 10 Oct 2026; Mr Luke is a patient in Chart Sim (pharm-final/chart.html#luke).
   · Real cuff: a log of real readings for when his own cuff and stethoscope arrive (first try? what went wrong?). */
(function () {
  'use strict';


  /* ================= Real cuff log ================= */
  const PROBLEMS = ['Couldn’t hear the taps', 'Lost the radial pulse in step 1', 'Let it down too fast', 'Pumped before the stethoscope was on', 'Re-pumped without waiting', 'Cuff loose or wrong size', 'Arm not supported / not at heart level', 'Something else'];
  function mountCuff(root, api) {
    const { esc, addLog, log, store, blip } = api;
    function streaks() {
      const L = log().filter(e => e.type === 'cuff');
      let cur = 0; for (let i = L.length - 1; i >= 0 && L[i].first; i--) cur++;
      let best = 0, run = 0; for (const e of L) { run = e.first ? run + 1 : 0; best = Math.max(best, run); }
      const probs = {}; L.filter(e => !e.first).forEach(e => (e.problems || []).forEach(p => probs[p] = (probs[p] || 0) + 1));
      return { L, cur, best, top: Object.entries(probs).sort((a, b) => b[1] - a[1])[0] };
    }
    function render() {
      if (!store.get('cuffArrived', false)) {
        root.innerHTML = `<div class="card"><b>Waiting for your cuff and stethoscope.</b><p class="small">This is where you log REAL readings once they arrive: did you get it first try, and if not, what went wrong. The target is <b>10 first-try readings in a row</b> before your resit. Until then, the BP Lab is your practice.</p></div>
          <div class="btns"><button class="btn primary block" id="arr">My cuff has arrived</button><button class="btn block" data-go="#bp">Practise in the BP Lab</button></div>`;
        root.querySelector('#arr').onclick = () => { store.set('cuffArrived', true); render(); };
        root.querySelector('[data-go]').onclick = () => { location.hash = '#bp'; };
        return;
      }
      const s = streaks();
      root.innerHTML = `
        <div class="stats"><div class="stat"><b class="num">${s.cur}</b><span>first-try streak</span></div><div class="stat"><b class="num">${s.best}</b><span>best streak</span></div><div class="stat"><b class="num">${s.L.length}</b><span>real readings</span></div></div>
        <div class="progress"><i style="width:${Math.min(100, s.cur * 10)}%"></i></div><p class="small muted">Target: 10 first-try readings in a row. ${s.cur >= 10 ? 'Done. Keep it warm.' : (10 - s.cur) + ' to go.'}</p>
        ${s.top ? `<div class="card warn small"><b>Your most common slip:</b> ${esc(s.top[0])} (${s.top[1]}×)</div>` : ''}
        <div class="eyebrow">Log a reading</div>
        <div class="card">
          <div class="field"><label>Who on (optional)</label><input type="text" id="who" placeholder="e.g. Mum"></div>
          <div class="field"><label>Did you get it on the FIRST try? (both steps, no re-pump)</label>
            <div class="seg" id="firstSeg"><button data-v="1">Yes, first try</button><button data-v="0">No</button></div></div>
          <div class="grid2"><div class="field"><label>Your reading</label><input type="text" id="mine" inputmode="numeric" placeholder="120/80"></div><div class="field"><label>Automatic cuff (optional)</label><input type="text" id="auto" inputmode="numeric" placeholder="122/78"></div></div>
          <div id="probs" hidden><label class="small muted">What went wrong? (tap all that apply)</label><div class="chips" style="gap:8px">${PROBLEMS.map(p => `<button class="chip pickc" data-p="${esc(p)}" style="font-size:14px;padding:8px 12px">${esc(p)}</button>`).join('')}</div></div>
          <div class="btns"><button class="btn primary block" id="save" disabled>Save reading</button></div>
        </div>
        ${s.L.length ? '<div class="eyebrow">Recent</div>' + s.L.slice(-10).reverse().map(e => `<div class="row"><span class="ic">${e.first ? '🎯' : '🔁'}</span><span class="tx"><b>${e.mine ? esc(e.mine) : 'no reading noted'}${e.auto ? ' · auto ' + esc(e.auto) : ''}</b><span>${new Date(e.t).toLocaleString('en-NZ', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}${e.who ? ' · ' + esc(e.who) : ''}${(e.problems || []).length ? ' · ' + esc(e.problems.join(', ')) : ''}</span></span></div>`).join('') : ''}`;
      let first = null;
      root.querySelectorAll('#firstSeg button').forEach(b => b.onclick = () => {
        first = b.dataset.v === '1';
        root.querySelectorAll('#firstSeg button').forEach(x => x.classList.toggle('on', x === b));
        root.querySelector('#probs').hidden = first; root.querySelector('#save').disabled = false;
      });
      root.querySelectorAll('#probs .pickc').forEach(b => b.onclick = () => b.classList.toggle('ok'));
      root.querySelector('#save').onclick = () => {
        const bp = v => { const m = v.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/); return m ? m[1] + '/' + m[2] : ''; };
        const mine = bp(root.querySelector('#mine').value.trim()), auto = bp(root.querySelector('#auto').value.trim());
        const problems = first ? [] : [...root.querySelectorAll('#probs .pickc.ok')].map(b => b.dataset.p);
        addLog({ type: 'cuff', t: new Date().toISOString(), first, mine, auto, who: root.querySelector('#who').value.trim(), problems });
        blip(first); render();
        if (mine && auto) { const [a, b] = mine.split('/').map(Number), [c, d] = auto.split('/').map(Number); api.toast(`Difference: systolic ${a - c >= 0 ? '+' : ''}${a - c}, diastolic ${b - d >= 0 ? '+' : ''}${b - d}. Within 10 is good for a manual vs automatic.`, 5200); }
      };
    }
    render();
  }

  // Plot it / Read it live in chart-vs.js (loaded first); this file adds the med chart and the cuff log
  window.CLS_CHART = Object.assign({}, window.CLS_CHARTVS, { mountCuff });
})();
