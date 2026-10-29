// ============================================================================
// prep-sessions.js — work sessions (start, end, who) for the prep log pages.
// Added Oct 29 2026. Precursor for labor costing / internal billing.
//
// Each prep record (<collection>/<location>/records/<YYYY-MM-DD>) gets:
//   <field>                 [{id, task, start:'HH:MM', end:'HH:MM', staff:[names], notes}]
//   <prefix>labor_minutes   sum over sessions of (minutes x number of people)
//   <prefix>labor_hours     labor_minutes / 60, 2 decimals
//   <prefix>clock_minutes   sum of session lengths (ignores headcount)
//   <prefix>session_count
//   <prefix>labor_by_task   {taskKey: labor minutes}
//   <prefix>staff_minutes   {name: minutes worked}
// Sessions can also hold quantities (what was actually cut / made in that session).
// Quantity fields are set per page, optionally per task. When any session has
// quantities, the page's day-level fields are filled with the sum of all sessions
// and locked (opts.onTotals does that); otherwise the day fields stay manual, so
// older days and days without sessions work as before.
// Sessions save to the database on their own (debounced) whenever they change,
// independent of the page's Save button. The page's Save also includes them.
//
// Page usage:
//   PrepSessions.create({ mountId, collectionPath, field:'sessions', prefix:'',
//     tasks:[{key,label}], title, getDate:()=>'YYYY-MM-DD', isLocked:()=>bool,
//     onSaved:(dateKey, fields)=>{},
//     quantities: [{key,label,step}]  or  {taskKey:[{key,label,step}]},
//     onTotals:({sums, hasQty, sessions})=>{}     // fill the day fields
//     extraWrites:(dateKey)=>[{path,data}] });    // whole-record autosave
//   PrepSessions.flushAll()       call BEFORE the page changes date
//   PrepSessions.reapply()        call after the page finishes loading a day
//   PrepSessions.loadAll()        call after the date changes
//   PrepSessions.fieldsAll(path)  fields to merge into the page's own save
// ============================================================================
(function () {
  const NAMES_KEY = 'nnc.prepStaffNames';
  const instances = [];

  function pad(n) { return String(n).padStart(2, '0'); }
  function nowHHMM() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function todayKey() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toMin(t) { if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function fmtDur(min) { if (min == null) return ''; const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h ${pad(m)}m` : `${m}m`; }
  function fmtTime(t) { const m = toMin(t); if (m == null) return ''; let h = Math.floor(m / 60); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${pad(m % 60)}${ap}`; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function cleanName(s) {
    return String(s || '').trim().replace(/\s+/g, ' ')
      .split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Shared name suggestions (across all prep pages on this device + names seen in records)
  function getKnownNames() { try { return JSON.parse(localStorage.getItem(NAMES_KEY) || '[]'); } catch (e) { return []; } }
  function addKnownNames(list) {
    const set = new Set(getKnownNames());
    list.forEach(n => { n = cleanName(n); if (n) set.add(n); });
    const arr = [...set].sort((a, b) => a.localeCompare(b));
    try { localStorage.setItem(NAMES_KEY, JSON.stringify(arr)); } catch (e) {}
    const dl = document.getElementById('psStaffNames');
    if (dl) dl.innerHTML = arr.map(n => `<option value="${esc(n)}">`).join('');
  }

  function injectCSS() {
    if (document.getElementById('psStyles')) return;
    const st = document.createElement('style'); st.id = 'psStyles';
    st.textContent = `
.ps-wrap{margin-top:16px}
.ps-summary{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;font-size:.85rem}
.ps-chipstat{background:#f1f5f9;border-radius:999px;padding:5px 12px;font-weight:600;color:#334155}
.ps-chipstat b{color:#0f172a}
.ps-card{border:1.5px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:10px;background:#fff}
.ps-card.ps-live{border-color:#f59e0b;background:#fffbeb}
.ps-card.ps-bad{border-color:#ef4444;background:#fef2f2}
.ps-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.ps-title{font-weight:700;font-size:.9rem;color:#0f172a}
.ps-dur{font-weight:700;font-size:.85rem;color:#047857}
.ps-card.ps-live .ps-dur{color:#b45309}
.ps-card.ps-bad .ps-dur{color:#b91c1c}
.ps-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.ps-grid>*,.ps-qty-grid>*{min-width:0}
.ps-card{box-sizing:border-box;max-width:100%;overflow:hidden}
.ps-field label{display:block;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#64748b;margin-bottom:4px}
.ps-timebox{display:flex;gap:6px}
.ps-timebox input{flex:1;min-width:0}
.ps-card input[type=time],.ps-card input[type=text],.ps-card select{width:100%;padding:10px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:1rem;background:#fff;box-sizing:border-box}
.ps-btn{border:none;border-radius:8px;padding:10px 12px;font-weight:700;font-size:.85rem;cursor:pointer;white-space:nowrap}
.ps-now{background:#e0f2fe;color:#0369a1}
.ps-add{background:#059669;color:#fff;width:100%;padding:12px;font-size:.95rem}
.ps-addp{background:#e2e8f0;color:#0f172a}
.ps-remove{background:none;color:#b91c1c;padding:6px 8px;font-size:.8rem}
.ps-remove.ps-confirm{background:#fee2e2}
.ps-people{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.ps-person{display:inline-flex;align-items:center;gap:6px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:999px;padding:4px 6px 4px 12px;font-weight:600;font-size:.85rem}
.ps-person button{border:none;background:#d1fae5;color:#065f46;border-radius:50%;width:22px;height:22px;cursor:pointer;font-weight:700;line-height:1}
.ps-addrow{display:flex;gap:6px}
.ps-full{grid-column:1/-1}
.ps-warn{font-size:.8rem;color:#b91c1c;font-weight:600;margin-top:6px}
.ps-status{font-size:.78rem;font-weight:600;color:#64748b;margin-top:8px;text-align:right}
.ps-status.err{color:#b91c1c}
.ps-locked .ps-ro{font-size:.9rem;color:#334155}
.ps-empty{font-size:.85rem;color:#64748b;margin-bottom:10px}
.ps-qty{grid-column:1/-1;border-top:1px dashed #cbd5e1;padding-top:10px;margin-top:2px}
.ps-qty-title{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#0f766e;margin-bottom:8px}
.ps-qty-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;align-items:end}
.ps-qty-grid label{display:block;font-size:.78rem;font-weight:600;color:#475569;margin-bottom:3px;text-transform:none;letter-spacing:0}
.ps-card .ps-qty-grid input{padding:9px;font-size:1rem;width:100%;box-sizing:border-box;min-width:0}
.ps-totals{display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 12px}
.ps-total{background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;border-radius:8px;padding:5px 10px;font-size:.8rem;font-weight:600}
.ps-total b{color:#0e7490}
.ps-note{font-size:.78rem;color:#0f766e;font-weight:600;margin-bottom:10px}
input.ps-from-sessions{background:#ecfeff!important;border-color:#67e8f9!important;color:#155e75!important;font-weight:700}
@media (max-width:520px){.ps-grid{grid-template-columns:1fr}}
`;
    document.head.appendChild(st);
    if (!document.getElementById('psStaffNames')) {
      const dl = document.createElement('datalist'); dl.id = 'psStaffNames'; document.body.appendChild(dl);
    }
    addKnownNames([]);
  }

  // Pure calculation, also used by tests
  function computeFields(sessions, prefix, tasks, qtyFor) {
    let labor = 0, clock = 0; const byTask = {}, byStaff = {};
    const clean = (sessions || []).map(s => {
      const a = toMin(s.start), b = toMin(s.end);
      const minutes = (a != null && b != null && b > a) ? b - a : null;
      const staff = (s.staff || []).map(cleanName).filter(Boolean);
      const out = { id: s.id || newId(), task: s.task || '', start: s.start || '', end: s.end || '', staff, notes: s.notes || '' };
      const qf = qtyFor ? qtyFor(out.task) : [];
      if (qf.length) {
        out.qty = {};
        qf.forEach(q => { const v = s.qty ? s.qty[q.key] : undefined; if (v !== '' && v != null && !isNaN(Number(v))) out.qty[q.key] = Number(v); });
      }
      if (minutes != null) {
        out.minutes = minutes;
        out.labor_minutes = minutes * Math.max(staff.length, 1);
        clock += minutes; labor += out.labor_minutes;
        byTask[out.task || 'other'] = (byTask[out.task || 'other'] || 0) + out.labor_minutes;
        staff.forEach(n => { byStaff[n] = (byStaff[n] || 0) + minutes; });
      }
      return out;
    });
    const f = {};
    f[prefix.field] = clean;
    f[prefix.p + 'labor_minutes'] = labor;
    f[prefix.p + 'labor_hours'] = Math.round(labor / 60 * 100) / 100;
    f[prefix.p + 'clock_minutes'] = clock;
    f[prefix.p + 'session_count'] = clean.length;
    f[prefix.p + 'labor_by_task'] = byTask;
    f[prefix.p + 'staff_minutes'] = byStaff;
    return f;
  }

  function create(opts) {
    injectCSS();
    const inst = {
      opts, sessions: [], loadedFor: null, timer: null, pendingKey: null,
      inflight: 0, failed: false, confirmRemove: null, lastSaved: null,
      tasks: opts.tasks && opts.tasks.length ? opts.tasks : [{ key: 'prep', label: 'Prep' }],
    };
    const P = { field: opts.field || 'sessions', p: opts.prefix || '' };
    const mount = () => document.getElementById(opts.mountId);

    inst.qtyFor = task => {
      const q = opts.quantities;
      if (!q) return [];
      if (Array.isArray(q)) return q;
      return q[task] || [];
    };
    inst.allQtyFields = () => {
      const q = opts.quantities; if (!q) return [];
      if (Array.isArray(q)) return q;
      const seen = new Set(), out = [];
      inst.tasks.forEach(t => (q[t.key] || []).forEach(f => { if (!seen.has(f.key)) { seen.add(f.key); out.push(f); } }));
      return out;
    };
    inst.fields = () => computeFields(inst.sessions, P, inst.tasks, inst.qtyFor);
    inst.totals = () => {
      const list = inst.fields()[P.field];
      const sums = {}; let hasQty = false;
      inst.allQtyFields().forEach(f => { sums[f.key] = 0; });
      list.forEach(s => Object.keys(s.qty || {}).forEach(k => { hasQty = true; sums[k] = Math.round(((sums[k] || 0) + s.qty[k]) * 1000) / 1000; }));
      // Round day totals (opts.decimals, default 2; chicken uses 1 = nearest 0.1)
      const f = Math.pow(10, opts.decimals == null ? 2 : opts.decimals);
      Object.keys(sums).forEach(k => { sums[k] = Math.round(sums[k] * f) / f; });
      return { sums, hasQty, sessions: list };
    };
    inst.loaded = false;
    inst.applyTotals = () => {
      if (!opts.onTotals || !inst.loaded || inst.loadedFor !== opts.getDate()) return;
      try { opts.onTotals(inst.totals()); } catch (e) { console.error('Sessions totals error:', e); }
    };
    inst.taskLabel = k => (inst.tasks.find(t => t.key === k) || {}).label || k || 'Session';

    inst.load = async function () {
      inst.flush();
      const key = opts.getDate();
      inst.loadedFor = key; inst.sessions = []; inst.failed = false; inst.lastSaved = null; inst.loaded = false;
      if (!inst.namesLearned && typeof auth !== 'undefined' && auth.currentUser) { inst.namesLearned = true; inst.learnNames(); }
      inst.render();
      if (typeof auth === 'undefined' || !auth.currentUser) return;
      try {
        const doc = await db.doc(`${opts.collectionPath}/${key}`).get();
        if (inst.loadedFor !== key) return; // date changed while loading
        const d = doc.exists ? doc.data() : {};
        inst.sessions = Array.isArray(d[P.field]) ? d[P.field].map(s => ({ ...s, staff: [...(s.staff || [])], qty: { ...(s.qty || {}) } })) : [];
        addKnownNames(inst.sessions.flatMap(s => s.staff || []));
        inst.loaded = true;
        inst.render();
        inst.applyTotals();
      } catch (err) { console.error('Sessions load error:', err); }
    };

    inst.learnNames = async function () {
      try {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
        const ck = cutoff.getFullYear() + '-' + pad(cutoff.getMonth() + 1) + '-' + pad(cutoff.getDate());
        const snap = await db.collection(opts.collectionPath)
          .where(firebase.firestore.FieldPath.documentId(), '>=', ck).get();
        const names = [];
        snap.forEach(doc => { const arr = doc.data()[P.field]; if (Array.isArray(arr)) arr.forEach(s => (s.staff || []).forEach(n => names.push(n))); });
        addKnownNames(names);
      } catch (err) { console.warn('Sessions name lookup skipped:', err && err.message); }
    };

    inst.changed = function (rerender) {
      if (rerender !== false) inst.render(); else inst.renderSummary();
      inst.applyTotals();
      inst.pendingKey = inst.loadedFor;
      clearTimeout(inst.timer);
      inst.timer = setTimeout(inst.flush, 700);
      inst.setStatus('Saving…');
    };

    inst.flush = function () {
      if (!inst.pendingKey) return;
      clearTimeout(inst.timer);
      const key = inst.pendingKey; inst.pendingKey = null;
      if (opts.isLocked && opts.isLocked()) return;
      if (typeof auth === 'undefined' || !auth.currentUser) { inst.failed = true; inst.setStatus('Not saved: please sign in', true); return; }
      const f = inst.fields();
      f[P.p + 'sessions_updatedAt'] = new Date().toISOString();
      f[P.p + 'sessions_updatedBy'] = auth.currentUser.email || 'unknown';
      // Whole-record autosave (day totals etc). Only when the page is still showing this
      // date, so a date change can never write the new day's (empty) screen to the old day.
      const ownPath = `${opts.collectionPath}/${key}`;
      let own = f; const others = [];
      if (opts.extraWrites && key === opts.getDate()) {
        try {
          (opts.extraWrites(key) || []).forEach(w => {
            if (w.path === ownPath) own = Object.assign({}, w.data, f); else others.push(w);
          });
        } catch (e) { console.error('Sessions extra write build error:', e); }
      }
      inst.inflight++;
      others.forEach(w => { inst.inflight++; db.doc(w.path).set(w.data, { merge: true }).catch(err => { inst.failed = true; console.error('Sessions extra save error:', err); }).finally(() => { inst.inflight--; inst.updateStatus(); }); });
      db.doc(ownPath).set(own, { merge: true })
        .then(() => {
          inst.failed = false; inst.lastSaved = new Date();
          if (opts.onSaved) try { opts.onSaved(key, own); } catch (e) { console.error(e); }
        })
        .catch(err => { inst.failed = true; inst.pendingKey = inst.pendingKey || key; console.error('Sessions save error:', err); })
        .finally(() => { inst.inflight--; inst.updateStatus(); });
    };

    inst.setStatus = function (txt, err) {
      const el = document.getElementById(opts.mountId + '_status');
      if (el) { el.textContent = txt; el.className = 'ps-status' + (err ? ' err' : ''); }
    };
    inst.updateStatus = function () {
      if (inst.failed) inst.setStatus('⚠ Times not saved. Check wifi; they will retry on the next change.', true);
      else if (inst.pendingKey || inst.inflight) inst.setStatus('Saving…');
      else if (inst.lastSaved) inst.setStatus('✓ Times saved ' + inst.lastSaved.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      else inst.setStatus('Times save automatically');
    };

    // ---------- actions (called from inline handlers) ----------
    const find = id => inst.sessions.find(s => s.id === id);
    inst.add = function () {
      const viewingToday = inst.loadedFor === todayKey();
      const last = inst.sessions[inst.sessions.length - 1];
      inst.sessions.push({
        id: newId(), task: last ? last.task : inst.tasks[0].key,
        start: viewingToday ? nowHHMM() : '', end: '',
        staff: last ? [...last.staff] : [], notes: '', qty: {}
      });
      inst.changed();
    };
    inst.set = function (id, field, value) { const s = find(id); if (!s) return; s[field] = value; inst.changed(field !== 'notes'); };
    inst.setQty = function (id, key, value) {
      const s = find(id); if (!s) return;
      if (!s.qty) s.qty = {};
      if (value === '' || value == null) delete s.qty[key]; else s.qty[key] = Number(value);
      inst.changed(false);
    };
    inst.now = function (id, field) { const s = find(id); if (!s) return; s[field] = nowHHMM(); inst.changed(); };
    inst.addPerson = function (id, inputId, refocus) {
      const s = find(id); const input = document.getElementById(inputId); if (!s || !input) return;
      const parts = input.value.split(',').map(cleanName).filter(Boolean);
      if (!parts.length) return;
      parts.forEach(n => { if (!s.staff.some(x => x.toLowerCase() === n.toLowerCase())) s.staff.push(n); });
      addKnownNames(parts); input.value = '';
      inst.changed();
      if (refocus) { const again = document.getElementById(inputId); if (again) again.focus(); }
    };
    inst.removePerson = function (id, idx) { const s = find(id); if (!s) return; s.staff.splice(idx, 1); inst.changed(); };
    inst.remove = function (id) {
      if (inst.confirmRemove !== id) { inst.confirmRemove = id; inst.render(); setTimeout(() => { if (inst.confirmRemove === id) { inst.confirmRemove = null; inst.render(); } }, 4000); return; }
      inst.confirmRemove = null;
      inst.sessions = inst.sessions.filter(s => s.id !== id);
      inst.changed();
    };

    inst.render = function () {
      const el = mount(); if (!el) return;
      const locked = opts.isLocked && opts.isLocked();
      const me = `PrepSessions.get('${opts.mountId}')`;
      const f = inst.fields();
      const list = f[P.field];
      const live = list.filter(s => s.start && !s.end).length;
      const bad = list.filter(s => s.start && s.end && s.minutes == null).length;
      const people = Object.keys(f[P.p + 'staff_minutes']);
      let h = `<div class="ps-wrap${locked ? ' ps-locked' : ''}"><div id="${opts.mountId}_sum">${inst.summaryHTML()}</div>`;
      if (!list.length) h += `<div class="ps-empty">${locked ? 'No sessions recorded for this day.' : 'No sessions yet. Tap the button when you start working.'}</div>`;
      list.forEach((s, i) => {
        const isLive = s.start && !s.end, isBad = s.start && s.end && s.minutes == null;
        const durTxt = s.minutes != null ? fmtDur(s.minutes) + (s.staff.length > 1 ? ` × ${s.staff.length} people = ${fmtDur(s.labor_minutes)}` : '')
          : isBad ? 'End is before start' : isLive ? 'Running…' : '';
        h += `<div class="ps-card${isLive ? ' ps-live' : ''}${isBad ? ' ps-bad' : ''}">`;
        h += `<div class="ps-head"><span class="ps-title">Session ${i + 1}${inst.tasks.length > 1 || locked ? ' · ' + esc(inst.taskLabel(s.task)) : ''}</span><span class="ps-dur">${durTxt}</span></div>`;
        if (locked) {
          const qtxt = inst.qtyFor(s.task).filter(q => s.qty && s.qty[q.key] != null).map(q => `${esc(q.label)}: ${s.qty[q.key]}`).join(' · ');
          h += `<div class="ps-ro">${fmtTime(s.start) || '?'} to ${fmtTime(s.end) || '?'} · ${esc(s.staff.join(', ') || 'No name')}${s.notes ? ' · ' + esc(s.notes) : ''}${qtxt ? '<br>' + qtxt : ''}</div></div>`;
          return;
        }
        h += `<div class="ps-grid">`;
        if (inst.tasks.length > 1) {
          h += `<div class="ps-field ps-full"><label>What was done</label><select onchange="${me}.set('${s.id}','task',this.value)">` +
            inst.tasks.map(t => `<option value="${esc(t.key)}"${t.key === s.task ? ' selected' : ''}>${esc(t.label)}</option>`).join('') + `</select></div>`;
        }
        h += `<div class="ps-field"><label>Start</label><div class="ps-timebox"><input type="time" value="${esc(s.start)}" onchange="${me}.set('${s.id}','start',this.value)"><button type="button" class="ps-btn ps-now" onclick="${me}.now('${s.id}','start')">Now</button></div></div>`;
        h += `<div class="ps-field"><label>End</label><div class="ps-timebox"><input type="time" value="${esc(s.end)}" onchange="${me}.set('${s.id}','end',this.value)"><button type="button" class="ps-btn ps-now" onclick="${me}.now('${s.id}','end')">Now</button></div></div>`;
        const inId = `${opts.mountId}_p_${s.id}`;
        h += `<div class="ps-field ps-full"><label>Who worked</label><div class="ps-people">` +
          s.staff.map((n, idx) => `<span class="ps-person">${esc(n)}<button type="button" aria-label="Remove ${esc(n)}" onclick="${me}.removePerson('${s.id}',${idx})">×</button></span>`).join('') +
          `</div><div class="ps-addrow"><input type="text" id="${inId}" list="psStaffNames" placeholder="Type a name" autocomplete="off"
            onkeydown="if(event.key==='Enter'){event.preventDefault();${me}.addPerson('${s.id}','${inId}',true)}"
            onblur="if(this.value.trim())${me}.addPerson('${s.id}','${inId}')"><button type="button" class="ps-btn ps-addp" onmousedown="event.preventDefault()" onclick="${me}.addPerson('${s.id}','${inId}',true)">Add</button></div>
            ${!s.staff.length ? '<div class="ps-warn">Add at least one name</div>' : ''}</div>`;
        const qf = inst.qtyFor(s.task);
        if (qf.length) {
          h += `<div class="ps-qty"><div class="ps-qty-title">What was done this session</div><div class="ps-qty-grid">` +
            qf.map(q => `<div><label>${esc(q.label)}</label><input type="number" inputmode="decimal" min="0" step="${q.step || 'any'}" value="${s.qty && s.qty[q.key] != null ? esc(s.qty[q.key]) : ''}" oninput="${me}.setQty('${s.id}','${q.key}',this.value)"></div>`).join('') +
            `</div></div>`;
        }
        h += `<div class="ps-field ps-full"><label>Notes (optional)</label><input type="text" value="${esc(s.notes)}" oninput="${me}.set('${s.id}','notes',this.value)"></div>`;
        h += `</div><div style="text-align:right;margin-top:6px"><button type="button" class="ps-btn ps-remove${inst.confirmRemove === s.id ? ' ps-confirm' : ''}" onclick="${me}.remove('${s.id}')">${inst.confirmRemove === s.id ? 'Tap again to delete' : 'Delete session'}</button></div>`;
        h += `</div>`;
      });
      if (!locked) h += `<button type="button" class="ps-btn ps-add" onclick="${me}.add()">+ ${list.length ? 'Add another session' : 'Start a session'}</button>`;
      h += `<div class="ps-status" id="${opts.mountId}_status"></div></div>`;
      el.innerHTML = h;
      inst.updateStatus();
    };

    inst.totalsHTML = function () {
      const fieldsList = inst.allQtyFields();
      if (!fieldsList.length) return '';
      const t = inst.totals();
      if (!t.hasQty) return `<div class="ps-note">Enter what was done in each session and the day totals above fill in automatically.</div>`;
      return `<div class="ps-note">Day totals above are added up from these sessions.</div><div class="ps-totals">` +
        fieldsList.filter(f => t.sums[f.key] && !f.noTotal).map(f => `<span class="ps-total">${esc(f.label)}: <b>${Math.round(t.sums[f.key] * 100) / 100}</b></span>`).join('') + `</div>`;
    };
    inst.summaryHTML = function () {
      const f = inst.fields();
      const list = f[P.field];
      const live = list.filter(s => s.start && !s.end).length;
      const people = Object.keys(f[P.p + 'staff_minutes']);
      let h = '';
      h += `<div class="ps-summary">
        <span class="ps-chipstat">Sessions: <b>${list.length}</b></span>
        <span class="ps-chipstat">On the clock: <b>${fmtDur(f[P.p + 'clock_minutes']) || '0m'}</b></span>
        <span class="ps-chipstat">Staff time: <b>${fmtDur(f[P.p + 'labor_minutes']) || '0m'}</b></span>
        ${people.length ? `<span class="ps-chipstat">Staff: <b>${esc(people.join(', '))}</b></span>` : ''}
        ${live ? `<span class="ps-chipstat" style="background:#fef3c7;color:#92400e">${live} still running</span>` : ''}
      </div>`;
      h += inst.totalsHTML();
      return h;
    };
    inst.renderSummary = function () {
      // Re-render only the summary so the box being typed in keeps focus
      const box = document.getElementById(opts.mountId + '_sum');
      if (!box) return inst.render();
      box.innerHTML = inst.summaryHTML();
    };

    instances.push(inst);
    inst.render();
    return inst;
  }

  // Flush on tab hide / close; warn if times are still saving
  function flushAll() { instances.forEach(i => i.flush()); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', e => {
    flushAll();
    if (instances.some(i => i.inflight > 0 || i.failed)) { e.preventDefault(); e.returnValue = 'Work times are still saving.'; return e.returnValue; }
  });

  // Fill the page's day-level inputs with the session sums and lock them. When no session
  // has quantities, give the inputs back to manual entry (unless the page locked them itself).
  function applyDaySums(t, keys, after) {
    keys.forEach(k => {
      const el = document.getElementById(k); if (!el) return;
      if (t.hasQty) {
        const v = t.sums[k] || 0;
        el.value = v ? Math.round(v * 100) / 100 : '';
        if (!el.hasAttribute('readonly')) { el.setAttribute('readonly', true); el.dataset.psSum = '1'; }
        el.classList.add('ps-from-sessions'); el.title = 'Added up from the Time & Staff sessions';
      } else if (el.classList.contains('ps-from-sessions')) {
        if (el.dataset.psSum === '1' && !el.hasAttribute('data-hist-locked')) el.removeAttribute('readonly');
        delete el.dataset.psSum; el.classList.remove('ps-from-sessions'); el.title = '';
      }
    });
    if (t.hasQty && after) after();
  }

  window.PrepSessions = {
    applyDaySums,
    create,
    computeFields,
    get: id => instances.find(i => i.opts.mountId === id),
    loadAll: () => { instances.forEach(i => i.load()); },
    flushAll: () => { instances.forEach(i => i.flush()); },
    reapply: () => { instances.forEach(i => i.applyTotals()); },
    learnNamesAll: () => { instances.forEach(i => i.learnNames()); },
    // Fields to merge into a page's own save. Pass a collectionPath to limit to one record type.
    fieldsAll: (path) => instances.filter(i => !path || i.opts.collectionPath === path)
      .reduce((o, i) => Object.assign(o, i.fields()), {}),
    _internals: { toMin, fmtDur, cleanName }
  };
})();
