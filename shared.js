// ==================== SHARED CONFIG & AUTH ====================
// Firebase Configuration (shared across all pages)
const firebaseConfig = {
  apiKey: "AIzaSyAvOFC9jqt-nSk26uN6CVXoDr6O-JnXz3k",
  authDomain: "nnc-inventory.firebaseapp.com",
  projectId: "nnc-inventory",
  storageBucket: "nnc-inventory.firebasestorage.app",
  messagingSenderId: "315174538558",
  appId: "1:315174538558:web:2c34c11ea6e99bfbb3706f"
};

// Initialize Firebase (only once)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ==================== LOCATIONS ====================
const RESTAURANTS = {
  'nnc-iss': {
    name: 'Naan N Curry Issaquah',
    shortName: 'Issaquah - NNC',
    color: '#1e3a5f',
    icon: '🍛',
    description: 'Full-service restaurant — daily operations, dry goods, frozen, supplies',
    status: 'active'
  },
  'renton-wh': {
    name: 'Renton Warehouse',
    shortName: 'Renton Warehouse',
    color: '#4338ca',
    icon: '🏭',
    description: 'Central distribution — frozen goods, packaging, general & restaurant supplies',
    status: 'active'
  },
  'nnc-renton': {
    name: 'Renton - NNC',
    shortName: 'Renton - NNC',
    color: '#0f766e',
    icon: '🍛',
    description: 'Coming soon — inventory system setup in progress',
    status: 'placeholder'
  },
  'ondemand-renton': {
    name: 'On Demand Renton',
    shortName: 'On Demand Renton',
    color: '#9333ea',
    icon: '⚡',
    description: 'Rapid-access buffer stock held at Renton for immediate restaurant needs',
    status: 'active'
  },
  'babas-bel': {
    name: "Baba's Bellevue",
    shortName: "Baba's Bellevue",
    color: '#7c2d12',
    icon: '🥘',
    description: 'Coming soon — new location inventory management',
    status: 'placeholder'
  }
};

// ==================== ROLES ====================
const ROLES = {
  owner: { label: 'Owner', level: 100, description: 'Full access — settings, user management, all locations' },
  manager: { label: 'Manager', level: 80, description: 'View all assigned sheets, send orders/emails, analytics — no settings or user management' },
  staff: { label: 'Staff', level: 20, description: 'View and fill in assigned sheets only' }
};

// Map legacy roles to new ones (for migration)
const LEGACY_ROLE_MAP = { kitchen: 'staff', boh: 'staff' };

