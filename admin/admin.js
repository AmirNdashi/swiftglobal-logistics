/* ============================================
   SWIFTGLOBAL LOGISTICS — ADMIN PANEL JS
   Includes Live Chat Management
   ============================================ */

/* ---------- AUTH CHECK ---------- */
(function () {
  if (sessionStorage.getItem('swiftglobal_admin') !== 'authenticated') {
    window.location.href = 'index.html';
  }
})();

/* ---------- STORAGE KEYS ---------- */
const KEYS = {
  messages: 'swiftglobal_messages',
  deleted:  'swiftglobal_deleted_count',
  sessions: 'swiftglobal_chat_sessions',
  replies:  'swiftglobal_chat_replies',
  notify:   'swiftglobal_chat_notify',
};

/* ---------- STATE ---------- */
let allMessages     = [];
let allSessions     = [];
let currentMsgId    = null;
let currentSessionId = null;
let confirmCallback = null;
let notifySound     = null;
let lastNotifyCheck = 0;
let visitorTypingTimers = {};

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', () => {
  loadMessages();
  loadSessions();
  updateStats();
  renderRecentMessages();
  renderMessages();
  renderQuotes();
  renderChatSessions();
  startClock();
  startNotificationPolling();
  initNotificationSound();

// Sidebar toggle (hamburger button)
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    const sidebar = document.getElementById('adminSidebar');
    const main    = document.querySelector('.admin-main');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 767) {
      const isOpen = sidebar.classList.toggle('open');
      if (overlay) overlay.style.display = isOpen ? 'block' : 'none';
    } else {
      sidebar.classList.toggle('collapsed');
      main.classList.toggle('expanded');
    }
  });

  // Sidebar close button (mobile X button)
  const sidebarClose = document.getElementById('sidebarClose');
  if (sidebarClose) {
    sidebarClose.addEventListener('click', () => {
      document.getElementById('adminSidebar').classList.remove('open');
      const overlay = document.getElementById('sidebarOverlay');
      if (overlay) overlay.style.display = 'none';
    });
  }

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('adminSidebar');
  const toggle  = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');

  if (
    window.innerWidth <= 767 &&
    sidebar.classList.contains('open') &&
    !sidebar.contains(e.target) &&
    !toggle.contains(e.target)
  ) {
    sidebar.classList.remove('open');

    // HIDE OVERLAY
    if (overlay) {
      overlay.style.display = 'none';
    }
  }
});

  // Close sidebar when nav link clicked on mobile
document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth <= 767) {
      document.getElementById('adminSidebar').classList.remove('open');

      const overlay = document.getElementById('sidebarOverlay');

      if (overlay) {
        overlay.style.display = 'none';
      }
    }
  });
});

const overlay = document.getElementById('sidebarOverlay');

if (overlay) {
  overlay.addEventListener('click', () => {
    document.getElementById('adminSidebar').classList.remove('open');
    overlay.style.display = 'none';
  });
}
  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('swiftglobal_admin');
    sessionStorage.removeItem('swiftglobal_admin_time');
    window.location.href = 'index.html';
  });

  // Sidebar nav
  document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchSection(link.getAttribute('data-section'));
    });
  });

  // Modal close on overlay click
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // ESC closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeConfirm(); }
  });
});

/* ---------- CLOCK ---------- */
function startClock() {
  const el = document.getElementById('adminClock');
  const update = () => {
    el.textContent = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };
  update();
  setInterval(update, 1000);
}

/* ---------- NOTIFICATION SOUND ---------- */
function initNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    notifySound = new AudioCtx();
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

/* ---------- NOTIFICATION POLLING ---------- */
function startNotificationPolling() {
  setInterval(() => {
    checkForNewChatRequests();
    loadSessions();
    renderChatSessions();
    updateChatBadge();
    refreshActiveConvo();
  }, 3000);
}

function checkForNewChatRequests() {
  try {
    const notifyData = localStorage.getItem(KEYS.notify);
    if (!notifyData) return;

    const notify = JSON.parse(notifyData);
    if (notify.time > lastNotifyCheck) {
      lastNotifyCheck = notify.time;
      playNotificationSound();
      showNotifyToast(`New chat from ${notify.visitorName || 'a visitor'}!`);
      updateChatBadge();
    }
  } catch (e) {}
}

