/* ============================================
   SWIFTGLOBAL LOGISTICS — FIREBASE CORE
   Shared across admin panel + public pages
   ============================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  increment,
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

/* ---------- INIT ---------- */
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

/* ============================================
   AUTH HELPERS
   ============================================ */

async function adminLogin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

async function adminLogout() {
  return signOut(auth);
}

function onAuthReady(callback) {
  return onAuthStateChanged(auth, callback);
}

function currentUser() {
  return auth.currentUser;
}

/* ============================================
   MESSAGES — contact form submissions
   ============================================ */

/** Write a new contact form message */
async function addMessage(data) {
  return addDoc(COLS.messages, {
    ...data,
    read:      false,
    createdAt: serverTimestamp(),
    date:      new Date().toISOString(),
  });
}

/** Mark message read/unread */
async function setMessageRead(id, read) {
  return updateDoc(doc(db, "messages", id), { read });
}

/** Delete a single message */
async function deleteMessage(id) {
  await deleteDoc(doc(db, "messages", id));
  // Increment deleted counter
  await setDoc(doc(db, "meta", "stats"), { deletedCount: increment(1) }, { merge: true });
}

/** Batch delete messages by IDs */
async function deleteMessagesBatch(ids) {
  const ps = ids.map(id => deleteDoc(doc(db, "messages", id)));
  await Promise.all(ps);
  await setDoc(doc(db, "meta", "stats"), { deletedCount: increment(ids.length) }, { merge: true });
}

/** Real-time listener: all messages, newest first */
function listenMessages(callback) {
  const q = query(COLS.messages, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(msgs);
  });
}

/** Real-time listener: deleted count from meta */
function listenDeletedCount(callback) {
  return onSnapshot(doc(db, "meta", "stats"), snap => {
    callback(snap.exists() ? (snap.data().deletedCount || 0) : 0);
  });
}

/* ============================================
   SHIPMENTS
   ============================================ */

/** Create a new shipment */
async function addShipment(data) {
  const ref = doc(db, "shipments", data.id || Date.now().toString());
  await setDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref;
}

/** Update an existing shipment */
async function updateShipment(id, data) {
  return setDoc(doc(db, "shipments", id), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Delete a shipment */
async function deleteShipment(id) {
  return deleteDoc(doc(db, "shipments", id));
}

/** Fetch single shipment by tracking number (public tracking page) */
async function getShipmentByTracking(trackingNumber) {
  const q = query(
    COLS.shipments,
    where("trackingNumber", "==", trackingNumber.toUpperCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

/** Real-time listener: all shipments, newest first */
function listenShipments(callback) {
  const q = query(COLS.shipments, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    const ships = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(ships);
  });
}

/** Get all existing tracking numbers (for duplicate check) */
async function getAllTrackingNumbers() {
  const snap = await getDocs(COLS.shipments);
  return new Set(snap.docs.map(d => d.data().trackingNumber));
}

/* ============================================
   CHAT SESSIONS
   ============================================ */

/** Create or update a chat session */
async function saveSession(sessionId, data) {
  const ref = doc(db, "chatSessions", sessionId);
  return setDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Update specific fields on a session */
async function updateSession(sessionId, fields) {
  return updateDoc(doc(db, "chatSessions", sessionId), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

/** Delete a single chat session */
async function deleteSession(sessionId) {
  return deleteDoc(doc(db, "chatSessions", sessionId));
}

/** Delete ALL chat sessions and replies */
async function clearAllSessions() {
  const [sessSnap, repSnap] = await Promise.all([
    getDocs(COLS.chatSessions),
    getDocs(COLS.chatReplies),
  ]);
  const ps = [
    ...sessSnap.docs.map(d => deleteDoc(d.ref)),
    ...repSnap.docs.map(d => deleteDoc(d.ref)),
  ];
  return Promise.all(ps);
}

/** Real-time listener: all sessions, most recent first */
function listenSessions(callback) {
  const q = query(COLS.chatSessions, orderBy("updatedAt", "desc"));
  return onSnapshot(q, snap => {
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(sessions, snap.docChanges());
  });
}

/** Real-time listener: single session (for visitor reply polling) */
function listenSession(sessionId, callback) {
  return onSnapshot(doc(db, "chatSessions", sessionId), snap => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
  });
}

/* ============================================
   CHAT REPLIES — admin → visitor
   ============================================ */

/** Admin sends a reply */
async function addReply(sessionId, content) {
  return addDoc(COLS.chatReplies, {
    sessionId,
    content,
    timestamp:  serverTimestamp(),
    timestampMs: Date.now(),
    read:       false,
  });
}

/** Real-time listener: replies for a specific session (visitor side) */
function listenReplies(sessionId, afterMs, callback) {
  const q = query(
    COLS.chatReplies,
    where("sessionId", "==", sessionId),
    orderBy("timestampMs", "asc")
  );
  return onSnapshot(q, snap => {
    const fresh = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.timestampMs > afterMs);
    if (fresh.length > 0) callback(fresh);
  });
}

/* ============================================
   EXPORTS — everything other files need
   ============================================ */
export {
  /* auth */
  auth, db, adminLogin, adminLogout, onAuthReady, currentUser,
  /* messages */
  addMessage, setMessageRead, deleteMessage, deleteMessagesBatch, listenMessages, listenDeletedCount,
  /* shipments */
  addShipment, updateShipment, deleteShipment, getShipmentByTracking, listenShipments, getAllTrackingNumbers,
  /* sessions */
  saveSession, updateSession, deleteSession, clearAllSessions, listenSessions, listenSession,
  /* replies */
  addReply, listenReplies,
  /* firestore primitives needed by callers */
  serverTimestamp,
};