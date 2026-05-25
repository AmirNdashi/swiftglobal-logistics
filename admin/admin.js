/* ============================================
   SWIFTGLOBAL LOGISTICS — ADMIN PANEL JS
   ============================================ */

/* ---------- AUTH CHECK ---------- */
(function () {
  if (sessionStorage.getItem("swiftglobal_admin") !== "authenticated") {
    window.location.href = "index.html";
  }
})();

/* ---------- STORAGE KEYS ---------- */
const KEYS = {
  messages: "swiftglobal_messages",
  deleted: "swiftglobal_deleted_count",
};

/* ---------- STATE ---------- */
let allMessages = [];
let currentMsgId = null;
let confirmCallback = null;

/* ---------- INIT ---------- */
document.addEventListener("DOMContentLoaded", () => {
  loadMessages();
  updateStats();
  renderRecentMessages();
  renderMessages();
  renderQuotes();
  startClock();

  // Sidebar toggle
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    const sidebar = document.getElementById("adminSidebar");
    const main = document.querySelector(".admin-main");
    if (window.innerWidth <= 767) {
      sidebar.classList.toggle("open");
    } else {
      sidebar.classList.toggle("collapsed");
      main.classList.toggle("expanded");
    }
  });

  // Logout
  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("swiftglobal_admin");
    sessionStorage.removeItem("swiftglobal_admin_time");
    window.location.href = "index.html";
  });

  // Sidebar nav
  document.querySelectorAll(".sidebar-link[data-section]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      switchSection(link.getAttribute("data-section"));
    });
  });

  // Close modal on overlay click
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modalOverlay")) closeModal();
  });

  // Keyboard ESC closes modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeConfirm();
    }
  });
});

/* ---------- CLOCK ---------- */
function startClock() {
  const el = document.getElementById("adminClock");
  const update = () => {
    el.textContent = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };
  update();
  setInterval(update, 1000);
}

/* ---------- SECTION SWITCHING ---------- */
function switchSection(name) {
  document
    .querySelectorAll(".admin-section")
    .forEach((s) => s.classList.remove("active"));
  document
    .querySelectorAll(".sidebar-link[data-section]")
    .forEach((l) => l.classList.remove("active"));
  document.getElementById(`section-${name}`).classList.add("active");
  document
    .querySelector(`.sidebar-link[data-section="${name}"]`)
    .classList.add("active");
  document.getElementById("pageTitle").textContent =
    name.charAt(0).toUpperCase() + name.slice(1);
}

/* ---------- LOAD / SAVE MESSAGES ---------- */
function loadMessages() {
  try {
    allMessages = JSON.parse(localStorage.getItem(KEYS.messages)) || [];
  } catch {
    allMessages = [];
  }
}

function saveMessages() {
  localStorage.setItem(KEYS.messages, JSON.stringify(allMessages));
}

/* ---------- ADD MESSAGE (called from contact form) ---------- */
function addMessage(data) {
  loadMessages();
  const msg = {
    id: Date.now().toString(),
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    email: data.email || "",
    phone: data.phone || "—",
    service: data.service || "",
    subject: data.subject || "",
    message: data.message || "",
    date: new Date().toISOString(),
    read: false,
  };
  allMessages.unshift(msg);
  saveMessages();
}

/* ---------- STATS ---------- */
function updateStats() {
  loadMessages();
  const total = allMessages.length;
  const unread = allMessages.filter((m) => !m.read).length;
  const quotes = allMessages.filter(
    (m) => m.service && m.service !== "" && m.service !== "other",
  ).length;
  const deleted = parseInt(localStorage.getItem(KEYS.deleted) || "0");

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statUnread").textContent = unread;
  document.getElementById("statQuotes").textContent = quotes;
  document.getElementById("statDeleted").textContent = deleted;

  // Badge counts
  const unreadBadge = document.getElementById("unreadBadge");
  const quoteBadge = document.getElementById("quoteBadge");

  unreadBadge.textContent = unread > 0 ? unread : "";
  quoteBadge.textContent = quotes > 0 ? quotes : "";
}