function showNotifyToast(msg) {
  const existing = document.querySelector('.chat-notify-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'chat-notify-toast';
  toast.innerHTML = `<i class="fa fa-comment-dots"></i> ${msg}`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function updateChatBadge() {
  loadSessions();
  const waiting = allSessions.filter(s => s.isHuman && s.status === 'waiting').length;
  const badge   = document.getElementById('chatBadge');
  if (badge) {
    badge.textContent = waiting > 0 ? waiting : '';
  }
}

/* ---------- SECTION SWITCHING ---------- */
function switchSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-link[data-section]').forEach(l => l.classList.remove('active'));
  document.getElementById(`section-${name}`).classList.add('active');
  document.querySelector(`.sidebar-link[data-section="${name}"]`).classList.add('active');
  document.getElementById('pageTitle').textContent =
    name === 'livechats' ? 'Live Chats' :
    name.charAt(0).toUpperCase() + name.slice(1);

  if (name === 'livechats') {
    renderChatSessions();
  }
}

/* ---------- LOAD DATA ---------- */
function loadMessages() {
  try {
    allMessages = JSON.parse(localStorage.getItem(KEYS.messages)) || [];
  } catch { allMessages = []; }
}

function saveMessages() {
  localStorage.setItem(KEYS.messages, JSON.stringify(allMessages));
}

function loadSessions() {
  try {
    allSessions = JSON.parse(localStorage.getItem(KEYS.sessions)) || [];
  } catch { allSessions = []; }
}

/* ---------- STATS ---------- */
function updateStats() {
  loadMessages();
  const total   = allMessages.length;
  const unread  = allMessages.filter(m => !m.read).length;
  const quotes  = allMessages.filter(m => m.service && m.service !== '' && m.service !== 'other').length;
  const deleted = parseInt(localStorage.getItem(KEYS.deleted) || '0');

  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statUnread').textContent  = unread;
  document.getElementById('statQuotes').textContent  = quotes;
  document.getElementById('statDeleted').textContent = deleted;

  document.getElementById('unreadBadge').textContent = unread > 0 ? unread : '';
  document.getElementById('quoteBadge').textContent  = quotes > 0 ? quotes : '';
}

/* ---------- FORMAT DATE ---------- */
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

function formatTimeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function getInitials(first, last) {
  return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '??';
}

function serviceLabel(val) {
  const map = {
    sea:'Sea Freight', air:'Air Freight', land:'Land Freight',
    customs:'Customs', warehousing:'Warehousing', project:'Project Cargo',
    tracking:'Tracking', other:'Other',
  };
  return map[val] || val || 'General';
}

/* ---------- BUILD MESSAGE ROW ---------- */
function buildMessageRow(msg) {
  const initials = getInitials(msg.firstName, msg.lastName);
  const name     = `${msg.firstName} ${msg.lastName}`.trim();
  const svc      = msg.service
    ? `<span class="msg-service-tag">${serviceLabel(msg.service)}</span>` : '';
  const unread   = !msg.read ? '<div class="unread-dot"></div>' : '';
  const readIcon = msg.read ? 'fa-envelope' : 'fa-envelope-open';
  const readTip  = msg.read ? 'Mark as Unread' : 'Mark as Read';

  return `
    <div class="message-row ${msg.read ? '' : 'unread'}" id="row-${msg.id}"
         onclick="openModal('${msg.id}')">
      ${unread}
      <div class="msg-avatar">${initials}</div>
      <div class="msg-body">
        <div class="msg-top">
          <span class="msg-name">${escHtml(name)}</span>${svc}
        </div>
        <div class="msg-subject">${escHtml(msg.subject)}</div>
        <div class="msg-preview">${escHtml(msg.message.substring(0,80))}${msg.message.length>80?'…':''}</div>
      </div>
      <div class="msg-actions">
        <span class="msg-date">${formatDate(msg.date)}</span>
        <div class="msg-action-btns">
          <button class="msg-btn read" title="${readTip}"
            onclick="event.stopPropagation();toggleRead('${msg.id}')">
            <i class="fa ${readIcon}"></i>
          </button>
          <button class="msg-btn delete" title="Delete"
            onclick="event.stopPropagation();confirmDelete('${msg.id}')">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>
    </div>`;
}

/* ---------- RENDER MESSAGES ---------- */
function renderMessages() {
  loadMessages();
  const container = document.getElementById('messagesList');
  const search = (document.getElementById('messageSearch')?.value || '').toLowerCase();
  const filter = document.getElementById('messageFilter')?.value || 'all';

  let list = [...allMessages];
  if (filter === 'unread') list = list.filter(m => !m.read);
  if (filter === 'read')   list = list.filter(m =>  m.read);
  if (search) list = list.filter(m =>
    `${m.firstName} ${m.lastName} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(search)
  );

  container.innerHTML = list.length === 0
    ? `<div class="admin-empty"><i class="fa fa-inbox"></i><p>No messages found.</p></div>`
    : list.map(buildMessageRow).join('');
}

function renderQuotes() {
  loadMessages();
  const container  = document.getElementById('quotesList');
  const search     = (document.getElementById('quoteSearch')?.value || '').toLowerCase();
  const svcFilter  = document.getElementById('quoteServiceFilter')?.value || 'all';

  let list = allMessages.filter(m => m.service && m.service !== '');
  if (svcFilter !== 'all') list = list.filter(m => m.service === svcFilter);
  if (search) list = list.filter(m =>
    `${m.firstName} ${m.lastName} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(search)
  );

  container.innerHTML = list.length === 0
    ? `<div class="admin-empty"><i class="fa fa-file-invoice-dollar"></i><p>No quote requests found.</p></div>`
    : list.map(buildMessageRow).join('');
}

function renderRecentMessages() {
  loadMessages();
  const container = document.getElementById('recentMessages');
  const recent    = allMessages.slice(0, 5);
  container.innerHTML = recent.length === 0
    ? `<div class="admin-empty"><i class="fa fa-inbox"></i><p>No messages yet.</p></div>`
    : recent.map(buildMessageRow).join('');
}

function filterMessages() { renderMessages(); }
function filterQuotes()   { renderQuotes(); }

/* ---------- RENDER CHAT SESSIONS ---------- */
function renderChatSessions() {
  loadSessions();
  const container  = document.getElementById('chatSessionsList');
  if (!container) return;

  const search     = (document.getElementById('chatSearch')?.value || '').toLowerCase();
  const statusF    = document.getElementById('chatStatusFilter')?.value || 'all';

  let list = [...allSessions];

  if (statusF !== 'all') {
    if (statusF === 'waiting') list = list.filter(s => s.isHuman && s.status === 'waiting');
    if (statusF === 'active')  list = list.filter(s => s.isHuman && s.status === 'active');
    if (statusF === 'ai')      list = list.filter(s => !s.isHuman);
  }

  if (search) {
    list = list.filter(s =>
      (s.visitorName || '').toLowerCase().includes(search) ||
      (s.page || '').toLowerCase().includes(search)
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
    const lastMsg  = s.messages?.[s.messages.length - 1];
    const preview  = lastMsg?.content?.substring(0, 50) || 'No messages yet';
    const timeAgo  = formatTimeAgo(s.lastActive);
    const unread   = s.unread > 0
      ? `<div class="chat-session-unread">${s.unread}</div>` : '';
    const statusCls = s.isHuman
      ? (s.status === 'waiting' ? 'status-waiting' : 'status-active')
      : 'status-ai';
    const statusTxt = s.isHuman
      ? (s.status === 'waiting' ? '● Waiting' : '● Active')
      : '● AI Chat';
    const isActive = s.id === currentSessionId ? 'active' : '';
    const hasUnread= s.unread > 0 ? 'has-unread' : '';

    return `
      <div class="chat-session-item ${isActive} ${hasUnread}"
           onclick="openChatSession('${s.id}')">
        ${unread}
        <div class="chat-session-top">
          <span class="chat-session-name">
            <i class="fa fa-user" style="font-size:0.75rem;"></i>
            ${escHtml(s.visitorName || 'Visitor')}
          </span>
          <span class="chat-session-time">${timeAgo}</span>
        </div>
        <div class="chat-session-preview">${escHtml(preview)}</div>
        <div style="margin-top:6px;">
          <span class="chat-session-status ${statusCls}">${statusTxt}</span>
        </div>
      </div>`;
  }).join('');
}

/* ---------- OPEN CHAT SESSION ---------- */
function openChatSession(sessionId) {
  loadSessions();
  currentSessionId = sessionId;
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  // Mark as read
  session.unread = 0;
  session.status = session.isHuman ? 'active' : session.status;
  localStorage.setItem(KEYS.sessions, JSON.stringify(allSessions));
  renderChatSessions();
  updateChatBadge();

  const panel  = document.getElementById('chatConvoPanel');
  const initials = (session.visitorName || 'V').charAt(0).toUpperCase();

  panel.innerHTML = `
    <!-- Convo Header -->
    <div class="chat-convo-header">
      <div class="chat-convo-header-info">
        <div class="chat-convo-avatar">${initials}</div>
        <div>
          <div class="chat-convo-name">${escHtml(session.visitorName || 'Visitor')}</div>
          <div class="chat-convo-meta">
            ${escHtml(session.page || 'website')} &nbsp;·&nbsp;
            Started ${formatDate(session.startTime)}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <span class="chat-session-status ${session.isHuman ? 'status-active' : 'status-ai'}">
          ${session.isHuman ? '● Human Chat' : '● AI Chat'}
        </span>
        <button class="admin-btn admin-btn-danger admin-btn-sm"
          onclick="deleteChatSession('${sessionId}')">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div class="chat-convo-messages" id="convoMessages">
      ${renderConvoMessages(session.messages || [])}
    </div>

    <!-- Visitor typing -->
    <div class="visitor-typing" id="visitorTypingIndicator" style="display:none;padding:0 16px 4px;">
      <i class="fa fa-ellipsis fa-beat"></i> Visitor is typing...
    </div>

    <!-- Reply area (only for human chats) -->
    ${session.isHuman ? `
    <div class="chat-convo-reply">
      <textarea
        class="chat-convo-input"
        id="adminReplyInput"
        placeholder="Type your reply to ${escHtml(session.visitorName || 'visitor')}..."
        rows="1"
      ></textarea>
      <button class="chat-convo-send" id="adminReplySendBtn"
        onclick="sendAdminReply('${sessionId}')">
        <i class="fa fa-paper-plane"></i>
      </button>
    </div>` : `
    <div style="padding:12px 16px;background:#f8f9fa;border-top:1px solid var(--admin-border);font-size:0.82rem;color:var(--admin-text-light);text-align:center;">
      <i class="fa fa-robot"></i> This was an AI-only chat session — no reply needed.
    </div>`}
  `;

  // Scroll to bottom
  const msgs = document.getElementById('convoMessages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;

  // Auto-resize reply input
  const replyInput = document.getElementById('adminReplyInput');
  if (replyInput) {
    replyInput.addEventListener('input', () => {
      replyInput.style.height = 'auto';
      replyInput.style.height = Math.min(replyInput.scrollHeight, 100) + 'px';
    });
    replyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAdminReply(sessionId);
      }
    });
    replyInput.focus();
  }
}

