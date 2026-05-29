/* ============================================
   SWIFTGLOBAL LOGISTICS — FIREBASE CORE
   v2 — self-contained, no relative path issues
   Place at: admin/firebase.js
   ============================================ */

import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
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

/* ---------- COLLECTION REFS ---------- */
const COLS = {
  messages:     collection(db, "messages"),
  shipments:    collection(db, "shipments"),
  chatSessions: collection(db, "chatSessions"),
  chatReplies:  collection(db, "chatReplies"),
  meta:         collection(db, "meta"),
};

/* ── AUTH ───────────────────────────────── */
async function adminLogin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
async function adminLogout() { return signOut(auth); }
function onAuthReady(cb)     { return onAuthStateChanged(auth, cb); }
function currentUser()       { return auth.currentUser; }

/* ── MESSAGES ───────────────────────────── */
async function addMessage(data) {
  return addDoc(COLS.messages, {
    ...data,
    read:      false,
    createdAt: serverTimestamp(),
    date:      new Date().toISOString(),
  });
}
async function setMessageRead(id, read) {
  return updateDoc(doc(db, "messages", id), { read });
}
async function deleteMessage(id) {
  await deleteDoc(doc(db, "messages", id));
  await setDoc(doc(db, "meta", "stats"),
    { deletedCount: increment(1) }, { merge: true });
}
async function deleteMessagesBatch(ids) {
  await Promise.all(ids.map(id => deleteDoc(doc(db, "messages", id))));
  await setDoc(doc(db, "meta", "stats"),
    { deletedCount: increment(ids.length) }, { merge: true });
}
function listenMessages(cb) {
  const q = query(COLS.messages, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap =>
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
function listenDeletedCount(cb) {
  return onSnapshot(doc(db, "meta", "stats"), snap =>
    cb(snap.exists() ? (snap.data().deletedCount || 0) : 0));
}

/* ── SHIPMENTS ──────────────────────────── */
async function addShipment(data) {
  const ref = doc(db, "shipments", data.id || Date.now().toString());
  await setDoc(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref;
}
async function updateShipment(id, data) {
  return setDoc(doc(db, "shipments", id),
    { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
async function deleteShipment(id) { return deleteDoc(doc(db, "shipments", id)); }

async function getShipmentByTracking(trackingNumber) {
  const q    = query(COLS.shipments,
    where("trackingNumber", "==", trackingNumber.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
function listenShipments(cb) {
  const q = query(COLS.shipments, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap =>
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
async function getAllTrackingNumbers() {
  const snap = await getDocs(COLS.shipments);
  return new Set(snap.docs.map(d => d.data().trackingNumber));
}

/* ── CHAT SESSIONS ──────────────────────── */
async function saveSession(sessionId, data) {
  return setDoc(doc(db, "chatSessions", sessionId),
    { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
async function updateSession(sessionId, fields) {
  return updateDoc(doc(db, "chatSessions", sessionId),
    { ...fields, updatedAt: serverTimestamp() });
}

/**
 * Append a single message object to the session's messages array atomically.
 * Uses arrayUnion so concurrent writes don't overwrite each other.
 * NOTE: arrayUnion deduplicates by deep equality — each message has a
 * unique `id` field (Date.now()) so duplicates never occur.
 */
async function appendSessionMessage(sessionId, msgObj) {
  return updateDoc(doc(db, "chatSessions", sessionId), {
    messages:   arrayUnion(msgObj),
    updatedAt:  serverTimestamp(),
    lastActive: new Date().toISOString(),
  });
}

async function deleteSession(sessionId) {
  return deleteDoc(doc(db, "chatSessions", sessionId));
}
async function clearAllSessions() {
  const [s, r] = await Promise.all([
    getDocs(COLS.chatSessions), getDocs(COLS.chatReplies),
  ]);
  return Promise.all([...s.docs, ...r.docs].map(d => deleteDoc(d.ref)));
}
function listenSessions(cb) {
  const q = query(COLS.chatSessions, orderBy("updatedAt", "desc"));
  return onSnapshot(q, snap =>
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })), snap.docChanges()));
}
function listenSession(sessionId, cb) {
  return onSnapshot(doc(db, "chatSessions", sessionId), snap => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() });
  });
}

/* ── CHAT REPLIES ───────────────────────── */
async function addReply(sessionId, content) {
  return addDoc(COLS.chatReplies, {
    sessionId,
    content,
    timestamp:   serverTimestamp(),
    timestampMs: Date.now(),
    read:        false,
  });
}
function listenReplies(sessionId, afterMs, cb) {
  const q = query(
    COLS.chatReplies,
    where("sessionId", "==", sessionId),
    orderBy("timestampMs", "asc")
  );
  return onSnapshot(q, snap => {
    const fresh = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.timestampMs > afterMs);
    if (fresh.length) cb(fresh);
  });
}

/* ── EXPORTS ────────────────────────────── */
export {
  auth, db,
  adminLogin, adminLogout, onAuthReady, currentUser,
  addMessage, setMessageRead, deleteMessage, deleteMessagesBatch,
  listenMessages, listenDeletedCount,
  addShipment, updateShipment, deleteShipment,
  getShipmentByTracking, listenShipments, getAllTrackingNumbers,
  saveSession, updateSession, appendSessionMessage,
  deleteSession, clearAllSessions, listenSessions, listenSession,
  addReply, listenReplies,
  serverTimestamp,
};