// ==================== INVENTORY SHEET DEFINITIONS ====================
const SHEET_TYPES = {
  // ---- NNC ISSAQUAH ----
  'nnc-daily-kitchen': {
    name: 'Daily Cooked Foods',
    category: 'daily',
    frequency: 'daily',
    icon: '🍛',
    description: 'All cooked food coming from Renton Main Kitchen.\nToda la comida cocinada proveniente de la cocina principal de Renton.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'daily.html',
    restaurants: ['nnc-iss']
  },
  'nnc-daily-produce': {
    name: 'Produce',
    category: 'daily',
    frequency: 'daily',
    icon: '🥬',
    description: 'Daily produce count and orders.\nConteo diario de productos y pedidos.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'produce-daily.html',
    restaurants: ['nnc-iss']
  },
  'nnc-drygoods': {
    name: 'Dry Goods & Spices',
    category: 'inventory',
    frequency: '2x weekly',
    icon: '🌶️',
    description: 'Spices, ingredients, beverages — counted twice per week',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'drygoods.html',
    restaurants: ['nnc-iss']
  },
  'nnc-frozen': {
    name: 'Weekly Main Kitchen Inventory',
    category: 'inventory',
    frequency: 'weekly',
    icon: '🏭',
    description: 'Frozen prepared items & spices from NNC Main Kitchen — counted weekly',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'drygoods.html',
    restaurants: ['nnc-iss']
  },
  'nnc-supplies': {
    name: 'Supplies',
    category: 'inventory',
    frequency: '2x weekly',
    icon: '🧴',
    description: 'To-go containers, cleaning, kitchen, office & general supplies — counted twice per week',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'drygoods.html',
    restaurants: ['nnc-iss']
  },
  'nnc-allnonfrozen': {
    name: 'All Non-Frozen Inventory',
    category: 'inventory',
    frequency: '2x weekly',
    icon: '📋',
    description: 'Combined view — all supplies, dry goods & spices in one place',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'drygoods.html',
    restaurants: ['nnc-iss']
  },

  // ---- NNC ISSAQUAH WEEKLY TASKS ----
  'nnc-weekly-tasks': {
    name: 'Weekly Tasks',
    category: 'operations',
    frequency: 'daily',
    icon: '📝',
    description: 'Daily prep tasks and items to send to Renton — updated weekly',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'weekly-tasks.html',
    restaurants: ['nnc-iss']
  },

  // ---- NNC ISSAQUAH VENDOR INVOICES ----
  'nnc-vendors': {
    name: 'Vendor Info / Invoices',
    category: 'operations',
    frequency: 'ongoing',
    icon: '🧾',
    description: 'Vendor invoices, receipts & images — pulled live from Google Sheets',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'vendors.html',
    restaurants: ['nnc-iss']
  },

  // ---- NNC ISSAQUAH STORAGE UNIT ----
  'nnc-storage': {
    name: 'Issaquah Storage Unit Inventory',
    category: 'inventory',
    frequency: 'weekly',
    icon: '📦',
    description: 'Off-site storage unit — backup supplies, bulk items, overflow stock.\nUnidad de almacenamiento externa — suministros de respaldo, artículos a granel.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'storage.html',
    restaurants: ['nnc-iss']
  },

  // ---- RENTON WAREHOUSE ----
  'wh-frozen': {
    name: 'Frozen Inventory',
    category: 'inventory',
    frequency: 'weekly',
    icon: '🧊',
    description: 'Bulk frozen meats, vegetables, breads, prepared items',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'warehouse.html',
    restaurants: ['renton-wh']
  },
  'wh-packaging': {
    name: 'Packaging Supplies',
    category: 'inventory',
    frequency: 'weekly',
    icon: '📦',
    description: 'To-go containers, bags, foil, wrap, labels — bulk storage',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'warehouse.html',
    restaurants: ['renton-wh']
  },
  'wh-general': {
    name: 'General Supplies',
    category: 'inventory',
    frequency: 'biweekly',
    icon: '🧹',
    description: 'Cleaning products, paper goods, safety equipment, smallwares',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'warehouse.html',
    restaurants: ['renton-wh']
  },
  'wh-restaurant': {
    name: 'Restaurant Supplies',
    category: 'inventory',
    frequency: 'weekly',
    icon: '🍽️',
    description: 'Restaurant-specific items for distribution — spices, dry goods, oils',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'warehouse.html',
    restaurants: ['renton-wh']
  },

  // ---- NNC ISSAQUAH DAILY USAGE & PREP LOG ----
  'nnc-naan-roti-log': {
    name: 'Naan/Roti Prep & Usage',
    category: 'usage-prep',
    frequency: 'daily',
    icon: '🫓',
    description: 'Daily Naan & Roti tracking — prep (batches, trays, doughballs) and usage (AM/PM counts, waste).\nRegistro diario de preparación y uso de Naan y Roti.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'naan-roti-log.html',
    restaurants: ['nnc-iss']
  },
  'nnc-rice-usage': {
    name: 'Rice Usage Log',
    category: 'usage-prep',
    frequency: 'daily',
    icon: '🍚',
    description: 'Daily rice tracking — made, leftover, usage, waste.\nRegistro diario de arroz — producción, sobrante, uso, desperdicio.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'rice-usage-log.html',
    restaurants: ['nnc-iss']
  },
  'nnc-chicken-prep': {
    name: 'Raw Chicken Processing',
    category: 'usage-prep',
    frequency: 'daily',
    icon: '🍗',
    description: 'Daily raw chicken processing — cases, bags, weight, fat, water content.\nProcesamiento diario de pollo crudo — cajas, bolsas, peso, grasa, contenido de agua.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'chicken-prep-log.html',
    restaurants: ['nnc-iss']
  },
  'nnc-tikka-prep': {
    name: 'Tikka (CTM) Processing',
    category: 'usage-prep',
    frequency: 'daily',
    icon: '🍢',
    description: 'Tikka processing — raw, cooked, and cutting stages with dark/white meat tracking.\nProcesamiento de Tikka — etapas crudo, cocido y corte con seguimiento de carne oscura/blanca.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'tikka-prep-log.html',
    restaurants: ['nnc-iss']
  },
  'nnc-produce-prep': {
    name: 'Produce Prep',
    category: 'usage-prep',
    frequency: 'daily',
    icon: '🧅',
    description: 'Daily produce prep — onion, potato, paneer processing.\nPreparación diaria de productos — procesamiento de cebolla, papa, paneer.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'produce-prep-log.html',
    restaurants: ['nnc-iss']
  },
  'nnc-packing-log': {
    name: 'Packing Log',
    category: 'usage-prep',
    frequency: 'daily',
    icon: '📦',
    description: 'Daily packing — Haleem, Keema, Seekh Kabab, Karela, Nehari Sauce.\nEmpaque diario — Haleem, Keema, Seekh Kabab, Karela, Salsa Nehari.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: 'packing-log.html',
    restaurants: ['nnc-iss']
  },

  // ---- NNC ISSAQUAH DAILY REPORT ----
  'nnc-daily-report': {
    name: 'Daily Kitchen Report',
    category: 'reports',
    frequency: 'daily',
    icon: '📊',
    description: 'Owner daily recap — kitchen, produce, prep logs, usage & exceptions summary',
    allowedRoles: ['owner'],
    page: 'daily-report.html',
    restaurants: ['nnc-iss']
  },

  // ---- PREP DATA (cross-location) ----
  'prep-iss': {
    name: 'Issaquah Prep Log',
    category: 'prep',
    frequency: 'daily',
    icon: '🥩',
    description: 'Meat cutting & prep tracking — weight, fat, water content, wastage.\nRegistro de corte y preparación de carne — peso, grasa, contenido de agua, desperdicio.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: null,
    restaurants: ['nnc-iss'],
    comingSoon: true
  },
  'prep-renton': {
    name: 'Renton Prep Log',
    category: 'prep',
    frequency: 'daily',
    icon: '🥩',
    description: 'Meat cutting & prep tracking — weight, fat, water content, wastage.\nRegistro de corte y preparación de carne — peso, grasa, contenido de agua, desperdicio.',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: null,
    restaurants: ['nnc-renton'],
    comingSoon: true
  },

  // ---- BABA'S BELLEVUE (placeholders) ----
  'babas-daily-kitchen': {
    name: 'Main Kitchen',
    category: 'daily',
    frequency: 'daily',
    icon: '🥘',
    description: 'Daily perishable items — coming soon',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: null,
    restaurants: ['babas-bel'],
    comingSoon: true
  },
  'babas-daily-produce': {
    name: 'Produce',
    category: 'daily',
    frequency: 'daily',
    icon: '🥬',
    description: 'Daily produce items — coming soon',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: null,
    restaurants: ['babas-bel'],
    comingSoon: true
  },
  'babas-drygoods': {
    name: 'Dry Goods & Spices',
    category: 'inventory',
    frequency: 'weekly',
    icon: '🌶️',
    description: 'Spices, grains, canned goods — coming soon',
    allowedRoles: ['owner', 'manager', 'staff'],
    page: null,
    restaurants: ['babas-bel'],
    comingSoon: true
  }
};

