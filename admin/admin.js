/* ============================================
   SWIFTGLOBAL LOGISTICS — ADMIN PANEL JS
   Full Firebase Firestore + Auth Integration
   Real-time listeners replace all localStorage
   ============================================ */

import {
  adminLogout, onAuthReady,
  listenMessages, listenDeletedCount,
  setMessageRead, deleteMessage, deleteMessagesBatch,
  listenSessions, updateSession, deleteSession, clearAllSessions,
  addReply,
} from "./firebase.js";

/* ---------- STATE ---------- */
let allMessages      = [];
let allSessions      = [];
let deletedCount     = 0;
let currentMsgId     = null;
let currentSessionId = null;
let confirmCallback  = null;
let notifySound      = null;
let prevSessionIds   = new Set();   // track known sessions for new-arrival detection

/* ---------- UNSUBSCRIBE HANDLES ---------- */
let unsubMessages = null;
let unsubDeleted  = null;
let unsubSessions = null;

/* ============================================
   BOOT — wait for Firebase Auth before anything
   ============================================ */
onAuthReady(user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  initAdmin();
});

/* ============================================
   INIT
   ============================================ */
function initAdmin() {
  startClock();
  initNotificationSound();
  attachSidebarEvents();
  attachModalEvents();

  /* Start all real-time listeners */
  unsubMessages = listenMessages(msgs => {
    allMessages = msgs;
    updateStats();
    renderRecentMessages();
    renderMessages();
    renderQuotes();
  });

  unsubDeleted = listenDeletedCount(count => {
    deletedCount = count;
    updateStats();
  });

  unsubSessions = listenSessions((sessions, changes) => {
    /* Detect brand-new sessions for notification */
    changes.forEach(change => {
      if (change.type === "added") {
        const s = { id: change.doc.id, ...change.doc.data() };
        if (prevSessionIds.size > 0 && !prevSessionIds.has(s.id) && s.isHuman) {
          playNotificationSound();
          showNotifyToast(`New chat from ${s.visitorName || "a visitor"}!`);
        }
        prevSessionIds.add(s.id);
      }
    });
    /* First load: populate prevSessionIds without notifying */
    sessions.forEach(s => prevSessionIds.add(s.id));

    allSessions = sessions;
    updateChatBadge();
    renderChatSessions();
    refreshActiveConvo();
  });
}

/* ============================================
   SIDEBAR & LAYOUT
   ============================================ */
function attachSidebarEvents() {
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    const sidebar = document.getElementById("adminSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (window.innerWidth <= 767) {
      const isOpen = sidebar.classList.toggle("open");
      overlay.style.display = isOpen ? "block" : "none";
    } else {
      sidebar.classList.toggle("collapsed");
      document.querySelector(".admin-main").classList.toggle("expanded");
    }
  });

  const sidebarClose = document.getElementById("sidebarClose");
  if (sidebarClose) {
    sidebarClose.addEventListener("click", closeSidebar);
  }

  document.getElementById("sidebarOverlay")?.addEventListener("click", closeSidebar);

  document.addEventListener("click", e => {
    const sidebar = document.getElementById("adminSidebar");
    const toggle  = document.getElementById("sidebarToggle");
    if (
      window.innerWidth <= 767 &&
      sidebar.classList.contains("open") &&
      !sidebar.contains(e.target) &&
      !toggle.contains(e.target)
    ) closeSidebar();
  });

  document.querySelectorAll(".sidebar-link[data-section]").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      if (window.innerWidth <= 767) closeSidebar();
      switchSection(link.getAttribute("data-section"));
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    /* Clean up listeners before logging out */
    unsubMessages?.();
    unsubDeleted?.();
    unsubSessions?.();
    await adminLogout();
    window.location.href = "index.html";
  });
}

function closeSidebar() {
  document.getElementById("adminSidebar").classList.remove("open");
  const overlay = document.getElementById("sidebarOverlay");
  if (overlay) overlay.style.display = "none";
}

function attachModalEvents() {
  document.getElementById("modalOverlay")?.addEventListener("click", e => {
    if (e.target === document.getElementById("modalOverlay")) closeModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeModal(); closeConfirm(); }
  });
}

/* ============================================
   CLOCK
   ============================================ */