/* ---------- FORMAT DATE ---------- */
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------- AVATAR INITIALS ---------- */
function getInitials(first, last) {
  return ((first?.[0] || "") + (last?.[0] || "")).toUpperCase() || "??";
}

/* ---------- SERVICE LABEL ---------- */
function serviceLabel(val) {
  const map = {
    sea: "Sea Freight",
    air: "Air Freight",
    land: "Land Freight",
    customs: "Customs",
    warehousing: "Warehousing",
    project: "Project Cargo",
    tracking: "Tracking",
    other: "Other",
  };
  return map[val] || val || "General";
}

/* ---------- BUILD MESSAGE ROW HTML ---------- */
function buildMessageRow(msg) {
  const initials = getInitials(msg.firstName, msg.lastName);
  const name = `${msg.firstName} ${msg.lastName}`.trim();
  const svc = msg.service
    ? `<span class="msg-service-tag">${serviceLabel(msg.service)}</span>`
    : "";
  const unread = !msg.read ? '<div class="unread-dot"></div>' : "";
  const readIcon = msg.read ? "fa-envelope" : "fa-envelope-open";
  const readTip = msg.read ? "Mark as Unread" : "Mark as Read";

  return `
    <div class="message-row ${msg.read ? "" : "unread"}" id="row-${msg.id}" onclick="openModal('${msg.id}')">
      ${unread}
      <div class="msg-avatar">${initials}</div>
      <div class="msg-body">
        <div class="msg-top">
          <span class="msg-name">${escHtml(name)}</span>
          ${svc}
        </div>
        <div class="msg-subject">${escHtml(msg.subject)}</div>
        <div class="msg-preview">${escHtml(msg.message.substring(0, 80))}${msg.message.length > 80 ? "…" : ""}</div>
      </div>
      <div class="msg-actions">
        <span class="msg-date">${formatDate(msg.date)}</span>
        <div class="msg-action-btns">
          <button class="msg-btn read" title="${readTip}" onclick="event.stopPropagation();toggleRead('${msg.id}')">
            <i class="fa ${readIcon}"></i>
          </button>
          <button class="msg-btn delete" title="Delete" onclick="event.stopPropagation();confirmDelete('${msg.id}')">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ---------- RENDER ALL MESSAGES ---------- */
function renderMessages() {
  loadMessages();
  const container = document.getElementById("messagesList");
  const search = (
    document.getElementById("messageSearch")?.value || ""
  ).toLowerCase();
  const filter = document.getElementById("messageFilter")?.value || "all";

  let list = [...allMessages];

  if (filter === "unread") list = list.filter((m) => !m.read);
  if (filter === "read") list = list.filter((m) => m.read);

  if (search) {
    list = list.filter((m) =>
      `${m.firstName} ${m.lastName} ${m.email} ${m.subject} ${m.message}`
        .toLowerCase()
        .includes(search),
    );
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="admin-empty"><i class="fa fa-inbox"></i><p>No messages found.</p></div>`;
    return;
  }

  container.innerHTML = list.map(buildMessageRow).join("");
}

/* ---------- RENDER QUOTES ---------- */
function renderQuotes() {
  loadMessages();
  const container = document.getElementById("quotesList");
  const search = (
    document.getElementById("quoteSearch")?.value || ""
  ).toLowerCase();
  const svcFilter =
    document.getElementById("quoteServiceFilter")?.value || "all";

  let list = allMessages.filter((m) => m.service && m.service !== "");

  if (svcFilter !== "all") list = list.filter((m) => m.service === svcFilter);

  if (search) {
    list = list.filter((m) =>
      `${m.firstName} ${m.lastName} ${m.email} ${m.subject} ${m.message}`
        .toLowerCase()
        .includes(search),
    );
  }

  if (list.length === 0) {
    container.innerHTML = `<div class="admin-empty"><i class="fa fa-file-invoice-dollar"></i><p>No quote requests found.</p></div>`;
    return;
  }

  container.innerHTML = list.map(buildMessageRow).join("");
}

/* ---------- RENDER RECENT (dashboard) ---------- */
function renderRecentMessages() {
  loadMessages();
  const container = document.getElementById("recentMessages");
  const recent = allMessages.slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = `<div class="admin-empty"><i class="fa fa-inbox"></i><p>No messages yet.</p></div>`;
    return;
  }

  container.innerHTML = recent.map(buildMessageRow).join("");
}