// ==================== USER PROFILE MANAGEMENT ====================
const OWNER_EMAILS = ['shan.janjua@gmail.com', 'shan@naanncurry.net'];
let currentUserProfile = null;

async function loadUserProfile() {
  if (!auth.currentUser) return null;
  try {
    const doc = await db.collection('users').doc(auth.currentUser.uid).get();
    if (doc.exists) {
      currentUserProfile = doc.data();
      // Auto-upgrade owner emails if role was set incorrectly
      if (OWNER_EMAILS.includes(auth.currentUser.email.toLowerCase()) && currentUserProfile.role !== 'owner') {
        currentUserProfile.role = 'owner';
        currentUserProfile.restaurants = Object.keys(RESTAURANTS);
        await db.collection('users').doc(auth.currentUser.uid).update({
          role: 'owner',
          restaurants: Object.keys(RESTAURANTS)
        });
      }
      // Migrate legacy roles (kitchen, boh) to new system
      if (LEGACY_ROLE_MAP[currentUserProfile.role]) {
        const newRole = LEGACY_ROLE_MAP[currentUserProfile.role];
        currentUserProfile.role = newRole;
        await db.collection('users').doc(auth.currentUser.uid).update({ role: newRole });
      }
      await loadRolePermissions();
      return currentUserProfile;
    }
    // First-time user — create default profile
    // Owner emails get full access automatically
    const isOwner = OWNER_EMAILS.includes(auth.currentUser.email.toLowerCase());
    const defaultProfile = {
      email: auth.currentUser.email,
      displayName: auth.currentUser.email.split('@')[0],
      role: isOwner ? 'owner' : 'staff',
      restaurants: isOwner ? Object.keys(RESTAURANTS) : ['nnc-iss'],
      createdAt: new Date(),
      lastLogin: new Date()
    };
    await db.collection('users').doc(auth.currentUser.uid).set(defaultProfile);
    currentUserProfile = defaultProfile;
    await loadRolePermissions();
    return currentUserProfile;
  } catch (err) {
    console.error('Error loading user profile:', err);
    return null;
  }
}

