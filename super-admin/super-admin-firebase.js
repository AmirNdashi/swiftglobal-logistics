/* ============================================
   SWIFTGLOBAL LOGISTICS — SUPER ADMIN FIREBASE
   ============================================ */

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc,
  addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, onSnapshot,
  query, orderBy, where,
  serverTimestamp, increment, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ---------- CONFIG ---------- */
const firebaseConfig = {
  apiKey:            "AIzaSyA7qrtIBTrW5jroSYk9_lrRJPtrGNyluzg",
  authDomain:        "swiftglobal-logistics.firebaseapp.com",
  projectId:         "swiftglobal-logistics",
  storageBucket:     "swiftglobal-logistics.firebasestorage.app",
  messagingSenderId: "718647705041",
  appId:             "1:718647705041:web:5b4976a5944ab48515b4f0",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ---------- SUPER ADMIN EMAILS (RESTRICTED ACCESS) ---------- */
const SUPER_ADMIN_EMAILS = [
  "amiridirisu@gmail.com",
  "owner@swiftglobalogistics.com"
];

const COLS = {
  messages:     collection(db, "messages"),
  shipments:    collection(db, "shipments"),
  chatSessions: collection(db, "chatSessions"),
  chatReplies:  collection(db, "chatReplies"),
  meta:         collection(db, "meta"),
};

/* ── AUTH ───────────────────────────────── */
async function superAdminLogin(email, password, rememberMe = false) {
  // Validate email is in super admin list
  if (!SUPER_ADMIN_EMAILS.includes(email.toLowerCase())) {
    throw new Error("Access denied. This dashboard is restricted to authorized personnel only.");
  }
  
  const result = await signInWithEmailAndPassword(auth, email, password);
  
  // Set persistence based on remember me
  if (rememberMe) {
    // User will stay logged in
  } else {
    // Session only
  }
  
  return result;
}

async function superAdminLogout() { 
  return signOut(auth); 
}

function onSuperAdminAuthReady(cb) { 
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      // Verify user is authorized super admin
      if (!SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        // Unauthorized access - sign out immediately
        signOut(auth);
        cb(null);
        return;
      }
    }
    cb(user);
  });
}

function superAdminCurrentUser() { 
  return auth.currentUser; 
}

/* ── MESSAGES (WITH LEAD SCORING) ───────────────────────────── */
async function addSuperAdminMessage(data) {
  return addDoc(COLS.messages, {
    ...data,
    read:      false,
    createdAt: serverTimestamp(),
    date:      new Date().toISOString(),
  });
}

async function setSuperAdminMessageRead(id, read) {
  return updateDoc(doc(db, "messages", id), { read });
}

async function deleteSuperAdminMessage(id) {
  await deleteDoc(doc(db, "messages", id));
  await setDoc(doc(db, "meta", "stats"),
    { deletedCount: increment(1) }, { merge: true });
}

async function deleteSuperAdminMessagesBatch(ids) {
  await Promise.all(ids.map(id => deleteDoc(doc(db, "messages", id))));
  await setDoc(doc(db, "meta", "stats"),
    { deletedCount: increment(ids.length) }, { merge: true });
}

