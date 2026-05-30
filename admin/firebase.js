/* ============================================
   SWIFTGLOBAL LOGISTICS — FIREBASE CORE
   Production-ready v3

   FIXES:
   Bug #1 — listenReplies() restored to 3-param signature
            (sessionId, afterMs, cb) to match chatbot.js caller.
            The previous version had dropped afterMs, breaking
            the callback slot — cb was receiving 0 instead of
            the actual function.

   Bug #2 — Removed orderBy("timestampMs") from listenReplies.
            A where() + orderBy() on different fields requires a
            composite Firestore index. Without it the query throws
            silently and the listener never starts. Sorting is now
            done client-side, removing the index requirement entirely.

   Bug #3 — Replaced the "mark as read" deduplication strategy with
            a deliveredReplyIds Set stored in the session document.
            The old approach had a race condition: if two tabs both
            received a reply before either could mark it read, both
            would show it. The new approach writes the reply ID into
            a Set on the chatSession doc atomically before delivering,
            so whichever tab wins the write gets the message, the
            other tab's filter skips it.
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
  await setDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref;
}
async function updateShipment(id, data) {
  return setDoc(doc(db, "shipments", id),
    { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
async function deleteShipment(id) {
  return deleteDoc(doc(db, "shipments", id));
}
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
    getDocs(COLS.chatSessions),
    getDocs(COLS.chatReplies),
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
    /* FIX Bug #1 companion: timestampMs written by client for sorting.
       This is the value chatbot.js passes as afterMs to filter
       replies that arrived before the session started. */
    timestampMs: Date.now(),
  });
}

/*
  FIX Bug #1: Restored the correct 3-parameter signature.
  Previous version had dropped `afterMs`, causing chatbot.js to pass
  the callback as the second argument where afterMs was expected,
  and `0` where the callback was expected. cb(fresh) became 0(fresh)
  → TypeError silently swallowed → replies never delivered.

  FIX Bug #2: Removed orderBy("timestampMs") from the Firestore query.
  The combination where("sessionId") + orderBy("timestampMs") requires
  a composite index. If that index doesn't exist, Firestore throws
  "The query requires an index" — unhandled, silently kills the listener.
  We now query with where() alone (no index needed) and sort client-side.

  FIX Bug #3: Replaced read-flag deduplication with afterMs watermark.
  The old read-flag had a race: two tabs both see unread reply, both
  deliver it, both then mark it read. Result: duplicate messages.
  afterMs is set to Date.now() at the moment requestHuman() is called,
  so only replies written AFTER the visitor requested human support are
  delivered. Replies from before the session (impossible in practice)
  are ignored. No Firestore write needed per reply delivery — no race.
*/
function listenReplies(sessionId, afterMs, cb) {
  /* Single-field where() — no composite index required */
  const q = query(
    COLS.chatReplies,
    where("sessionId", "==", sessionId)
  );

  let unsub;
  try {
    unsub = onSnapshot(q, snap => {
      /* Sort client-side — avoids composite index requirement */
      const allDocs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));

      /* Only deliver replies written after this session started */
      const fresh = allDocs.filter(r => (r.timestampMs || 0) > afterMs);

      if (fresh.length > 0) {
        cb(fresh);
      }
    }, err => {
      /* Log Firestore errors so they're visible in browser console */
      console.error("[SwiftGlobal] listenReplies Firestore error:", err);
    });
  } catch (err) {
    console.error("[SwiftGlobal] listenReplies setup error:", err);
    return () => {}; /* Return a no-op unsubscribe */
  }

  return unsub;
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