/* ---------- RENDER CONVO MESSAGES ---------- */
function renderConvoMessages(messages) {
  if (!messages || messages.length === 0) {
    return `<div style="text-align:center;color:var(--admin-text-light);padding:30px;font-size:0.88rem;">No messages in this conversation yet.</div>`;
  }

  return messages.map(m => {
    const isUser  = m.role === 'user';
    const isAgent = m.role === 'agent';
    const isBot   = m.role === 'bot';
    const cls     = isUser ? '' : isAgent ? 'admin-sent agent-msg' : 'admin-sent';
    const icon    = isUser ? 'fa-user' : isAgent ? 'fa-user-tie' : 'fa-robot';
    const roleLabel = isAgent ? 'Support Agent' : isBot ? 'SwiftBot AI' : '';

    return `
      <div class="admin-chat-msg ${cls}">
        <div class="admin-chat-avatar"><i class="fa ${icon}"></i></div>
        <div>
          ${roleLabel ? `<div class="admin-chat-role">${roleLabel}</div>` : ''}
          <div class="admin-chat-bubble">${escHtml(m.content)}</div>
          <div class="admin-chat-time">${m.time || ''}</div>
        </div>
      </div>`;
  }).join('');
}

/* ---------- SEND ADMIN REPLY ---------- */
function sendAdminReply(sessionId) {
  const input   = document.getElementById('adminReplyInput');
  const sendBtn = document.getElementById('adminReplySendBtn');
  const text    = input?.value.trim();
  if (!text) return;

  sendBtn.disabled = true;

  const replyObj = {
    sessionId,
    content:   text,
    timestamp: Date.now(),
    isTyping:  false,
  };

  // Save reply for visitor to pick up
  try {
    const existing = JSON.parse(localStorage.getItem(KEYS.replies) || '[]');
    existing.push(replyObj);
    // Keep last 100 replies
    if (existing.length > 100) existing.splice(0, existing.length - 100);
    localStorage.setItem(KEYS.replies, JSON.stringify(existing));
  } catch (e) { console.warn(e); }

  // Save to session messages
  loadSessions();
  const session = allSessions.find(s => s.id === sessionId);
  if (session) {
    if (!session.messages) session.messages = [];
    session.messages.push({
      role:    'agent',
      content: text,
      time:    new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }),
      id:      Date.now(),
    });
    session.lastActive = new Date().toISOString();
    localStorage.setItem(KEYS.sessions, JSON.stringify(allSessions));
  }

  // Update UI
  const msgs = document.getElementById('convoMessages');
  if (msgs) {
    const msgEl = document.createElement('div');
    msgEl.className = 'admin-chat-msg admin-sent agent-msg';
    msgEl.innerHTML = `
      <div class="admin-chat-avatar" style="background:var(--admin-success);">
        <i class="fa fa-user-tie"></i>
      </div>
      <div>
        <div class="admin-chat-role">Support Agent</div>
        <div class="admin-chat-bubble">${escHtml(text)}</div>
        <div class="admin-chat-time">${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>`;
    msgs.appendChild(msgEl);
    msgs.scrollTop = msgs.scrollHeight;
  }

  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = false;
  input.focus();
}