function listenSuperAdminMessages(cb) {
  const q = query(COLS.messages, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap =>
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

function listenSuperAdminDeletedCount(cb) {
  return onSnapshot(doc(db, "meta", "stats"), snap =>
    cb(snap.exists() ? (snap.data().deletedCount || 0) : 0));
}

/* ── LEAD ANALYTICS ─────────────────────────────── */
function calculateLeadStats(messages) {
  const stats = {
    hot: 0,
    warm: 0,
    cold: 0,
    low: 0,
    total: 0,
    averageScore: 0,
    totalScore: 0
  };
  
  messages.forEach(msg => {
    const score = msg.leadScore || 0;
    const quality = msg.leadQuality || 'Low';
    
    stats.total++;
    stats.totalScore += score;
    
    switch (quality.toLowerCase()) {
      case 'hot': stats.hot++; break;
      case 'warm': stats.warm++; break;
      case 'cold': stats.cold++; break;
      default: stats.low++; break;
    }
  });
  
  if (stats.total > 0) {
    stats.averageScore = Math.round(stats.totalScore / stats.total);
  }
  
  return stats;
}

function filterMessagesByLeadQuality(messages, quality) {
  if (quality === 'all') return messages;
  
  return messages.filter(msg => {
    const msgQuality = (msg.leadQuality || 'Low').toLowerCase();
    return msgQuality === quality.toLowerCase();
  });
}

function sortMessagesByScore(messages, direction = 'desc') {
  return [...messages].sort((a, b) => {
    const scoreA = a.leadScore || 0;
    const scoreB = b.leadScore || 0;
    return direction === 'desc' ? scoreB - scoreA : scoreA - scoreB;
  });
}

/* ── SHIPMENTS ──────────────────────────── */
async function addSuperAdminShipment(data) {
  const ref = doc(db, "shipments", data.id || Date.now().toString());
  await setDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref;
}

async function updateSuperAdminShipment(id, data) {
  return setDoc(doc(db, "shipments", id),
    { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

async function deleteSuperAdminShipment(id) {
  return deleteDoc(doc(db, "shipments", id));
}

function listenSuperAdminShipments(cb) {
  const q = query(COLS.shipments, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap =>
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

/* ── CHAT SESSIONS ──────────────────────────── */
function listenSuperAdminChatSessions(cb) {
  const q = query(COLS.chatSessions, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const changes = snap.docChanges();
    cb(docs, changes);
  });
}

async function updateSuperAdminChatSession(id, data) {
  return updateDoc(doc(db, "chatSessions", id), data);
}

async function addSuperAdminChatReply(sessionId, data) {
  return addDoc(COLS.chatReplies, {
    ...data,
    sessionId,
    createdAt: serverTimestamp(),
  });
}

async function deleteSuperAdminChatSession(id) {
  return deleteDoc(doc(db, "chatSessions", id));
}

async function clearAllSuperAdminSessions() {
  const snapshot = await getDocs(COLS.chatSessions);
  await Promise.all(snapshot.docs.map(doc => deleteDoc(doc.ref)));
}

/* ── EXPORT UTILITIES ──────────────────────────── */
function exportLeadsToCSV(messages) {
  if (!messages || messages.length === 0) return null;
  
  const headers = [
    'Name', 'Email', 'Phone', 'Company', 'Industry',
    'Service', 'Subject', 'Lead Score', 'Lead Quality',
    'Shipping Volume', 'Budget', 'Urgency', 'Premium Quote',
    'Date', 'Message'
  ];
  
  const rows = messages.map(msg => [
    `"${(msg.firstName || '')} ${(msg.lastName || '')}"`,
    `"${msg.email || ''}"`,
    `"${msg.phone || ''}"`,
    `"${msg.companyName || ''}"`,
    `"${msg.industry || ''}"`,
    `"${msg.service || ''}"`,
    `"${(msg.subject || '').replace(/"/g, '""')}"`,
    msg.leadScore || 0,
    msg.leadQuality || 'Low',
    `"${msg.shippingVolume || ''}"`,
    `"${msg.budget || ''}"`,
    `"${msg.urgency || ''}"`,
    msg.premiumQuote ? 'Yes' : 'No',
    `"${msg.date || ''}"`,
    `"${(msg.message || '').replace(/"/g, '""')}"`
  ]);
  
  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  return url;
}

/* ── REVENUE CALCULATIONS ──────────────────────────── */
function calculateRevenuePotential(messages) {
  let hotLeadsValue = 0;
  let warmLeadsValue = 0;
  let totalPipelineValue = 0;
  
  // Average conversion values (these can be adjusted based on your business)
  const HOT_LEAD_AVG_VALUE = 5000;  // Average value of converted hot lead
  const WARM_LEAD_AVG_VALUE = 2000; // Average value of converted warm lead
  const HOT_CONVERSION_RATE = 0.4; // 40% conversion rate for hot leads
  const WARM_CONVERSION_RATE = 0.15; // 15% conversion rate for warm leads
  
  messages.forEach(msg => {
    const quality = (msg.leadQuality || 'Low').toLowerCase();
    const budget = msg.budget || '';
    
    // Use budget data if available, otherwise use averages
    let estimatedValue = 0;
    
    if (budget) {
      const budgetMap = {
        'under-1k': 500,
        '1k-5k': 3000,
        '5k-10k': 7500,
        '10k-25k': 17500,
        '25k-50k': 37500,
        '50k+': 75000
      };
      estimatedValue = budgetMap[budget] || 2000;
    } else {
      estimatedValue = quality === 'hot' ? HOT_LEAD_AVG_VALUE : 
                      quality === 'warm' ? WARM_LEAD_AVG_VALUE : 500;
    }
    
    if (quality === 'hot') {
      hotLeadsValue += estimatedValue * HOT_CONVERSION_RATE;
    } else if (quality === 'warm') {
      warmLeadsValue += estimatedValue * WARM_CONVERSION_RATE;
    }
  });
  
  totalPipelineValue = hotLeadsValue + warmLeadsValue;
  
  return {
    hotLeadsValue: Math.round(hotLeadsValue),
    warmLeadsValue: Math.round(warmLeadsValue),
    totalPipelineValue: Math.round(totalPipelineValue)
  };
}

/* ── PREMIUM QUOTE ANALYTICS ──────────────────────────── */
function getPremiumQuoteStats(messages) {
  const premiumQuotes = messages.filter(msg => msg.premiumQuote === true);
  const totalQuotes = messages.filter(msg => msg.service && msg.service !== '');
  
  return {
    premiumCount: premiumQuotes.length,
    totalCount: totalQuotes.length,
    premiumRate: totalQuotes.length > 0 ? 
      Math.round((premiumQuotes.length / totalQuotes.length) * 100) : 0,
    premiumLeads: premiumQuotes
  };
}

/* ── EXPORTS ───────────────────────────────── */
export {
  // Auth
  superAdminLogin,
  superAdminLogout,
  onSuperAdminAuthReady,
  superAdminCurrentUser,
  
  // Messages
  addSuperAdminMessage,
  setSuperAdminMessageRead,
  deleteSuperAdminMessage,
  deleteSuperAdminMessagesBatch,
  listenSuperAdminMessages,
  listenSuperAdminDeletedCount,
  
  // Lead Analytics
  calculateLeadStats,
  filterMessagesByLeadQuality,
  sortMessagesByScore,
  
  // Shipments
  addSuperAdminShipment,
  updateSuperAdminShipment,
  deleteSuperAdminShipment,
  listenSuperAdminShipments,
  
  // Chat
  listenSuperAdminChatSessions,
  updateSuperAdminChatSession,
  addSuperAdminChatReply,
  deleteSuperAdminChatSession,
  clearAllSuperAdminSessions,
  
  // Utilities
  exportLeadsToCSV,
  calculateRevenuePotential,
  getPremiumQuoteStats
};