async function updateUserProfile(updates) {
  if (!auth.currentUser) return;
  try {
    await db.collection('users').doc(auth.currentUser.uid).update(updates);
    Object.assign(currentUserProfile, updates);
  } catch (err) { console.error('Error updating profile:', err); }
}

async function getAllUsers() {
  try {
    const snap = await db.collection('users').get();
    const users = [];
    snap.forEach(doc => { users.push({ uid: doc.id, ...doc.data() }); });
    return users;
  } catch (err) { console.error('Error loading users:', err); return []; }
}

async function setUserRole(uid, role, restaurants) {
  try {
    await db.collection('users').doc(uid).update({ role, restaurants });
  } catch (err) { console.error('Error setting user role:', err); }
}

// ==================== ACCESS CONTROL ====================
let rolePermissions = null; // loaded from Firestore, falls back to hardcoded allowedRoles

async function loadRolePermissions() {
  try {
    const doc = await db.collection('config').doc('role-permissions').get();
    if (doc.exists) {
      rolePermissions = doc.data();
      // Migrate legacy role keys: merge kitchen/boh permissions into staff
      let migrated = false;
      Object.keys(LEGACY_ROLE_MAP).forEach(oldRole => {
        if (rolePermissions[oldRole]) {
          const newRole = LEGACY_ROLE_MAP[oldRole];
          if (!rolePermissions[newRole]) rolePermissions[newRole] = [];
          rolePermissions[oldRole].forEach(sk => {
            if (!rolePermissions[newRole].includes(sk)) rolePermissions[newRole].push(sk);
          });
          delete rolePermissions[oldRole];
          migrated = true;
        }
      });
      // Remove any role keys that no longer exist
      Object.keys(rolePermissions).forEach(r => {
        if (!ROLES[r] && r !== '_migrated') { delete rolePermissions[r]; migrated = true; }
      });
      if (migrated) await db.collection('config').doc('role-permissions').set(rolePermissions);
    } else {
      // First time: build from hardcoded defaults and save to Firestore
      rolePermissions = {};
      Object.keys(ROLES).forEach(role => {
        if (role === 'owner') return; // owner always has full access
        rolePermissions[role] = [];
        Object.keys(SHEET_TYPES).forEach(sk => {
          if (SHEET_TYPES[sk].allowedRoles && SHEET_TYPES[sk].allowedRoles.includes(role)) {
            rolePermissions[role].push(sk);
          }
        });
      });
      await db.collection('config').doc('role-permissions').set(rolePermissions);
    }
  } catch (err) {
    console.error('Error loading role permissions:', err);
    rolePermissions = null;
  }
}

