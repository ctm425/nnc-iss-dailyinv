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
  owner: { label: 'Owner', level: 100, description: 'Full access to everything across all restaurants' },
  manager: { label: 'Manager', level: 80, description: 'Full access to assigned restaurant(s)' },
  kitchen: { label: 'Kitchen Staff', level: 40, description: 'Access to kitchen & produce daily sheets' },
  boh: { label: 'Back of House', level: 40, description: 'Access to dry goods, supplies, inventory counts' },
  staff: { label: 'General Staff', level: 20, description: 'View-only access to assigned sheets' }
};

// ==================== INVENTORY SHEET DEFINITIONS ====================
const SHEET_TYPES = {
  // ---- NNC ISSAQUAH ----
  'nnc-daily-kitchen': {
    name: 'Daily Cooked Foods',
    category: 'daily',
    frequency: 'daily',
    icon: '🍛',
    description: 'All cooked food coming from Renton Main Kitchen.\nToda la comida cocinada proveniente de la cocina principal de Renton.',
    allowedRoles: ['owner', 'manager', 'kitchen'],
    page: 'daily.html',
    restaurants: ['nnc-iss']
  },
  'nnc-daily-produce': {
    name: 'Produce',
    category: 'daily',
    frequency: 'daily',
    icon: '🥬',
    description: 'Daily produce count and orders.\nConteo diario de productos y pedidos.',
    allowedRoles: ['owner', 'manager', 'kitchen'],
    page: 'daily.html',
    restaurants: ['nnc-iss']
  },
  'nnc-drygoods': {
    name: 'Dry Goods & Spices',
    category: 'inventory',
    frequency: '2x weekly',
    icon: '🌶️',
    description: 'Spices, ingredients, beverages — counted twice per week',
    allowedRoles: ['owner', 'manager', 'boh'],
    page: 'drygoods.html',
    restaurants: ['nnc-iss']
  },
  'nnc-frozen': {
    name: 'Frozen Inventory',
    category: 'inventory',
    frequency: '2x weekly',
    icon: '🧊',
    description: 'Frozen prepared items from NNC kitchen — counted twice per week',
    allowedRoles: ['owner', 'manager', 'boh'],
    page: 'drygoods.html',
    restaurants: ['nnc-iss']
  },
  'nnc-supplies': {
    name: 'Supplies',
    category: 'inventory',
    frequency: '2x weekly',
    icon: '🧴',
    description: 'To-go containers, cleaning, kitchen, office & general supplies — counted twice per week',
    allowedRoles: ['owner', 'manager', 'boh'],
    page: 'drygoods.html',
    restaurants: ['nnc-iss']
  },

  // ---- NNC ISSAQUAH VENDOR INVOICES ----
  'nnc-vendors': {
    name: 'Vendor Info / Invoices',
    category: 'operations',
    frequency: 'ongoing',
    icon: '🧾',
    description: 'Vendor invoices, receipts & images — pulled live from Google Sheets',
    allowedRoles: ['owner', 'manager', 'boh'],
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
    allowedRoles: ['owner', 'manager', 'boh'],
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
    allowedRoles: ['owner', 'manager', 'boh'],
    page: 'warehouse.html',
    restaurants: ['renton-wh']
  },
  'wh-packaging': {
    name: 'Packaging Supplies',
    category: 'inventory',
    frequency: 'weekly',
    icon: '📦',
    description: 'To-go containers, bags, foil, wrap, labels — bulk storage',
    allowedRoles: ['owner', 'manager', 'boh'],
    page: 'warehouse.html',
    restaurants: ['renton-wh']
  },
  'wh-general': {
    name: 'General Supplies',
    category: 'inventory',
    frequency: 'biweekly',
    icon: '🧹',
    description: 'Cleaning products, paper goods, safety equipment, smallwares',
    allowedRoles: ['owner', 'manager', 'boh'],
    page: 'warehouse.html',
    restaurants: ['renton-wh']
  },
  'wh-restaurant': {
    name: 'Restaurant Supplies',
    category: 'inventory',
    frequency: 'weekly',
    icon: '🍽️',
    description: 'Restaurant-specific items for distribution — spices, dry goods, oils',
    allowedRoles: ['owner', 'manager', 'boh'],
    page: 'warehouse.html',
    restaurants: ['renton-wh']
  },

  // ---- PREP DATA (cross-location) ----
  'prep-iss': {
    name: 'Issaquah Prep Log',
    category: 'prep',
    frequency: 'daily',
    icon: '🥩',
    description: 'Meat cutting & prep tracking — weight, fat, water content, wastage.\nRegistro de corte y preparación de carne — peso, grasa, contenido de agua, desperdicio.',
    allowedRoles: ['owner', 'manager', 'kitchen'],
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
    allowedRoles: ['owner', 'manager', 'kitchen'],
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
    allowedRoles: ['owner', 'manager', 'kitchen'],
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
    allowedRoles: ['owner', 'manager', 'kitchen'],
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
    allowedRoles: ['owner', 'manager', 'boh'],
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
function canAccessSheet(sheetKey, profile) {
  if (!profile) return false;
  const sheet = SHEET_TYPES[sheetKey];
  if (!sheet) return false;
  if (profile.role === 'owner') return true;
  return sheet.allowedRoles.includes(profile.role);
}

function canAccessRestaurant(restaurantKey, profile) {
  if (!profile) return false;
  if (profile.role === 'owner') return true;
  return (profile.restaurants || []).includes(restaurantKey);
}

function canManageUsers(profile) {
  if (!profile) return false;
  return profile.role === 'owner' || profile.role === 'manager';
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
  navigateTo('index.html');
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