function startClock() {
  const el = document.getElementById("adminClock");
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  };
  tick();
  setInterval(tick, 1000);
}

/* ============================================
   NOTIFICATION SOUND
   ============================================ */
function initNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) notifySound = new AudioCtx();
  } catch (e) {}
}

function playNotificationSound() {
  try {
    if (!notifySound) return;
    const osc  = notifySound.createOscillator();
    const gain = notifySound.createGain();
    osc.connect(gain);
    gain.connect(notifySound.destination);
    osc.frequency.setValueAtTime(800, notifySound.currentTime);
    osc.frequency.setValueAtTime(600, notifySound.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, notifySound.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, notifySound.currentTime + 0.4);
    osc.start(notifySound.currentTime);
    osc.stop(notifySound.currentTime + 0.4);
  } catch (e) {}
}

function showNotifyToast(msg) {
  document.querySelector(".chat-notify-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "chat-notify-toast";
  toast.innerHTML = `<i class="fa fa-comment-dots"></i> ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity   = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.4s ease";
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/* ============================================
   SECTION SWITCHING
   ============================================ */
function switchSection(name) {
  document.querySelectorAll(".admin-section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".sidebar-link[data-section]").forEach(l => l.classList.remove("active"));
  document.getElementById(`section-${name}`)?.classList.add("active");
  document.querySelector(`.sidebar-link[data-section="${name}"]`)?.classList.add("active");
  document.getElementById("pageTitle").textContent =
    name === "livechats" ? "Live Chats" : name.charAt(0).toUpperCase() + name.slice(1);

  if (name === "shipments") renderShipments?.();
}

/* Make switchSection globally available (called from dashboard buttons) */
window.switchSection = switchSection;

/* ============================================
   STATS
   ============================================ */
function updateStats() {
  const total  = allMessages.length;
  const unread = allMessages.filter(m => !m.read).length;
  const quotes = allMessages.filter(m => m.service && m.service !== "" && m.service !== "other").length;

  document.getElementById("statTotal").textContent   = total;
  document.getElementById("statUnread").textContent  = unread;
  document.getElementById("statQuotes").textContent  = quotes;
  document.getElementById("statDeleted").textContent = deletedCount;

  const unreadBadge = document.getElementById("unreadBadge");
  const quoteBadge  = document.getElementById("quoteBadge");
  if (unreadBadge) unreadBadge.textContent = unread > 0 ? unread : "";
  if (quoteBadge)  quoteBadge.textContent  = quotes > 0 ? quotes : "";
}

function updateChatBadge() {
  const waiting = allSessions.filter(s => s.isHuman && s.status === "waiting").length;
  const badge   = document.getElementById("chatBadge");
  if (badge) badge.textContent = waiting > 0 ? waiting : "";
}

/* ============================================
   FORMAT HELPERS
   ============================================ */
function formatDate(iso) {
  if (!iso) return "—";
  /* Handle Firestore Timestamps */
  const d = iso?.toDate ? iso.toDate() : new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatTimeAgo(iso) {
  if (!iso) return "";
  const d    = iso?.toDate ? iso.toDate() : new Date(iso);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInitials(first, last) {
  return ((first?.[0] || "") + (last?.[0] || "")).toUpperCase() || "??";
}

function serviceLabel(val) {
  const map = {
    sea: "Sea Freight", air: "Air Freight", land: "Land Freight",
    customs: "Customs", warehousing: "Warehousing", project: "Project Cargo",
    tracking: "Tracking", other: "Other",
  };
  return map[val] || val || "General";
}

/* ============================================
   MESSAGE ROW
   ============================================ */
function buildMessageRow(msg) {
  const initials = getInitials(msg.firstName, msg.lastName);
  const name     = `${msg.firstName || ""} ${msg.lastName || ""}`.trim();
  const svc      = msg.service
    ? `<span class="msg-service-tag">${serviceLabel(msg.service)}</span>` : "";
  const unreadDot = !msg.read ? `<div class="unread-dot"></div>` : "";
  const readIcon  = msg.read ? "fa-envelope" : "fa-envelope-open";
  const readTip   = msg.read ? "Mark as Unread" : "Mark as Read";

  return `
    <div class="message-row ${msg.read ? "" : "unread"}" id="row-${msg.id}"
         onclick="openModal('${msg.id}')">
      ${unreadDot}
      <div class="msg-avatar">${initials}</div>
      <div class="msg-body">
        <div class="msg-top">
          <span class="msg-name">${escHtml(name)}</span>${svc}
        </div>
        <div class="msg-subject">${escHtml(msg.subject || "")}</div>
        <div class="msg-preview">${escHtml((msg.message || "").substring(0, 80))}${(msg.message || "").length > 80 ? "…" : ""}</div>
      </div>
      <div class="msg-actions">
        <span class="msg-date">${formatDate(msg.createdAt || msg.date)}</span>
        <div class="msg-action-btns">
          <button class="msg-btn read" title="${readTip}"
            onclick="event.stopPropagation();toggleRead('${msg.id}')">
            <i class="fa ${readIcon}"></i>
          </button>
          <button class="msg-btn delete" title="Delete"
            onclick="event.stopPropagation();confirmDeleteMsg('${msg.id}')">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>
    </div>`;
}

/* ============================================
   RENDER MESSAGES / QUOTES
   ============================================ */
function renderMessages() {
  const container = document.getElementById("messagesList");
  if (!container) return;

  const search = (document.getElementById("messageSearch")?.value || "").toLowerCase();
  const filter = document.getElementById("messageFilter")?.value || "all";

  let list = [...allMessages];
  if (filter === "unread") list = list.filter(m => !m.read);
  if (filter === "read")   list = list.filter(m =>  m.read);
  if (search) list = list.filter(m =>
    `${m.firstName} ${m.lastName} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(search)
  );

  container.innerHTML = list.length === 0
    ? `<div class="admin-empty"><i class="fa fa-inbox"></i><p>No messages found.</p></div>`
    : list.map(buildMessageRow).join("");
}