async function saveRolePermissions() {
  if (!rolePermissions) return;
  try {
    await db.collection('config').doc('role-permissions').set(rolePermissions);
  } catch (err) { console.error('Error saving role permissions:', err); }
}

function canAccessSheet(sheetKey, profile) {
  if (!profile) return false;
  const sheet = SHEET_TYPES[sheetKey];
  if (!sheet) return false;
  if (profile.role === 'owner') return true;
  // Use dynamic permissions if loaded, otherwise fall back to hardcoded
  if (rolePermissions && rolePermissions[profile.role]) {
    return rolePermissions[profile.role].includes(sheetKey);
  }
  return sheet.allowedRoles.includes(profile.role);
}

function canAccessRestaurant(restaurantKey, profile) {
  if (!profile) return false;
  if (profile.role === 'owner') return true;
  return (profile.restaurants || []).includes(restaurantKey);
}

function canManageUsers(profile) {
  if (!profile) return false;
  return profile.role === 'owner';
}

// ==================== NAVIGATION ====================
function navigateTo(page, params) {
  const url = new URL(page, window.location.href);
  if (params) {
    Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  }
  window.location.href = url.toString();
}

function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function goToDashboard() {
  navigateTo('index.html?open=nnc-iss');
}

// ==================== SHARED UI HELPERS ====================
function showToastShared(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 24px;border-radius:8px;font-size:.9rem;z-index:1000;opacity:0;transition:opacity .3s;pointer-events:none';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

// ==================== 2-DECIMAL DISPLAY FORMATTER ====================
// Formats a numeric value for display with exactly 2 decimal places.
// Does NOT mutate storage; use on read only. Returns '' for null/undefined/''
// so empty inputs stay empty in the UI.
function fmt2(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!isFinite(n)) return '';
  return n.toFixed(2);
}