/* ---------- REFRESH ACTIVE CONVO ---------- */
function refreshActiveConvo() {
  if (!currentSessionId) return;
  loadSessions();
  const session = allSessions.find(s => s.id === currentSessionId);
  if (!session) return;

  // Check if visitor is typing
  const typingIndicator = document.getElementById('visitorTypingIndicator');
  if (typingIndicator && session.visitorTyping) {
    const diff = Date.now() - session.visitorTyping;
    if (diff < 4000) {
      typingIndicator.style.display = 'flex';
    } else {
      typingIndicator.style.display = 'none';
    }
  }
}

/* ---------- DELETE CHAT SESSION ---------- */
function deleteChatSession(sessionId) {
  showConfirm('Delete this chat session?', () => {
    loadSessions();
    allSessions = allSessions.filter(s => s.id !== sessionId);
    localStorage.setItem(KEYS.sessions, JSON.stringify(allSessions));
    currentSessionId = null;
    document.getElementById('chatConvoPanel').innerHTML = `
      <div class="chat-convo-empty">
        <i class="fa fa-comment-dots"></i>
        <p>Select a chat session to view the conversation</p>
      </div>`;
    renderChatSessions();
    updateChatBadge();
  });
}

function clearAllChats() {
  showConfirm('Delete ALL chat sessions? This cannot be undone.', () => {
    localStorage.removeItem(KEYS.sessions);
    localStorage.removeItem(KEYS.replies);
    localStorage.removeItem(KEYS.notify);
    allSessions      = [];
    currentSessionId = null;
    document.getElementById('chatConvoPanel').innerHTML = `
      <div class="chat-convo-empty">
        <i class="fa fa-comment-dots"></i>
        <p>Select a chat session to view the conversation</p>
      </div>`;
    renderChatSessions();
    updateChatBadge();
  });
}