function renderQuotes() {
  const container = document.getElementById("quotesList");
  if (!container) return;

  const search    = (document.getElementById("quoteSearch")?.value || "").toLowerCase();
  const svcFilter = document.getElementById("quoteServiceFilter")?.value || "all";

  let list = allMessages.filter(m => m.service && m.service !== "");
  if (svcFilter !== "all") list = list.filter(m => m.service === svcFilter);
  if (search) list = list.filter(m =>
    `${m.firstName} ${m.lastName} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(search)
  );

  container.innerHTML = list.length === 0
    ? `<div class="admin-empty"><i class="fa fa-file-invoice-dollar"></i><p>No quote requests found.</p></div>`
    : list.map(buildMessageRow).join("");
}

function renderRecentMessages() {
  const container = document.getElementById("recentMessages");
  if (!container) return;
  const recent = allMessages.slice(0, 5);
  container.innerHTML = recent.length === 0
    ? `<div class="admin-empty"><i class="fa fa-inbox"></i><p>No messages yet.</p></div>`
    : recent.map(buildMessageRow).join("");
}

/* Expose filter functions called by inline oninput/onchange */
window.filterMessages = () => renderMessages();
window.filterQuotes   = () => renderQuotes();

/* ============================================
   TOGGLE READ
   ============================================ */
async function toggleRead(id) {
  const msg = allMessages.find(m => m.id === id);
  if (!msg) return;
  await setMessageRead(id, !msg.read);
  /* listenMessages will re-render automatically */
}
window.toggleRead = toggleRead;

/* ============================================
   DELETE MESSAGES
   ============================================ */
async function doDeleteMessage(id) {
  await deleteMessage(id);
  closeModal();
}

window.deleteAllMessages = () => {
  showConfirm("Delete ALL messages? This cannot be undone.", async () => {
    const ids = allMessages.map(m => m.id);
    await deleteMessagesBatch(ids);
  });
};

window.deleteAllQuotes = () => {
  showConfirm("Delete all quote requests?", async () => {
    const ids = allMessages.filter(m => m.service && m.service !== "").map(m => m.id);
    await deleteMessagesBatch(ids);
  });
};

/* ============================================
   CONFIRM DIALOG
   ============================================ */
function showConfirm(msg, cb) {
  confirmCallback = cb;
  document.getElementById("confirmMsg").textContent = msg;
  document.getElementById("confirmOverlay").style.display = "flex";
  document.getElementById("confirmYes").onclick = () => {
    confirmCallback?.();
    closeConfirm();
  };
}
function closeConfirm() {
  document.getElementById("confirmOverlay").style.display = "none";
  confirmCallback = null;
}
window.closeConfirm = closeConfirm;

function confirmDeleteMsg(id) {
  showConfirm("Delete this message?", () => doDeleteMessage(id));
}
window.confirmDelete = confirmDeleteMsg;

/* ============================================
   MESSAGE MODAL
   ============================================ */
function openModal(id) {
  const msg = allMessages.find(m => m.id === id);
  if (!msg) return;
  currentMsgId = id;

  /* Auto-mark as read when opened */
  if (!msg.read) setMessageRead(id, true);

  document.getElementById("modalTitle").textContent =
    `${msg.firstName || ""} ${msg.lastName || ""} — ${msg.subject || ""}`;
  document.getElementById("modalReadIcon").className   = "fa fa-envelope";
  document.getElementById("modalReadText").textContent = "Mark as Unread";

  document.getElementById("modalBody").innerHTML = `
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-user"></i> Name</span>
      <span class="modal-detail-value">${escHtml(msg.firstName)} ${escHtml(msg.lastName)}</span>
    </div>
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-envelope"></i> Email</span>
      <span class="modal-detail-value">
        <a href="mailto:${escHtml(msg.email)}" style="color:#E8A317;">${escHtml(msg.email)}</a>
      </span>
    </div>
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-phone"></i> Phone</span>
      <span class="modal-detail-value">${escHtml(msg.phone || "—")}</span>
    </div>
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-tag"></i> Service</span>
      <span class="modal-detail-value">${serviceLabel(msg.service)}</span>
    </div>
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-heading"></i> Subject</span>
      <span class="modal-detail-value">${escHtml(msg.subject || "")}</span>
    </div>
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-calendar"></i> Received</span>
      <span class="modal-detail-value">${formatDate(msg.createdAt || msg.date)}</span>
    </div>
    <div class="modal-detail-row" style="flex-direction:column;">
      <span class="modal-detail-label" style="margin-bottom:8px;">
        <i class="fa fa-message"></i> Message
      </span>
      <div class="modal-message-box">${escHtml(msg.message || "")}</div>
    </div>`;

  document.getElementById("modalOverlay").style.display = "flex";
}

function closeModal() {
  document.getElementById("modalOverlay").style.display = "none";
  currentMsgId = null;
}

function toggleReadModal() {
  if (!currentMsgId) return;
  const msg = allMessages.find(m => m.id === currentMsgId);
  if (msg) setMessageRead(currentMsgId, !msg.read);
  closeModal();
}

function deleteFromModal() {
  if (!currentMsgId) return;
  confirmDeleteMsg(currentMsgId);
}

window.openModal       = openModal;
window.closeModal      = closeModal;
window.toggleReadModal = toggleReadModal;
window.deleteFromModal = deleteFromModal;

/* ============================================
   CHAT SESSIONS — RENDER LIST
   ============================================ */
function renderChatSessions() {
  const container = document.getElementById("chatSessionsList");
  if (!container) return;

  const search  = (document.getElementById("chatSearch")?.value || "").toLowerCase();
  const statusF = document.getElementById("chatStatusFilter")?.value || "all";

  let list = [...allSessions];
  if (statusF === "waiting") list = list.filter(s => s.isHuman && s.status === "waiting");
  if (statusF === "active")  list = list.filter(s => s.isHuman && s.status === "active");
  if (statusF === "ai")      list = list.filter(s => !s.isHuman);

  if (search) {
    list = list.filter(s =>
      (s.visitorName || "").toLowerCase().includes(search) ||
      (s.page || "").toLowerCase().includes(search)
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="admin-empty" style="padding:40px 20px;">
        <i class="fa fa-comments"></i>
        <p>No chat sessions found.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(s => {
    const lastMsg   = s.messages?.[s.messages.length - 1];
    const preview   = lastMsg?.content?.substring(0, 50) || "No messages yet";
    const timeAgo   = formatTimeAgo(s.updatedAt || s.startTime);
    const unreadBadge = (s.unread || 0) > 0
      ? `<div class="chat-session-unread">${s.unread}</div>` : "";
    const statusCls = s.isHuman
      ? (s.status === "waiting" ? "status-waiting" : "status-active") : "status-ai";
    const statusTxt = s.isHuman
      ? (s.status === "waiting" ? "● Waiting" : "● Active") : "● AI Chat";
    const isActive  = s.id === currentSessionId ? "active" : "";
    const hasUnread = (s.unread || 0) > 0 ? "has-unread" : "";

    return `
      <div class="chat-session-item ${isActive} ${hasUnread}"
           onclick="openChatSession('${s.id}')">
        ${unreadBadge}
        <div class="chat-session-top">
          <span class="chat-session-name">
            <i class="fa fa-user" style="font-size:0.75rem;"></i>
            ${escHtml(s.visitorName || "Visitor")}
          </span>
          <span class="chat-session-time">${timeAgo}</span>
        </div>
        <div class="chat-session-preview">${escHtml(preview)}</div>
        <div style="margin-top:6px;">
          <span class="chat-session-status ${statusCls}">${statusTxt}</span>
        </div>
      </div>`;
  }).join("");
}

/* ============================================
   OPEN CHAT SESSION
   ============================================ */
function openChatSession(sessionId) {
  currentSessionId = sessionId;
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  /* Mark unread → 0 and status active */
  updateSession(sessionId, { unread: 0, status: session.isHuman ? "active" : session.status });

  const panel    = document.getElementById("chatConvoPanel");
  const initials = (session.visitorName || "V").charAt(0).toUpperCase();

  panel.innerHTML = `
    <div class="chat-convo-header">
      <div class="chat-convo-header-info">
        <div class="chat-convo-avatar">${initials}</div>
        <div>
          <div class="chat-convo-name">${escHtml(session.visitorName || "Visitor")}</div>
          <div class="chat-convo-meta">
            ${escHtml(session.page || "website")} &nbsp;·&nbsp;
            Started ${formatDate(session.startTime)}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <span class="chat-session-status ${session.isHuman ? "status-active" : "status-ai"}">
          ${session.isHuman ? "● Human Chat" : "● AI Chat"}
        </span>
        <button class="admin-btn admin-btn-danger admin-btn-sm"
          onclick="doDeleteChatSession('${sessionId}')">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    </div>

    <div class="chat-convo-messages" id="convoMessages">
      ${renderConvoMessages(session.messages || [])}
    </div>

    <div class="visitor-typing" id="visitorTypingIndicator" style="display:none;padding:0 16px 4px;">
      <i class="fa fa-ellipsis fa-beat"></i> Visitor is typing...
    </div>

    ${session.isHuman ? `
    <div class="chat-convo-reply">
      <textarea class="chat-convo-input" id="adminReplyInput"
        placeholder="Type your reply to ${escHtml(session.visitorName || "visitor")}..."
        rows="1"></textarea>
      <button class="chat-convo-send" id="adminReplySendBtn"
        onclick="sendAdminReply('${sessionId}')">
        <i class="fa fa-paper-plane"></i>
      </button>
    </div>` : `
    <div style="padding:12px 16px;background:#f8f9fa;border-top:1px solid var(--admin-border);
      font-size:0.82rem;color:var(--admin-text-light);text-align:center;">
      <i class="fa fa-robot"></i> AI-only session — no reply needed.
    </div>`}
  `;

  const msgs = document.getElementById("convoMessages");
  if (msgs) msgs.scrollTop = msgs.scrollHeight;

  const replyInput = document.getElementById("adminReplyInput");
  if (replyInput) {
    replyInput.addEventListener("input", () => {
      replyInput.style.height = "auto";
      replyInput.style.height = Math.min(replyInput.scrollHeight, 100) + "px";
      /* Notify visitor that admin is typing */
      updateSession(sessionId, { adminTyping: Date.now() });
    });
    replyInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAdminReply(sessionId);
      }
    });
    replyInput.focus();
  }
}

window.openChatSession = openChatSession;

/* ============================================
   RENDER CONVO MESSAGES
   ============================================ */
function renderConvoMessages(messages) {
  if (!messages || messages.length === 0) {
    return `<div style="text-align:center;color:var(--admin-text-light);padding:30px;font-size:0.88rem;">
      No messages in this conversation yet.</div>`;
  }
  return messages.map(m => {
    const isUser  = m.role === "user";
    const isAgent = m.role === "agent";
    const cls     = isUser ? "" : isAgent ? "admin-sent agent-msg" : "admin-sent";
    const icon    = isUser ? "fa-user" : isAgent ? "fa-user-tie" : "fa-robot";
    const roleLabel = isAgent ? "Support Agent" : m.role === "bot" ? "SwiftBot AI" : "";
    return `
      <div class="admin-chat-msg ${cls}">
        <div class="admin-chat-avatar"><i class="fa ${icon}"></i></div>
        <div>
          ${roleLabel ? `<div class="admin-chat-role">${roleLabel}</div>` : ""}
          <div class="admin-chat-bubble">${escHtml(m.content)}</div>
          <div class="admin-chat-time">${m.time || ""}</div>
        </div>
      </div>`;
  }).join("");
}

/* ============================================
   SEND ADMIN REPLY — writes to Firestore
   ============================================ */
async function sendAdminReply(sessionId) {
  const input   = document.getElementById("adminReplyInput");
  const sendBtn = document.getElementById("adminReplySendBtn");
  const text    = input?.value.trim();
  if (!text) return;

  sendBtn.disabled = true;

  const session = allSessions.find(s => s.id === sessionId);
  const now     = new Date();
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const newMsg = { role: "agent", content: text, time: timeStr, id: Date.now() };

  /* 1. Push to chatReplies collection (visitor polls this) */
  await addReply(sessionId, text);

  /* 2. Append to session messages array in Firestore */
  const updatedMessages = [...(session?.messages || []), newMsg];
  await updateSession(sessionId, {
    messages:   updatedMessages,
    lastActive: now.toISOString(),
    adminTyping: null,
  });

  /* 3. Optimistic UI update */
  const msgs  = document.getElementById("convoMessages");
  if (msgs) {
    const msgEl = document.createElement("div");
    msgEl.className = "admin-chat-msg admin-sent agent-msg";
    msgEl.innerHTML = `
      <div class="admin-chat-avatar" style="background:var(--admin-success);">
        <i class="fa fa-user-tie"></i>
      </div>
      <div>
        <div class="admin-chat-role">Support Agent</div>
        <div class="admin-chat-bubble">${escHtml(text)}</div>
        <div class="admin-chat-time">${timeStr}</div>
      </div>`;
    msgs.appendChild(msgEl);
    msgs.scrollTop = msgs.scrollHeight;
  }

  input.value        = "";
  input.style.height = "auto";
  sendBtn.disabled   = false;
  input.focus();
}

window.sendAdminReply = sendAdminReply;

/* ============================================
   REFRESH ACTIVE CONVO (visitor typing)
   ============================================ */
function refreshActiveConvo() {
  if (!currentSessionId) return;
  const session = allSessions.find(s => s.id === currentSessionId);
  if (!session) return;

  const indicator = document.getElementById("visitorTypingIndicator");
  if (indicator && session.visitorTyping) {
    const diff = Date.now() - session.visitorTyping;
    indicator.style.display = diff < 4000 ? "flex" : "none";
  }
}

/* ============================================
   DELETE CHAT SESSION
   ============================================ */
async function doDeleteChatSession(sessionId) {
  showConfirm("Delete this chat session?", async () => {
    await deleteSession(sessionId);
    currentSessionId = null;
    document.getElementById("chatConvoPanel").innerHTML = `
      <div class="chat-convo-empty">
        <i class="fa fa-comment-dots"></i>
        <p>Select a chat session to view the conversation</p>
      </div>`;
  });
}

window.doDeleteChatSession = doDeleteChatSession;

window.clearAllChats = () => {
  showConfirm("Delete ALL chat sessions? This cannot be undone.", async () => {
    await clearAllSessions();
    currentSessionId = null;
    document.getElementById("chatConvoPanel").innerHTML = `
      <div class="chat-convo-empty">
        <i class="fa fa-comment-dots"></i>
        <p>Select a chat session to view the conversation</p>
      </div>`;
  });
};

window.filterChats = () => renderChatSessions();