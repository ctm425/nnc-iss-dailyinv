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
//
// Logged sessions (Oct 30 2026):
//   Each session has status 'open' or 'logged'. Staff fill in an open session and
//   tap "Log session" (needs start, end after start, at least one person). A logged
//   session shows as a locked summary card. Only the owner sees Edit on it
//   (opts.canEditLogged, default: the page's isOwner()). Edits are made on a copy;
//   Save changes keeps the previous values in s.history [{at, by, byName, before}].
//   Totals, labor fields and the day fields count LOGGED sessions only.
//   Sessions saved before this change load as logged, except today's sessions with
//   no end time, which stay open so staff can finish them.
// ============================================================================
(function () {
  const NAMES_KEY = 'nnc.prepStaffNames';
  // Staff list (Oct 29 2026). Shown as tap-to-select buttons on every prep page.
  // To add or remove someone, edit this list (keep it alphabetical) and re-upload this file.
  // Later this should move to a shared staff list in the database (see CLAUDE.md).
  const STAFF_ROSTER = [
    'Adan', 'Antonio', 'Christopher', 'Damian', 'Delfino', 'Enrique', 'Gilberto', 'Humberto',
    'Juan Carlos', 'Kalet', 'Nectalid', 'Ramon', 'Raymundo', 'Sergio', 'Tarcisio'
  ];
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
.ps-roster{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.ps-pick{border:1.5px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:999px;padding:9px 14px;font-weight:600;font-size:.92rem;cursor:pointer}
.ps-pick.on{background:#059669;border-color:#059669;color:#fff}
.ps-other{margin-top:4px}
.ps-other summary{font-size:.8rem;font-weight:600;color:#475569;cursor:pointer;padding:4px 0}
.ps-full{grid-column:1/-1}
.ps-warn{font-size:.8rem;color:#b91c1c;font-weight:600;margin-top:6px}
.ps-status{font-size:.78rem;font-weight:600;color:#64748b;margin-top:8px;text-align:right}
.ps-status.err{color:#b91c1c}
.ps-locked .ps-ro{font-size:.9rem;color:#334155}
.ps-empty{font-size:.85rem;color:#64748b;margin-bottom:10px}
.ps-card.ps-logged{padding:0;border-color:#cbd5e1}
.ps-card.ps-editing{border:2px solid #2563eb;background:#eff6ff}
.ps-lhead{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:#f1f5f9;border-bottom:1px solid #e2e8f0}
.ps-lhead .ps-title{display:flex;align-items:center;gap:6px}
.ps-lbody{padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.ps-ltime{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.ps-ltime b{font-size:1.05rem}
.ps-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ps-chip{background:#dbeafe;color:#1e3a8a;border-radius:999px;padding:3px 10px;font-size:.8rem;font-weight:600}
.ps-lqty{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 14px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:.82rem}
.ps-lqty div{display:flex;justify-content:space-between;gap:8px}.ps-lqty span{color:#475569}
.ps-lfoot{font-size:.74rem;color:#64748b}
.ps-edit{background:#fff;color:#1e3a5f;border:1.5px solid #94a3b8;min-height:36px}
.ps-log{width:100%;padding:13px;font-size:1rem;background:#16a34a;color:#fff;margin-top:8px}
.ps-log:disabled{background:#e2e8f0;color:#64748b;cursor:not-allowed}
.ps-editbar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}
.ps-cancel{background:#fff;color:#334155;border:1.5px solid #94a3b8;padding:12px}
.ps-save{background:#2563eb;color:#fff;padding:12px}
.ps-badge{font-size:.72rem;font-weight:700;padding:3px 9px;border-radius:999px}
.ps-badge.open{background:#fef3c7;color:#92400e}.ps-badge.edit{background:#dbeafe;color:#1e3a8a}
.ps-hist{font-size:.76rem;color:#475569}.ps-hist summary{cursor:pointer;color:#1e3a5f;font-weight:700}
.ps-hist ul{margin:6px 0 0 16px;padding:0}.ps-hist li{margin-bottom:4px}
.ps-qty{grid-column:1/-1;border-top:1px dashed #cbd5e1;padding-top:10px;margin-top:2px}
.ps-qty-title{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#0f766e;margin-bottom:8px}
.ps-qty-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;align-items:end}
.ps-qty-grid label{display:block;font-size:.78rem;font-weight:600;color:#475569;margin-bottom:3px;text-transform:none;letter-spacing:0}
.ps-card .ps-qty-grid input{padding:9px;font-size:1rem;width:100%;box-sizing:border-box;min-width:0}
.ps-totals{display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 12px}
.ps-total{background:#ecfeff;border:1px solid #a5f3fc;color:#155e75;border-radius:8px;padding:5px 10px;font-size:.8rem;font-weight:600}
.ps-total b{color:#0e7490}
.ps-note{font-size:.78rem;color:#0f766e;font-weight:600;margin-bottom:10px}
.ps-total-task{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#334155;margin:2px 0 6px}
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
      const out = { id: s.id || newId(), task: s.task || '', start: s.start || '', end: s.end || '', staff, notes: s.notes || '',
        status: s.status === 'open' ? 'open' : 'logged' };
      ['loggedAt', 'loggedBy', 'loggedByName', 'editedAt', 'editedBy', 'editedByName'].forEach(k => { if (s[k]) out[k] = s[k]; });
      if (Array.isArray(s.history) && s.history.length) out.history = s.history;
      const qf = qtyFor ? qtyFor(out.task) : [];
      if (qf.length) {
        out.qty = {};
        qf.forEach(q => { const v = s.qty ? s.qty[q.key] : undefined; if (v !== '' && v != null && !isNaN(Number(v))) out.qty[q.key] = Number(v); });
      }
      if (minutes != null) {
        out.minutes = minutes;
        out.labor_minutes = minutes * Math.max(staff.length, 1);
      }
      if (minutes != null && out.status === 'logged') {
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
    f[prefix.p + 'session_count'] = clean.filter(s => s.status === 'logged').length;
    f[prefix.p + 'labor_by_task'] = byTask;
    f[prefix.p + 'staff_minutes'] = byStaff;
    return f;
  }

  function create(opts) {
    injectCSS();
    const inst = {
      opts, sessions: [], loadedFor: null, timer: null, pendingKey: null,
      inflight: 0, failed: false, confirmRemove: null, lastSaved: null,
      editing: null, draft: null,
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
    inst.canEditLogged = () => {
      if (opts.canEditLogged) return !!opts.canEditLogged();
      try { return typeof isOwner === 'function' && !!isOwner(); } catch (e) { return false; }
    };
    inst.who = () => {
      const u = (typeof auth !== 'undefined' && auth.currentUser) || null;
      const prof = (typeof currentUserProfile !== 'undefined' && currentUserProfile) || null;
      return { email: (u && u.email) || 'unknown', name: (prof && prof.displayName) || (u && u.email ? u.email.split('@')[0] : 'unknown') };
    };
    // Sessions saved before Oct 30 2026 have no status. Treat them as logged, except
    // today's sessions with no end yet, which stay open so staff can finish them.
    inst.normalize = (list, key) => list.map(s => {
      if (s.status === 'open' || s.status === 'logged') return s;
      const open = key === todayKey() && !s.end;
      return Object.assign({}, s, { status: open ? 'open' : 'logged' });
    });
    inst.readyToLog = s => {
      const a = toMin(s.start), b = toMin(s.end);
      if (a == null) return 'Add a start time.';
      if (b == null) return 'Add an end time (or tap Now) to log it.';
      if (b <= a) return 'End time has to be after start time.';
      if (!(s.staff || []).length) return 'Tap at least one name.';
      return '';
    };
    inst.totals = () => {
      const list = inst.fields()[P.field];
      const sums = {}; let hasQty = false;
      inst.allQtyFields().forEach(f => { sums[f.key] = 0; });
      list.filter(s => s.status === 'logged').forEach(s => Object.keys(s.qty || {}).forEach(k => { hasQty = true; sums[k] = Math.round(((sums[k] || 0) + s.qty[k]) * 1000) / 1000; }));
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
      inst.editing = null; inst.draft = null;
      if (!inst.namesLearned && typeof auth !== 'undefined' && auth.currentUser) { inst.namesLearned = true; inst.learnNames(); }
      inst.render();
      if (typeof auth === 'undefined' || !auth.currentUser) return;
      try {
        const doc = await db.doc(`${opts.collectionPath}/${key}`).get();
        if (inst.loadedFor !== key) return; // date changed while loading
        const d = doc.exists ? doc.data() : {};
        inst.sessions = inst.normalize(Array.isArray(d[P.field]) ? d[P.field].map(s => ({ ...s, staff: [...(s.staff || [])], qty: { ...(s.qty || {}) } })) : [], key);
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
    const find = id => (inst.editing === id && inst.draft) ? inst.draft : inst.sessions.find(s => s.id === id);
    // Edits to the owner's draft only re-render; nothing saves until Save changes.
    const touched = (id, rerender) => {
      if (inst.editing === id) { inst.render(); return; }
      inst.changed(rerender);
    };
    inst.add = function () {
      const viewingToday = inst.loadedFor === todayKey();
      const last = inst.sessions[inst.sessions.length - 1];
      if (inst.editing) return;
      inst.sessions.push({
        id: newId(), task: last ? last.task : inst.tasks[0].key,
        start: viewingToday ? nowHHMM() : '', end: '',
        staff: last ? [...last.staff] : [], notes: '', qty: {}, status: 'open'
      });
      inst.changed();
    };
    inst.set = function (id, field, value) {
      const s = find(id); if (!s) return; s[field] = value;
      if (inst.editing === id) { if (field !== 'notes') inst.render(); return; }
      inst.changed(field !== 'notes');
    };
    inst.setQty = function (id, key, value) {
      const s = find(id); if (!s) return;
      if (!s.qty) s.qty = {};
      if (value === '' || value == null) delete s.qty[key]; else s.qty[key] = Number(value);
      if (inst.editing === id) return; // keep focus while typing in the draft
      inst.changed(false);
    };
    inst.now = function (id, field) { const s = find(id); if (!s) return; s[field] = nowHHMM(); touched(id); };
    inst.addPerson = function (id, inputId, refocus) {
      const s = find(id); const input = document.getElementById(inputId); if (!s || !input) return;
      const parts = input.value.split(',').map(cleanName).filter(Boolean);
      if (!parts.length) return;
      parts.forEach(n => { if (!s.staff.some(x => x.toLowerCase() === n.toLowerCase())) s.staff.push(n); });
      addKnownNames(parts); input.value = '';
      touched(id);
      if (refocus) { const again = document.getElementById(inputId); if (again) again.focus(); }
    };
    inst.togglePerson = function (id, rosterIdx) {
      const s = find(id); const name = STAFF_ROSTER[rosterIdx]; if (!s || !name) return;
      const i = s.staff.findIndex(x => x.toLowerCase() === name.toLowerCase());
      if (i >= 0) s.staff.splice(i, 1); else s.staff.push(name);
      touched(id);
    };
    inst.removePerson = function (id, idx) { const s = find(id); if (!s) return; s.staff.splice(idx, 1); touched(id); };
    inst.remove = function (id) {
      if (inst.confirmRemove !== id) { inst.confirmRemove = id; inst.render(); setTimeout(() => { if (inst.confirmRemove === id) { inst.confirmRemove = null; inst.render(); } }, 4000); return; }
      inst.confirmRemove = null;
      const target = inst.sessions.find(s => s.id === id);
      if (target && target.status === 'logged' && !inst.canEditLogged()) return;
      if (inst.editing === id) { inst.editing = null; inst.draft = null; }
      inst.sessions = inst.sessions.filter(s => s.id !== id);
      inst.changed();
    };
    inst.log = function (id) {
      const s = inst.sessions.find(x => x.id === id); if (!s || s.status === 'logged') return;
      if (inst.readyToLog(s)) { inst.render(); return; }
      const w = inst.who();
      s.status = 'logged'; s.loggedAt = new Date().toISOString(); s.loggedBy = w.email; s.loggedByName = w.name;
      inst.changed();
    };
    inst.edit = function (id) {
      if (!inst.canEditLogged() || inst.editing) return;
      const s = inst.sessions.find(x => x.id === id); if (!s) return;
      inst.editing = id; inst.draft = JSON.parse(JSON.stringify(s));
      inst.draft.staff = inst.draft.staff || []; inst.draft.qty = inst.draft.qty || {};
      inst.render();
    };
    inst.cancelEdit = function () { inst.editing = null; inst.draft = null; inst.render(); };
    const SNAP_KEYS = ['task', 'start', 'end', 'staff', 'qty', 'notes'];
    inst.saveEdit = function () {
      const id = inst.editing; const d = inst.draft; if (!id || !d) return;
      if (inst.readyToLog(d)) { inst.render(); return; }
      const i = inst.sessions.findIndex(x => x.id === id); if (i < 0) { inst.cancelEdit(); return; }
      const orig = inst.sessions[i];
      const snap = o => { const r = {}; SNAP_KEYS.forEach(k => { r[k] = o[k] == null ? (k === 'staff' ? [] : k === 'qty' ? {} : '') : JSON.parse(JSON.stringify(o[k])); }); return r; };
      const before = snap(orig), after = snap(d);
      if (JSON.stringify(before) === JSON.stringify(after)) { inst.cancelEdit(); return; }
      const w = inst.who(), at = new Date().toISOString();
      const next = Object.assign({}, orig, after, { editedAt: at, editedBy: w.email, editedByName: w.name });
      next.history = (orig.history || []).concat([{ at, by: w.email, byName: w.name, before }]);
      inst.sessions[i] = next;
      inst.editing = null; inst.draft = null;
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
      const canEdit = !locked && inst.canEditLogged();
      const when = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase(); };
      const whenDay = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + when(iso); };
      const qtyLine = (task, qty) => inst.qtyFor(task).map(q => `${esc(q.label)} ${qty && qty[q.key] != null ? qty[q.key] : '—'}`).join(', ');
      const diffText = (b, a) => {
        const out = [];
        if (b.task !== a.task) out.push(`task ${esc(inst.taskLabel(b.task))} → ${esc(inst.taskLabel(a.task))}`);
        if (b.start !== a.start) out.push(`start ${fmtTime(b.start) || '—'} → ${fmtTime(a.start) || '—'}`);
        if (b.end !== a.end) out.push(`end ${fmtTime(b.end) || '—'} → ${fmtTime(a.end) || '—'}`);
        if ((b.staff || []).join(', ') !== (a.staff || []).join(', ')) out.push(`staff ${esc((b.staff || []).join(', ') || 'none')} → ${esc((a.staff || []).join(', ') || 'none')}`);
        inst.qtyFor(a.task).concat(b.task !== a.task ? inst.qtyFor(b.task) : []).forEach(q => {
          const x = b.qty ? b.qty[q.key] : undefined, y = a.qty ? a.qty[q.key] : undefined;
          if ((x == null ? '' : x) !== (y == null ? '' : y)) out.push(`${esc(q.label)} ${x == null ? '—' : x} → ${y == null ? '—' : y}`);
        });
        if ((b.notes || '') !== (a.notes || '')) out.push('notes changed');
        return out.join('; ') || 'no field changes';
      };
      list.forEach((s0, i) => {
        const editingThis = inst.editing === s0.id && inst.draft;
        // ----- Logged (or past-day) session: locked summary card -----
        if ((s0.status === 'logged' || locked) && !editingThis) {
          const s = s0;
          const durTxt = s.minutes != null ? fmtDur(s.minutes) : (s.start && s.end ? 'End is before start' : '');
          const labor = s.minutes != null && s.staff.length > 1 ? `${fmtDur(s.labor_minutes)} staff time` : '';
          const qf = inst.qtyFor(s.task);
          const isOpenPast = s.status !== 'logged';
          let foot = isOpenPast ? 'Never logged' : (s.loggedAt ? `Logged ${when(s.loggedAt)}${s.loggedByName ? ' by ' + esc(s.loggedByName) : ''}` : 'Logged');
          if (s.editedAt) foot += ` · Edited ${when(s.editedAt)}${s.editedByName ? ' by ' + esc(s.editedByName) : ''}`;
          h += `<div class="ps-card ps-logged">
            <div class="ps-lhead"><span class="ps-title"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>Session ${i + 1} · ${esc(inst.taskLabel(s.task))}</span>
            ${canEdit && !inst.editing ? `<button type="button" class="ps-btn ps-edit" onclick="${me}.edit('${s.id}')">Edit</button>` : ''}</div>
            <div class="ps-lbody">
              <div class="ps-ltime"><b>${fmtTime(s.start) || '?'} – ${fmtTime(s.end) || '?'}</b><span class="ps-dur">${durTxt}</span></div>
              <div class="ps-chips">${s.staff.length ? s.staff.map(n => `<span class="ps-chip">${esc(n)}</span>`).join('') : '<span class="ps-lfoot">No name</span>'}${labor ? `<span class="ps-lfoot">${labor}</span>` : ''}</div>
              ${qf.length ? `<div class="ps-lqty">${qf.map(q => `<div><span>${esc(q.label)}</span><b>${s.qty && s.qty[q.key] != null ? esc(s.qty[q.key]) : 0}</b></div>`).join('')}</div>` : ''}
              ${s.notes ? `<div class="ps-lfoot">Note: ${esc(s.notes)}</div>` : ''}
              <div class="ps-lfoot">${foot}</div>
              ${s.history && s.history.length && inst.canEditLogged() ? `<details class="ps-hist"><summary>Changes (${s.history.length})</summary><ul>${s.history.slice().reverse().map((hh, k, arr) => {
                const afterState = k === 0 ? s : arr[k - 1].before;
                return `<li>${whenDay(hh.at)} by ${esc(hh.byName || hh.by)}: ${diffText(hh.before, afterState)}</li>`;
              }).join('')}</ul></details>` : ''}
            </div></div>`;
          return;
        }
        const s = editingThis ? Object.assign({}, inst.draft, (() => { const a = toMin(inst.draft.start), b = toMin(inst.draft.end); const m = a != null && b != null && b > a ? b - a : null; return { minutes: m, labor_minutes: m != null ? m * Math.max((inst.draft.staff || []).length, 1) : null }; })()) : s0;
        s.staff = s.staff || [];
        const isLive = s.start && !s.end, isBad = s.start && s.end && s.minutes == null;
        const durTxt = s.minutes != null ? fmtDur(s.minutes) + (s.staff.length > 1 ? ` × ${s.staff.length} people = ${fmtDur(s.labor_minutes)}` : '')
          : isBad ? 'End is before start' : isLive ? 'Running…' : '';
        h += `<div class="ps-card${editingThis ? ' ps-editing' : (isLive ? ' ps-live' : '')}${isBad ? ' ps-bad' : ''}">`;
        h += `<div class="ps-head"><span class="ps-title">Session ${i + 1}${inst.tasks.length > 1 ? ' · ' + esc(inst.taskLabel(s.task)) : ''}</span><span class="ps-dur">${durTxt}</span>${editingThis ? '<span class="ps-badge edit">Editing</span>' : '<span class="ps-badge open">Not logged yet</span>'}</div>`;
        h += `<div class="ps-grid">`;
        if (inst.tasks.length > 1) {
          h += `<div class="ps-field ps-full"><label>What was done</label><select onchange="${me}.set('${s.id}','task',this.value)">` +
            inst.tasks.map(t => `<option value="${esc(t.key)}"${t.key === s.task ? ' selected' : ''}>${esc(t.label)}</option>`).join('') + `</select></div>`;
        }
        h += `<div class="ps-field"><label>Start</label><div class="ps-timebox"><input type="time" value="${esc(s.start)}" onchange="${me}.set('${s.id}','start',this.value)"><button type="button" class="ps-btn ps-now" onclick="${me}.now('${s.id}','start')">Now</button></div></div>`;
        h += `<div class="ps-field"><label>End</label><div class="ps-timebox"><input type="time" value="${esc(s.end)}" onchange="${me}.set('${s.id}','end',this.value)"><button type="button" class="ps-btn ps-now" onclick="${me}.now('${s.id}','end')">Now</button></div></div>`;
        const inId = `${opts.mountId}_p_${s.id}`;
        const onRoster = n => STAFF_ROSTER.some(r => r.toLowerCase() === n.toLowerCase());
        const picked = n => s.staff.some(x => x.toLowerCase() === n.toLowerCase());
        const others = s.staff.map((n, idx) => ({ n, idx })).filter(o => !onRoster(o.n));
        h += `<div class="ps-field ps-full"><label>Who worked (tap all that apply)</label><div class="ps-roster">` +
          STAFF_ROSTER.map((n, i) => `<button type="button" class="ps-pick${picked(n) ? ' on' : ''}" aria-pressed="${picked(n)}" onclick="${me}.togglePerson('${s.id}',${i})">${picked(n) ? '✓ ' : ''}${esc(n)}</button>`).join('') +
          `</div>` +
          (others.length ? `<div class="ps-people">` + others.map(o => `<span class="ps-person">${esc(o.n)}<button type="button" aria-label="Remove ${esc(o.n)}" onclick="${me}.removePerson('${s.id}',${o.idx})">×</button></span>`).join('') + `</div>` : '') +
          `<details class="ps-other"${others.length ? ' open' : ''}><summary>Someone not on the list?</summary><div class="ps-addrow"><input type="text" id="${inId}" list="psStaffNames" placeholder="Type their name" autocomplete="off"
            onkeydown="if(event.key==='Enter'){event.preventDefault();${me}.addPerson('${s.id}','${inId}',true)}"
            onblur="if(this.value.trim())${me}.addPerson('${s.id}','${inId}')"><button type="button" class="ps-btn ps-addp" onmousedown="event.preventDefault()" onclick="${me}.addPerson('${s.id}','${inId}',true)">Add</button></div></details>
            ${!s.staff.length ? '<div class="ps-warn">Tap at least one name</div>' : ''}</div>`;
        const qf = inst.qtyFor(s.task);
        if (qf.length) {
          h += `<div class="ps-qty"><div class="ps-qty-title">What was done this session</div><div class="ps-qty-grid">` +
            qf.map(q => `<div><label>${esc(q.label)}</label><input type="number" inputmode="decimal" min="0" step="${q.step || 'any'}" value="${s.qty && s.qty[q.key] != null ? esc(s.qty[q.key]) : ''}" oninput="${me}.setQty('${s.id}','${q.key}',this.value)"></div>`).join('') +
            `</div></div>`;
        }
        h += `<div class="ps-field ps-full"><label>Notes (optional)</label><input type="text" value="${esc(s.notes)}" oninput="${me}.set('${s.id}','notes',this.value)"></div>`;
        h += `</div>`;
        const why = inst.readyToLog(s);
        if (why) h += `<div class="ps-warn" style="margin-top:6px">${esc(why)}</div>`;
        if (editingThis) {
          h += `<div class="ps-editbar"><button type="button" class="ps-btn ps-cancel" onclick="${me}.cancelEdit()">Cancel</button><button type="button" class="ps-btn ps-save" onclick="${me}.saveEdit()" ${why ? 'disabled' : ''}>Save changes</button></div>`;
        } else {
          h += `<button type="button" class="ps-btn ps-log" onclick="${me}.log('${s.id}')" ${why ? 'disabled' : ''}>Log session</button>`;
        }
        h += `<div style="text-align:right;margin-top:6px"><button type="button" class="ps-btn ps-remove${inst.confirmRemove === s.id ? ' ps-confirm' : ''}" onclick="${me}.remove('${s.id}')">${inst.confirmRemove === s.id ? 'Tap again to delete' : 'Delete session'}</button></div>`;
        h += `</div>`;
      });
      if (!locked && !inst.editing) h += `<button type="button" class="ps-btn ps-add" onclick="${me}.add()">+ ${list.length ? 'Add another session' : 'Start a session'}</button>`;
      h += `<div class="ps-status" id="${opts.mountId}_status"></div></div>`;
      el.innerHTML = h;
      inst.updateStatus();
    };

    inst.totalsHTML = function () {
      const fieldsList = inst.allQtyFields();
      if (!fieldsList.length) return '';
      const t = inst.totals();
      if (!t.hasQty) return `<div class="ps-note">Enter what was done in each session. Once a session is logged, the day totals above fill in automatically.</div>`;
      const chips = list => list.filter(f => t.sums[f.key] && !f.noTotal).map(f => `<span class="ps-total">${esc(f.label)}: <b>${Math.round(t.sums[f.key] * 100) / 100}</b></span>`).join('');
      let out = `<div class="ps-note">Day totals above are added up from these sessions.</div>`;
      // Per-task quantities: one row of totals per task (e.g. Cut Korma / Only Clean)
      if (!Array.isArray(opts.quantities)) {
        inst.tasks.forEach(task => {
          const c = chips(inst.qtyFor(task.key));
          if (c) out += `<div class="ps-total-task">${esc(task.label)}</div><div class="ps-totals">${c}</div>`;
        });
        return out;
      }
      return out + `<div class="ps-totals">${chips(fieldsList)}</div>`;
    };
    inst.summaryHTML = function () {
      const f = inst.fields();
      const list = f[P.field];
      const live = list.filter(s => s.status === 'open').length;
      const people = Object.keys(f[P.p + 'staff_minutes']);
      let h = '';
      h += `<div class="ps-summary">
        <span class="ps-chipstat">Logged: <b>${f[P.p + 'session_count']}</b></span>
        <span class="ps-chipstat">On the clock: <b>${fmtDur(f[P.p + 'clock_minutes']) || '0m'}</b></span>
        <span class="ps-chipstat">Staff time: <b>${fmtDur(f[P.p + 'labor_minutes']) || '0m'}</b></span>
        ${people.length ? `<span class="ps-chipstat">Staff: <b>${esc(people.join(', '))}</b></span>` : ''}
        ${live ? `<span class="ps-chipstat" style="background:#fef3c7;color:#92400e">${live} not logged yet</span>` : ''}
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
        el.value = Math.round(v * 100) / 100;
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