function filterChats() { renderChatSessions(); }

/* ---------- ESCAPE HTML ---------- */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- MESSAGES TOGGLE READ ---------- */
function toggleRead(id) {
  loadMessages();
  const msg = allMessages.find(m => m.id === id);
  if (msg) {
    msg.read = !msg.read;
    saveMessages();
    updateStats();
    renderMessages();
    renderQuotes();
    renderRecentMessages();
  }
}

/* ---------- DELETE MESSAGE ---------- */
function deleteMessage(id) {
  loadMessages();
  allMessages = allMessages.filter(m => m.id !== id);
  saveMessages();
  const deleted = parseInt(localStorage.getItem(KEYS.deleted) || '0') + 1;
  localStorage.setItem(KEYS.deleted, deleted);
  updateStats();
  renderMessages();
  renderQuotes();
  renderRecentMessages();
  closeModal();
}

function deleteAllMessages() {
  showConfirm('Delete ALL messages? This cannot be undone.', () => {
    const count = allMessages.length;
    allMessages = [];
    saveMessages();
    const deleted = parseInt(localStorage.getItem(KEYS.deleted) || '0') + count;
    localStorage.setItem(KEYS.deleted, deleted);
    updateStats();
    renderMessages();
    renderRecentMessages();
  });
}

function deleteAllQuotes() {
  showConfirm('Delete all quote requests?', () => {
    const ids   = allMessages.filter(m => m.service && m.service !== '').map(m => m.id);
    const count = ids.length;
    allMessages = allMessages.filter(m => !ids.includes(m.id));
    saveMessages();
    const deleted = parseInt(localStorage.getItem(KEYS.deleted) || '0') + count;
    localStorage.setItem(KEYS.deleted, deleted);
    updateStats();
    renderQuotes();
    renderRecentMessages();
  });
}

