/* ============================================
   SWIFTGLOBAL LOGISTICS — SUPER ADMIN PANEL JS
  ============================================ */

import {
  superAdminLogout, onSuperAdminAuthReady, superAdminCurrentUser,
  listenSuperAdminMessages, listenSuperAdminDeletedCount,
  setSuperAdminMessageRead, deleteSuperAdminMessage, deleteSuperAdminMessagesBatch,
  listenSuperAdminChatSessions, updateSuperAdminChatSession, deleteSuperAdminChatSession, clearAllSuperAdminSessions,
  calculateLeadStats, filterMessagesByLeadQuality, sortMessagesByScore,
  exportLeadsToCSV, calculateRevenuePotential, getPremiumQuoteStats,
  listenSuperAdminShipments
} from "./super-admin-firebase.js";

/* ---------- STATE ---------- */
let allMessages      = [];
let allSessions      = [];
let deletedCount     = 0;
let currentMsgId     = null;
let currentSessionId = null;
let confirmCallback  = null;
let notifySound      = null;
let prevSessionIds   = new Set();
let showSpamOnly     = false;

/* ---------- UNSUB HANDLES ---------- */
let unsubMessages = null;
let unsubDeleted  = null;
let unsubSessions = null;
let unsubShipments = null;

/* ---------- SECURITY: SPAM DETECTION ---------- */
function detectSpam(message) {
  const text = (message.message || "").toLowerCase();
  const subject = (message.subject || "").toLowerCase();
  const combined = text + " " + subject;

  // Check for non-English characters (Arabic, Hebrew, Cyrillic)
  const nonEnglishPattern = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u0400-\u04FF]/;
  if (nonEnglishPattern.test(combined)) {
    return true;
  }

  // Check for repeated characters (spam pattern)
  const repeatedCharPattern = /(.)\1{10,}/;
  if (repeatedCharPattern.test(combined)) {
    return true;
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    /\+?[0-9]{10,}/g,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(combined) && !combined.includes("swiftglobal")) {
      return true;
    }
  }

  return false;
}

/* ============================================
   BOOT
   ============================================ */
onSuperAdminAuthReady(user => {
  if (!user) { 
    window.location.href = "index.html"; 
    return;
  }

  /* Show super admin email in topbar */
  const el = document.getElementById("superAdminEmailDisplay");
  if (el) el.textContent = user.email;

  initSuperAdmin();
});

/* ============================================
   INIT
   ============================================ */
function initSuperAdmin() {
  startClock();
  initNotificationSound();
  attachSidebarEvents();
  attachModalEvents();

  /* Real-time listeners */
  unsubMessages = listenSuperAdminMessages(msgs => {
    allMessages = msgs;
    updateStats();
    renderRecentHotLeads();
    renderMessages();
    renderLeads();
    renderQuotes();
    updateAnalytics();
  });

  unsubDeleted = listenSuperAdminDeletedCount(count => {
    deletedCount = count;
    updateStats();
  });

  unsubSessions = listenSuperAdminChatSessions((sessions, changes) => {
    /* Detect new human sessions for notification */
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
    sessions.forEach(s => prevSessionIds.add(s.id));

    allSessions = sessions;
    updateChatBadge();
    renderChatSessions();
    refreshActiveConvo();
  });
  
  // Load shipments section if needed
  unsubShipments = listenSuperAdminShipments(shipments => {
    if (window.renderShipments) {
      window.renderShipments(shipments);
    }
  });
}

/* ============================================
   SIDEBAR
   ============================================ */
function attachSidebarEvents() {
  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    const sidebar = document.getElementById("superAdminSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (window.innerWidth <= 768) {
      const isOpen = sidebar.classList.toggle("open");
      overlay.style.display = isOpen ? "block" : "none";
      overlay.classList.toggle("show", isOpen);
    } else {
      sidebar.classList.toggle("collapsed");
      document.querySelector(".super-admin-main")?.classList.toggle("expanded");
    }
  });

  document.getElementById("sidebarClose")?.addEventListener("click", closeSidebar);
  document.getElementById("sidebarOverlay")?.addEventListener("click", closeSidebar);

  document.addEventListener("click", e => {
    const sidebar = document.getElementById("superAdminSidebar");
    const toggle  = document.getElementById("sidebarToggle");
    if (
      window.innerWidth <= 768 &&
      sidebar?.classList.contains("open") &&
      !sidebar.contains(e.target) &&
      !toggle?.contains(e.target)
    ) closeSidebar();
  });

  document.querySelectorAll(".super-admin-sidebar-link[data-section]").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      if (window.innerWidth <= 768) closeSidebar();
      switchSection(link.getAttribute("data-section"));
    });
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    unsubMessages?.();
    unsubDeleted?.();
    unsubSessions?.();
    unsubShipments?.();
    await superAdminLogout();
    window.location.href = "index.html";
  });
}