// ==================== HISTORICAL-EDIT REQUEST POPUP ====================
// Shared modal + submitter used by daily.html, produce-daily.html,
// naan-roti-log.html, rice-usage-log.html (and any page added later).
// A click on a locked historical field opens this popup, which offers to
// submit a pending edit-request doc. Owner sees an alert badge on index.html.
let _editReqModalBuilt = false;
function _buildEditReqModal() {
  if (_editReqModalBuilt) return;
  _editReqModalBuilt = true;
  const wrap = document.createElement('div');
  wrap.id = 'editReqModal';
  wrap.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;align-items:center;justify-content:center;padding:16px;font-family:inherit';
  wrap.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:480px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
      <div style="font-size:1.15rem;font-weight:800;color:#1e3a5f;margin-bottom:8px">\uD83D\uDD12 Historical Data Locked</div>
      <div id="editReqContext" style="font-size:.85rem;color:#64748b;margin-bottom:14px"></div>
      <div style="font-size:.92rem;color:#334155;margin-bottom:12px">This entry is from a past day and cannot be edited directly. Do you need to request an adjustment from the owner?</div>
      <label style="display:block;font-size:.8rem;font-weight:700;color:#475569;margin-bottom:4px">Which field?</label>
      <input id="editReqField" type="text" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:.9rem;margin-bottom:10px" placeholder="e.g. Chicken PM count">
      <label style="display:block;font-size:.8rem;font-weight:700;color:#475569;margin-bottom:4px">Correct value</label>
      <input id="editReqValue" type="text" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:.9rem;margin-bottom:10px" placeholder="What should it be?">
      <label style="display:block;font-size:.8rem;font-weight:700;color:#475569;margin-bottom:4px">Reason / notes</label>
      <textarea id="editReqNotes" rows="3" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:.9rem;margin-bottom:14px;resize:vertical" placeholder="Why does this need to change?"></textarea>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="editReqCancel" type="button" style="padding:9px 18px;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:6px;font-weight:700;cursor:pointer">Cancel</button>
        <button id="editReqSubmit" type="button" style="padding:9px 18px;border:none;background:#4338ca;color:#fff;border-radius:6px;font-weight:700;cursor:pointer">Submit Request</button>
      </div>
      <div id="editReqMsg" style="margin-top:10px;font-size:.85rem;color:#475569"></div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', function(e) { if (e.target === wrap) wrap.style.display = 'none'; });
  document.getElementById('editReqCancel').onclick = function() { wrap.style.display = 'none'; };
  document.getElementById('editReqSubmit').onclick = async function() {
    const msg = document.getElementById('editReqMsg');
    const field = document.getElementById('editReqField').value.trim();
    const val = document.getElementById('editReqValue').value.trim();
    const notes = document.getElementById('editReqNotes').value.trim();
    if (!field) { msg.textContent = 'Please name the field.'; msg.style.color = '#b91c1c'; return; }
    if (!auth.currentUser) { msg.textContent = 'Not signed in.'; msg.style.color = '#b91c1c'; return; }
    const ctx = wrap._ctx || {};
    try {
      await db.collection('edit-requests').add({
        page: ctx.page || document.title,
        date: ctx.date || '',
        item: field,
        correctValue: val,
        notes: notes,
        status: 'pending',
        submittedBy: auth.currentUser.email,
        submittedByUid: auth.currentUser.uid,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: ''
      });
      msg.textContent = 'Request submitted. The owner has been notified.';
      msg.style.color = '#059669';
      setTimeout(function() { wrap.style.display = 'none'; }, 1200);
    } catch (e) {
      console.error('edit-request submit failed', e);
      msg.textContent = 'Submit failed: ' + (e.message || e);
      msg.style.color = '#b91c1c';
    }
  };
}
function openHistoricalEditRequest(opts) {
  _buildEditReqModal();
  const wrap = document.getElementById('editReqModal');
  wrap._ctx = opts || {};
  document.getElementById('editReqContext').textContent =
    (opts && opts.page ? opts.page : document.title) +
    (opts && opts.date ? ' — ' + opts.date : '');
  document.getElementById('editReqField').value = (opts && opts.field) || '';
  document.getElementById('editReqValue').value = '';
  document.getElementById('editReqNotes').value = '';
  document.getElementById('editReqMsg').textContent = '';
  wrap.style.display = 'flex';
}

// Attach a one-shot click handler inside a container that opens the
// edit-request popup when a disabled/readonly input is touched on a
// historical day. Call from each page's render/applyEditMode path.
function wireHistoricalEditPrompt(container, getCtx) {
  if (!container || container._histWired) return;
  container._histWired = true;
  container.addEventListener('click', function(e) {
    const t = e.target;
    if (!t) return;
    const tag = (t.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
    const ctx = (typeof getCtx === 'function') ? (getCtx() || {}) : {};
    if (!ctx.historical) return;
    if (ctx.isOwner) return; // owner can edit directly
    e.preventDefault();
    openHistoricalEditRequest({
      page: ctx.page || document.title,
      date: ctx.date || '',
      field: t.getAttribute('data-field') || t.id || t.name || ''
    });
  }, true);
}

// Live count of pending edit-requests — used to render an owner alert badge.
// Calls cb(count) on every Firestore update; returns an unsubscribe fn.
function watchPendingEditRequests(cb) {
  if (!db || !auth.currentUser) return function(){};
  try {
    return db.collection('edit-requests').where('status','==','pending')
      .onSnapshot(function(snap){ cb(snap.size); }, function(err){
        console.error('pending edit-requests watch failed', err);
      });
  } catch (e) {
    console.error('watchPendingEditRequests failed', e);
    return function(){};
  }
}