/* ---------- CONFIRM DIALOG ---------- */
function showConfirm(msg, cb) {
  confirmCallback = cb;
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmOverlay').style.display = 'flex';
  document.getElementById('confirmYes').onclick = () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  };
}

function closeConfirm() {
  document.getElementById('confirmOverlay').style.display = 'none';
  confirmCallback = null;
}

function confirmDelete(id) {
  showConfirm('Delete this message?', () => deleteMessage(id));
}

/* ---------- MESSAGE MODAL ---------- */
function openModal(id) {
  loadMessages();
  const msg = allMessages.find(m => m.id === id);
  if (!msg) return;
  currentMsgId = id;

  if (!msg.read) {
    msg.read = true;
    saveMessages();
    updateStats();
    renderMessages();
    renderQuotes();
    renderRecentMessages();
  }

  document.getElementById('modalTitle').textContent =
    `${msg.firstName} ${msg.lastName} — ${msg.subject}`;
  document.getElementById('modalReadIcon').className  = 'fa fa-envelope';
  document.getElementById('modalReadText').textContent = 'Mark as Unread';

  document.getElementById('modalBody').innerHTML = `
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
      <span class="modal-detail-value">${escHtml(msg.phone)}</span>
    </div>
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-tag"></i> Service</span>
      <span class="modal-detail-value">${serviceLabel(msg.service)}</span>
    </div>
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-heading"></i> Subject</span>
      <span class="modal-detail-value">${escHtml(msg.subject)}</span>
    </div>
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-calendar"></i> Received</span>
      <span class="modal-detail-value">${formatDate(msg.date)}</span>
    </div>
    <div class="modal-detail-row" style="flex-direction:column;">
      <span class="modal-detail-label" style="margin-bottom:8px;">
        <i class="fa fa-message"></i> Message
      </span>
      <div class="modal-message-box">${escHtml(msg.message)}</div>
    </div>`;

  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  currentMsgId = null;
}

function toggleReadModal() {
  if (!currentMsgId) return;
  toggleRead(currentMsgId);
  closeModal();
}

function deleteFromModal() {
  if (!currentMsgId) return;
  confirmDelete(currentMsgId);
}