function closeSidebar() {
  document.getElementById("superAdminSidebar")?.classList.remove("open");
  const ov = document.getElementById("sidebarOverlay");
  if (ov) {
    ov.style.display = "none";
    ov.classList.remove("show");
  }
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
  const el   = document.getElementById("adminClock");
  const tick = () => {
    if (el) el.textContent = new Date().toLocaleTimeString("en-GB", {
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
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) notifySound = new Ctx();
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
    osc.stop(notifySound.currentTime  + 0.4);
  } catch (e) {}
}

function showNotifyToast(msg) {
  document.querySelector(".super-admin-chat-notify-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "super-admin-chat-notify-toast";
  toast.innerHTML = `<i class="fa fa-comment-dots"></i> ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity    = "0";
    toast.style.transform  = "translateX(100%)";
    toast.style.transition = "all 0.4s ease";
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/* ============================================
   SECTION SWITCHING
   ============================================ */
function switchSection(name) {
  document.querySelectorAll(".super-admin-section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".super-admin-sidebar-link[data-section]").forEach(l => l.classList.remove("active"));
  document.getElementById(`section-${name}`)?.classList.add("active");
  document.querySelector(`.super-admin-sidebar-link[data-section="${name}"]`)?.classList.add("active");
  document.getElementById("pageTitle").textContent =
    name === "livechats" ? "Live Chats" :
    name === "shipments" ? "Shipments" :
    name.charAt(0).toUpperCase() + name.slice(1);
  if (name === "shipments" && window.renderShipments) {
    window.renderShipments();
  }
}
window.switchSection = switchSection;

/* ============================================
   STATS
   ============================================ */
function updateStats() {
  const leadStats = calculateLeadStats(allMessages);
  const revenueStats = calculateRevenuePotential(allMessages);
  const premiumStats = getPremiumQuoteStats(allMessages);
  
  // Update lead quality stats
  document.getElementById("statHotLeads").textContent = leadStats.hot;
  document.getElementById("statWarmLeads").textContent = leadStats.warm;
  document.getElementById("statColdLeads").textContent = leadStats.cold;
  
  // Update general stats
  document.getElementById("statTotal").textContent = leadStats.total;
  document.getElementById("statUnread").textContent = allMessages.filter(m => !m.read).length;
  document.getElementById("statQuotes").textContent = allMessages.filter(m => m.service && m.service !== "").length;
  
  // Update revenue display
  document.getElementById("hotLeadsValue").textContent = formatCurrency(revenueStats.hotLeadsValue);
  document.getElementById("warmLeadsValue").textContent = formatCurrency(revenueStats.warmLeadsValue);
  document.getElementById("totalPipelineValue").textContent = formatCurrency(revenueStats.totalPipelineValue);
  
  // Update lead summary
  document.getElementById("leadSummaryHot").textContent = leadStats.hot;
  document.getElementById("leadSummaryWarm").textContent = leadStats.warm;
  document.getElementById("leadSummaryCold").textContent = leadStats.cold;
  document.getElementById("leadSummaryLow").textContent = leadStats.low;
  
  // Update badges
  document.getElementById("unreadBadge").textContent = allMessages.filter(m => !m.read).length;
  document.getElementById("hotLeadsBadge").textContent = leadStats.hot;
  document.getElementById("quoteBadge").textContent = allMessages.filter(m => m.service && m.service !== "").length;
  document.getElementById("chatBadge").textContent = allSessions.filter(s => s.isHuman).length;
  document.getElementById("shipmentBadge").textContent = document.getElementById("shipmentBadge")?.textContent || "0";
}

function formatCurrency(value) {
  if (!value || value === 0) return "$0";
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

/* ============================================
   ANALYTICS
   ============================================ */
function updateAnalytics() {
  const leadStats = calculateLeadStats(allMessages);
  const premiumStats = getPremiumQuoteStats(allMessages);
  const revenueStats = calculateRevenuePotential(allMessages);
  
  // Lead conversion rate (mock calculation based on lead quality)
  const totalLeads = leadStats.total;
  const highQualityLeads = leadStats.hot + leadStats.warm;
  const conversionRate = totalLeads > 0 ? Math.round((highQualityLeads / totalLeads) * 100) : 0;
  
  document.getElementById("leadConversionRate").textContent = conversionRate + "%";
  
  // Average response time (mock - would need actual response time data)
  document.getElementById("avgResponseTime").textContent = "< 2 hours";
  
  // Average lead value
  const avgLeadValue = totalLeads > 0 ? Math.round(revenueStats.totalPipelineValue / totalLeads) : 0;
  document.getElementById("avgLeadValue").textContent = formatCurrency(avgLeadValue);
  
  // Premium requests
  document.getElementById("premiumRequests").textContent = premiumStats.premiumCount;
}

/* ============================================
   HTML HELPERS
   ============================================ */
function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
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

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function getLeadScoreBadge(leadScore, leadQuality) {
  const quality = (leadQuality || 'Low').toLowerCase();
  const score = leadScore || 0;
  const icon = quality === 'hot' ? 'fa-fire' : 
               quality === 'warm' ? 'fa-temperature-half' : 
               quality === 'cold' ? 'fa-snowflake' : 'fa-chart-line-down';
  
  return `<span class="lead-score-badge ${quality}">
    <i class="fa ${icon}"></i>
    ${score}/100 (${leadQuality || 'Low'})
  </span>`;
}

/* ============================================
   BUILD MESSAGE ROWS (WITH LEAD SCORES)
   ============================================ */
function buildMessageRow(msg) {
  const initials  = getInitials(msg.firstName, msg.lastName);
  const name      = `${msg.firstName || ""} ${msg.lastName || ""}`.trim();
  const svc       = msg.service
    ? `<span class="super-admin-msg-service-tag">${serviceLabel(msg.service)}</span>` : "";
  const unreadDot = !msg.read ? `<div class="unread-dot"></div>` : "";
  const readIcon  = msg.read ? "fa-envelope" : "fa-envelope-open";
  const readTip   = msg.read ? "Mark as Unread" : "Mark as Read";
  const isSpam    = detectSpam(msg);
  const spamBadge = isSpam ? `<span class="msg-spam-badge">⚠️ Spam</span>` : "";
  const leadBadge = getLeadScoreBadge(msg.leadScore, msg.leadQuality);

  return `
    <div class="super-admin-message-row ${msg.read ? "" : "unread"} ${isSpam ? "spam-row" : ""}" id="row-${msg.id}"
         onclick="openModal('${msg.id}')">
      ${unreadDot}
      <div class="super-admin-msg-avatar">${escHtml(initials)}</div>
      <div class="super-admin-msg-body">
        <div class="super-admin-msg-top">
          <span class="super-admin-msg-name">${escHtml(name)}</span>${svc}${spamBadge}${leadBadge}
        </div>
        <div class="super-admin-msg-subject">${escHtml(msg.subject || "")}</div>
        <div class="super-admin-msg-preview">${escHtml((msg.message || "").substring(0, 80))}${(msg.message || "").length > 80 ? "…" : ""}</div>
      </div>
      <div class="super-admin-msg-actions">
        <span class="super-admin-msg-date">${formatDate(msg.createdAt || msg.date)}</span>
        <div class="super-admin-msg-action-btns">
          <button class="super-admin-msg-btn read" title="${readTip}"
            onclick="event.stopPropagation();toggleRead('${msg.id}')">
            <i class="fa ${readIcon}"></i>
          </button>
          <button class="super-admin-msg-btn delete" title="Delete"
            onclick="event.stopPropagation();confirmDeleteMsg('${msg.id}')">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>
    </div>`;
}

/* ============================================
   BUILD LEAD ROWS (SPECIALIZED FOR LEAD TRACKING)
   ============================================ */
function buildLeadRow(msg) {
  const initials  = getInitials(msg.firstName, msg.lastName);
  const name      = `${msg.firstName || ""} ${msg.lastName || ""}`.trim();
  const company   = msg.companyName || "—";
  const score     = msg.leadScore || 0;
  const quality  = (msg.leadQuality || 'Low').toLowerCase();
  const budget    = msg.budget || "—";
  const urgency   = msg.urgency || "—";
  const volume    = msg.shippingVolume || "—";
  
  const qualityIcon = quality === 'hot' ? 'fa-fire' : 
                     quality === 'warm' ? 'fa-temperature-half' : 
                     quality === 'cold' ? 'fa-snowflake' : 'fa-chart-line-down';
  
  const qualityColor = quality === 'hot' ? 'var(--lead-hot)' : 
                       quality === 'warm' ? 'var(--lead-warm)' : 
                       quality === 'cold' ? 'var(--lead-cold)' : 'var(--lead-low)';

  return `
    <div class="super-admin-message-row" id="row-${msg.id}"
         onclick="openModal('${msg.id}')">
      <div class="super-admin-msg-avatar" style="background: linear-gradient(135deg, ${qualityColor}, ${qualityColor}dd);">${escHtml(initials)}</div>
      <div class="super-admin-msg-body">
        <div class="super-admin-msg-top">
          <span class="super-admin-msg-name">${escHtml(name)}</span>
          <span class="lead-score-badge ${quality}">
            <i class="fa ${qualityIcon}"></i>
            ${score}/100
          </span>
        </div>
        <div class="super-admin-msg-subject">${escHtml(company)}</div>
        <div class="super-admin-msg-preview">
          Budget: ${budget} | Volume: ${volume} | Urgency: ${urgency}
        </div>
      </div>
      <div class="super-admin-msg-actions">
        <span class="super-admin-msg-date">${formatDate(msg.createdAt || msg.date)}</span>
        <div class="super-admin-msg-action-btns">
          <button class="super-admin-msg-btn delete" title="Delete"
            onclick="event.stopPropagation();confirmDeleteMsg('${msg.id}')">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>
    </div>`;
}

/* ============================================
   RENDER FUNCTIONS
   ============================================ */
function renderMessages() {
  const container = document.getElementById("messagesList");
  if (!container) return;
  const search = (document.getElementById("messageSearch")?.value || "").toLowerCase();
  const filter = document.getElementById("messageFilter")?.value || "all";

  let list = [...allMessages];
  if (filter === "unread") list = list.filter(m => !m.read);
  if (filter === "read")   list = list.filter(m =>  m.read);
  if (filter === "spam")   list = list.filter(m => detectSpam(m));
  if (filter === "legit")  list = list.filter(m => !detectSpam(m));
  if (search) list = list.filter(m =>
    `${m.firstName} ${m.lastName} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(search)
  );

  container.innerHTML = list.length === 0
    ? `<div class="super-admin-empty"><i class="fa fa-inbox"></i><p>No messages found.</p></div>`
    : list.map(buildMessageRow).join("");
}

function renderLeads() {
  const container = document.getElementById("leadsList");
  if (!container) return;
  
  const search = (document.getElementById("leadSearch")?.value || "").toLowerCase();
  const qualityFilter = document.getElementById("leadQualityFilter")?.value || "all";
  const sortBy = document.getElementById("leadSortBy")?.value || "date";

  let list = [...allMessages];
  
  // Filter by lead quality
  if (qualityFilter !== "all") {
    list = filterMessagesByLeadQuality(list, qualityFilter);
  }
  
  // Search
  if (search) {
    list = list.filter(m =>
      `${m.firstName} ${m.lastName} ${m.email} ${m.companyName} ${m.subject} ${m.message}`.toLowerCase().includes(search)
    );
  }
  
  // Sort
  if (sortBy === "score-desc") {
    list = sortMessagesByScore(list, 'desc');
  } else if (sortBy === "score-asc") {
    list = sortMessagesByScore(list, 'asc');
  } else {
    // Sort by date (default)
    list.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.date);
      const dateB = new Date(b.createdAt || b.date);
      return dateB - dateA;
    });
  }

  container.innerHTML = list.length === 0
    ? `<div class="super-admin-empty"><i class="fa fa-fire"></i><p>No leads found.</p></div>`
    : list.map(buildLeadRow).join("");
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
    ? `<div class="super-admin-empty"><i class="fa fa-file-invoice-dollar"></i><p>No quote requests found.</p></div>`
    : list.map(buildMessageRow).join("");
}