/* ---------- FILTER HANDLERS ---------- */
function filterMessages() {
  renderMessages();
}

function filterQuotes() {
  renderQuotes();
}

/* ---------- TOGGLE READ ---------- */
function toggleRead(id) {
  loadMessages();
  const msg = allMessages.find((m) => m.id === id);
  if (msg) {
    msg.read = !msg.read;
    saveMessages();
    updateStats();
    renderMessages();
    renderQuotes();
    renderRecentMessages();
  }
}

/* ---------- DELETE ---------- */
function deleteMessage(id) {
  loadMessages();
  allMessages = allMessages.filter((m) => m.id !== id);
  saveMessages();
  const deleted = parseInt(localStorage.getItem(KEYS.deleted) || "0") + 1;
  localStorage.setItem(KEYS.deleted, deleted);
  updateStats();
  renderMessages();
  renderQuotes();
  renderRecentMessages();
  closeModal();
}

function deleteAllMessages() {
  showConfirm("Delete ALL messages? This cannot be undone.", () => {
    const count = allMessages.length;
    allMessages = [];
    saveMessages();
    const deleted = parseInt(localStorage.getItem(KEYS.deleted) || "0") + count;
    localStorage.setItem(KEYS.deleted, deleted);
    updateStats();
    renderMessages();
    renderRecentMessages();
  });
}

function deleteAllQuotes() {
  showConfirm("Delete all quote requests? This cannot be undone.", () => {
    const quoteIds = allMessages
      .filter((m) => m.service && m.service !== "")
      .map((m) => m.id);
    const count = quoteIds.length;
    allMessages = allMessages.filter((m) => !quoteIds.includes(m.id));
    saveMessages();
    const deleted = parseInt(localStorage.getItem(KEYS.deleted) || "0") + count;
    localStorage.setItem(KEYS.deleted, deleted);
    updateStats();
    renderQuotes();
    renderRecentMessages();
  });
}

/* ---------- CONFIRM DIALOG ---------- */
function showConfirm(msg, cb) {
  confirmCallback = cb;
  document.getElementById("confirmMsg").textContent = msg;
  document.getElementById("confirmOverlay").style.display = "flex";
  document.getElementById("confirmYes").onclick = () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  };
}

function closeConfirm() {
  document.getElementById("confirmOverlay").style.display = "none";
  confirmCallback = null;
}

function confirmDelete(id) {
  showConfirm("Are you sure you want to delete this message?", () =>
    deleteMessage(id),
  );
}

/* ---------- MODAL ---------- */
function openModal(id) {
  loadMessages();
  const msg = allMessages.find((m) => m.id === id);
  if (!msg) return;

  currentMsgId = id;

  // Auto-mark as read
  if (!msg.read) {
    msg.read = true;
    saveMessages();
    updateStats();
    renderMessages();
    renderQuotes();
    renderRecentMessages();
  }

  document.getElementById("modalTitle").textContent =
    `${msg.firstName} ${msg.lastName} — ${msg.subject}`;

  document.getElementById("modalReadIcon").className = "fa fa-envelope";
  document.getElementById("modalReadText").textContent = "Mark as Unread";

  document.getElementById("modalBody").innerHTML = `
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-user"></i> Name</span>
      <span class="modal-detail-value">${escHtml(msg.firstName)} ${escHtml(msg.lastName)}</span>
    </div>
    <div class="modal-detail-row">
      <span class="modal-detail-label"><i class="fa fa-envelope"></i> Email</span>
      <span class="modal-detail-value"><a href="mailto:${escHtml(msg.email)}" style="color:#E8A317;">${escHtml(msg.email)}</a></span>
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
      <span class="modal-detail-label" style="margin-bottom:8px;"><i class="fa fa-message"></i> Message</span>
      <div class="modal-message-box">${escHtml(msg.message)}</div>
    </div>
  `;

  document.getElementById("modalOverlay").style.display = "flex";
}

function closeModal() {
  document.getElementById("modalOverlay").style.display = "none";
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

/* ---------- ESCAPE HTML ---------- */
function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