function renderRecentHotLeads() {
  const container = document.getElementById("recentHotLeads");
  if (!container) return;
  
  // Get hot leads only, sorted by score, limit to 5
  const hotLeads = allMessages
    .filter(m => (m.leadQuality || 'Low').toLowerCase() === 'hot')
    .sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0))
    .slice(0, 5);

  container.innerHTML = hotLeads.length === 0
    ? `<div class="super-admin-empty"><i class="fa fa-fire"></i><p>No high-value leads yet.</p></div>`
    : hotLeads.map(buildLeadRow).join("");
}

/* ============================================
   FILTER EXPORTS
   ============================================ */
window.filterMessages = () => renderMessages();
window.filterLeads = () => renderLeads();
window.filterQuotes = () => renderQuotes();

window.exportLeads = () => {
  const csvUrl = exportLeadsToCSV(allMessages);
  if (csvUrl) {
    const link = document.createElement("a");
    link.href = csvUrl;
    link.download = `swiftglobal-leads-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(csvUrl);
  } else {
    alert("No leads to export.");
  }
};

/* ============================================
   TOGGLE READ / DELETE
   ============================================ */
async function toggleRead(id) {
  const msg = allMessages.find(m => m.id === id);
  if (msg) await setSuperAdminMessageRead(id, !msg.read);
}
window.toggleRead = toggleRead;

async function doDeleteMessage(id) {
  await deleteSuperAdminMessage(id);
  closeModal();
}

window.deleteAllMessages = () => {
  showConfirm("Delete ALL messages? This cannot be undone.", async () => {
    await deleteSuperAdminMessagesBatch(allMessages.map(m => m.id));
  });
};

window.deleteAllQuotes = () => {
  showConfirm("Delete all quote requests?", async () => {
    const ids = allMessages.filter(m => m.service && m.service !== "").map(m => m.id);
    await deleteSuperAdminMessagesBatch(ids);
  });
};

window.deleteAllSpam = () => {
  const spamIds = allMessages.filter(m => detectSpam(m)).map(m => m.id);
  if (spamIds.length === 0) {
    alert("No spam messages found.");
    return;
  }
  showConfirm(`Delete ${spamIds.length} spam messages? This cannot be undone.`, async () => {
    await deleteSuperAdminMessagesBatch(spamIds);
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
   MESSAGE MODAL (WITH LEAD SCORE DISPLAY)
   ============================================ */
function openModal(id) {
  const msg = allMessages.find(m => m.id === id);
  if (!msg) return;
  currentMsgId = id;
  if (!msg.read) setSuperAdminMessageRead(id, true);

  document.getElementById("modalTitle").textContent =
    `${msg.firstName || ""} ${msg.lastName || ""} — ${msg.subject || ""}`;
  document.getElementById("modalReadIcon").className   = "fa fa-envelope";
  document.getElementById("modalReadText").textContent = "Mark as Unread";

  const quality = (msg.leadQuality || 'Low').toLowerCase();
  const score = msg.leadScore || 0;
  const leadScoreHtml = `
    <div class="lead-score-display ${quality}">
      <div class="lead-score-number">${score}</div>
      <div class="lead-score-label">
        <strong>Lead Score: ${msg.leadQuality || 'Low'}</strong>
        <span>Based on business qualifications and urgency</span>
      </div>
    </div>`;

  document.getElementById("modalBody").innerHTML = `
    ${leadScoreHtml}
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-user"></i> Name</span>
      <span class="super-admin-modal-detail-value">${escHtml(msg.firstName)} ${escHtml(msg.lastName)}</span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-envelope"></i> Email</span>
      <span class="super-admin-modal-detail-value">
        <a href="mailto:${escHtml(msg.email)}" style="color:var(--super-admin-accent);">${escHtml(msg.email)}</a>
      </span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-phone"></i> Phone</span>
      <span class="super-admin-modal-detail-value">${escHtml(msg.phone || "—")}</span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-building"></i> Company</span>
      <span class="super-admin-modal-detail-value">${escHtml(msg.companyName || "—")}</span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-industry"></i> Industry</span>
      <span class="super-admin-modal-detail-value">${escHtml(msg.industry || "—")}</span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-tag"></i> Service</span>
      <span class="super-admin-modal-detail-value">${serviceLabel(msg.service)}</span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-boxes-stacked"></i> Shipping Volume</span>
      <span class="super-admin-modal-detail-value">${escHtml(msg.shippingVolume || "—")}</span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-dollar-sign"></i> Budget Range</span>
      <span class="super-admin-modal-detail-value">${escHtml(msg.budget || "—")}</span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-clock"></i> Timeline</span>
      <span class="super-admin-modal-detail-value">${escHtml(msg.urgency || "—")}</span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-crown"></i> Premium Quote</span>
      <span class="super-admin-modal-detail-value">${msg.premiumQuote ? "Yes" : "No"}</span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-heading"></i> Subject</span>
      <span class="super-admin-modal-detail-value">${escHtml(msg.subject || "")}</span>
    </div>
    <div class="super-admin-modal-detail-row">
      <span class="super-admin-modal-detail-label"><i class="fa fa-calendar"></i> Received</span>
      <span class="super-admin-modal-detail-value">${formatDate(msg.createdAt || msg.date)}</span>
    </div>
    <div class="super-admin-modal-detail-row" style="flex-direction:column;">
      <span class="super-admin-modal-detail-label" style="margin-bottom:8px;">
        <i class="fa fa-message"></i> Message
      </span>
      <div class="super-admin-modal-message-box">${escHtml(msg.message || "")}</div>
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
  if (msg) setSuperAdminMessageRead(currentMsgId, !msg.read);
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
   CHAT SESSIONS LIST
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
  if (search) list = list.filter(s =>
    (s.visitorName || "").toLowerCase().includes(search) || 
    (s.visitorEmail || "").toLowerCase().includes(search)
  );

  container.innerHTML = list.length === 0
    ? `<div class="super-admin-empty"><i class="fa fa-comments"></i><p>No chat sessions found.</p></div>`
    : list.map(s => buildChatSessionRow(s)).join("");
}

function buildChatSessionRow(session) {
  const name = session.visitorName || "Anonymous";
  const email = session.visitorEmail || "No email";
  const statusIcon = session.status === "active" ? "fa-circle" : 
                    session.status === "waiting" ? "fa-clock" : "fa-circle-minus";
  const statusColor = session.status === "active" ? "var(--super-admin-success)" : 
                     session.status === "waiting" ? "var(--super-admin-warning)" : "var(--super-admin-text-light)";
  
  return `
    <div class="super-admin-message-row" onclick="openChatSession('${session.id}')">
      <div class="super-admin-msg-avatar">${getInitials(name, "")}</div>
      <div class="super-admin-msg-body">
        <div class="super-admin-msg-top">
          <span class="super-admin-msg-name">${escHtml(name)}</span>
          ${session.isHuman ? '<span class="super-admin-msg-service-tag">Human</span>' : '<span class="super-admin-msg-service-tag" style="background:rgba(107,33,168,0.2);color:var(--super-admin-purple-light);">AI</span>'}
        </div>
        <div class="super-admin-msg-subject">${escHtml(email)}</div>
        <div class="super-admin-msg-preview">
          <i class="fa ${statusIcon}" style="color:${statusColor};font-size:0.7rem;margin-right:4px;"></i>
          ${session.status || "Unknown"} • ${session.messages?.length || 0} messages
        </div>
      </div>
      <div class="super-admin-msg-actions">
        <span class="super-admin-msg-date">${formatDate(session.createdAt)}</span>
      </div>
    </div>`;
}

function updateChatBadge() {
  const badge = document.getElementById("chatBadge");
  if (badge) {
    const humanCount = allSessions.filter(s => s.isHuman).length;
    badge.textContent = humanCount;
    badge.style.display = humanCount > 0 ? "inline" : "none";
  }
}

window.clearAllSessions = () => {
  showConfirm("Clear all chat sessions? This cannot be undone.", async () => {
    await clearAllSuperAdminSessions();
  });
};

/* ============================================
   SHIPMENTS (IMPORTED FROM REGULAR ADMIN)
   ============================================ */
// Import the shipments functionality from the regular admin
// This would be added to integrate with existing shipment management
