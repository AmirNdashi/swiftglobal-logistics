/* ============================================
   SWIFTGLOBAL LOGISTICS — AI + HUMAN CHATBOT
   Production-ready v3

   FIXES:
   Bug #1 — listenReplies called with correct 3 args:
            (sessionId, replyStartMs, callback)
            Previously passed (sessionId, 0, callback) but firebase.js
            had dropped the middle param — the callback was landing
            in the wrong slot. Now firebase.js and chatbot.js agree.

   Bug #4 — Listener starts immediately on page load when session
            is restored from sessionStorage, not only when the visitor
            clicks the chat bubble. If the visitor navigates away while
            in human mode and returns, they now receive replies that
            arrived while the bubble was closed.

   Bug #5 — Duplicate prevention via a Set of delivered reply IDs
            stored in sessionStorage. Even if two tabs are open,
            the same reply ID is only rendered once per tab.
            The afterMs watermark prevents replaying old replies
            when the page reloads.
   ============================================ */

/* ---------- CONFIG ---------- */
const CHATBOT_CONFIG = {
  apiURL:    "https://swiftglobal-ai.swiftglobal.workers.dev",
  maxTokens: 500,
};

const SYSTEM_PROMPT = `You are SwiftBot, the friendly and professional AI assistant for SwiftGlobal Logistics.

COMPANY INFORMATION:
- Company Name: SwiftGlobal Logistics
- Website: https://www.swiftglobalogistics.com
- Email: info@swiftglobalogistics.com
- Hours: Monday to Friday, 08:00 – 18:00
- Experience: 15+ years in global logistics
- Countries Served: 120+

SERVICES OFFERED:
1. Sea Freight — FCL, LCL, RoRo, Reefer containers
2. Air Freight — Express, standard, charter flights
3. Land Freight — FTL, LTL, refrigerated, cross-border
4. Customs Clearance — Import/export docs, duty/tax
5. Warehousing — Ambient, cold storage, pick/pack
6. Project Cargo — Heavy-lift, break-bulk, multi-modal

YOUR BEHAVIOR:
- Always be friendly, professional, and helpful
- Keep responses concise — max 3-4 short paragraphs
- For quotes, direct to contact page or info@swiftglobalogistics.com
- Never make up specific prices or guaranteed transit times`;

/* ---------- SESSION STORAGE KEYS ---------- */
const SS = {
  sessionId:      "sg_chat_sessionId",
  visitorName:    "sg_chat_visitorName",
  isHuman:        "sg_chat_isHuman",
  history:        "sg_chat_history",
  messages:       "sg_chat_messages",
  replyMark:      "sg_chat_replyMark",
  deliveredIds:   "sg_chat_deliveredIds",   /* FIX Bug #5: track delivered reply IDs */
};

/* ---------- STATE ---------- */
let chatHistory       = [];
let sessionMessages   = [];
let isTyping          = false;
let chatInitialized   = false;
let unreadCount       = 0;
let isHumanMode       = false;
let sessionId         = null;
let visitorName       = "";
let replyStartMs      = 0;
let unsubReplies      = null;
let deliveredReplyIds = new Set(); /* FIX Bug #5 */

const QUICK_REPLIES = {
  greeting: ["Track a parcel 📦", "Get a quote 💰", "Sea Freight 🚢", "Air Freight ✈️"],
  tracking: ["Go to tracking page", "Which carriers?", "Tracking not working"],
  quote:    ["Sea Freight quote", "Air Freight quote", "Land Freight quote", "Customs help"],
  general:  ["Tell me about services", "How to contact you?", "Track my parcel", "Get a quote"],
};

/* ---------- FIREBASE HELPERS ---------- */
function fb() { return window.__sgChat || null; }

/* ---------- SESSION PERSISTENCE ---------- */
function persistState() {
  try {
    sessionStorage.setItem(SS.sessionId,    sessionId    || "");
    sessionStorage.setItem(SS.visitorName,  visitorName  || "");
    sessionStorage.setItem(SS.isHuman,      isHumanMode  ? "1" : "0");
    sessionStorage.setItem(SS.history,      JSON.stringify(chatHistory));
    sessionStorage.setItem(SS.messages,     JSON.stringify(sessionMessages));
    sessionStorage.setItem(SS.replyMark,    String(replyStartMs));
    /* FIX Bug #5: persist delivered IDs so page reload doesn't re-show old replies */
    sessionStorage.setItem(SS.deliveredIds, JSON.stringify([...deliveredReplyIds]));
  } catch (e) {}
}

function restoreState() {
  try {
    sessionId    = sessionStorage.getItem(SS.sessionId)   || null;
    visitorName  = sessionStorage.getItem(SS.visitorName) || "";
    isHumanMode  = sessionStorage.getItem(SS.isHuman)     === "1";
    replyStartMs = parseInt(sessionStorage.getItem(SS.replyMark) || "0");

    const h  = sessionStorage.getItem(SS.history);
    const m  = sessionStorage.getItem(SS.messages);
    const di = sessionStorage.getItem(SS.deliveredIds);

    chatHistory       = h  ? JSON.parse(h)  : [];
    sessionMessages   = m  ? JSON.parse(m)  : [];
    deliveredReplyIds = di ? new Set(JSON.parse(di)) : new Set();

    return sessionMessages.length > 0;
  } catch (e) { return false; }
}

function clearState() {
  Object.values(SS).forEach(k => sessionStorage.removeItem(k));
  chatHistory       = [];
  sessionMessages   = [];
  sessionId         = null;
  visitorName       = "";
  isHumanMode       = false;
  replyStartMs      = 0;
  deliveredReplyIds = new Set();
}

/* ---------- HELPERS ---------- */
function getTime() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function escHtml(t) {
  return String(t || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtMsg(text) {
  return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}
function scrollBottom() {
  const el = document.getElementById("chatMessages");
  if (el) el.scrollTop = el.scrollHeight;
}
function genSessionId() {
  return "sess_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

/* ---------- BUILD CHAT HTML ---------- */
function buildChatHTML() {
  return `
    <button class="chat-bubble-btn" id="chatBubbleBtn" aria-label="Open chat">
      <span class="chat-bubble-icon">
        <i class="fa fa-comment-dots" id="chatBubbleIcon"></i>
      </span>
      <span class="chat-unread-badge" id="chatUnreadBadge" style="display:none;">1</span>
    </button>

    <div class="chat-window" id="chatWindow" role="dialog" aria-label="SwiftGlobal Support Chat">
      <div class="chat-header" id="chatHeader">
        <div class="chat-header-avatar" id="chatHeaderAvatar">
          <i class="fa fa-robot"></i>
        </div>
        <div class="chat-header-info">
          <span class="chat-header-name" id="chatHeaderName">SwiftBot AI</span>
          <span class="chat-header-status">
            <span class="chat-status-dot"></span>
            <span id="chatHeaderStatus">Online — SwiftGlobal Logistics</span>
          </span>
        </div>
        <div class="chat-header-actions">
          <button class="chat-header-btn" id="chatClearBtn" title="Clear chat">
            <i class="fa fa-rotate-left"></i>
          </button>
          <button class="chat-header-btn" id="chatCloseBtn" title="Close chat">
            <i class="fa fa-times"></i>
          </button>
        </div>
      </div>

      <div class="chat-human-banner" id="chatHumanBanner" style="display:none;">
        <i class="fa fa-user-headset"></i>
        <span>You are now chatting with a <strong>human agent</strong></span>
      </div>

      <div class="chat-messages" id="chatMessages"></div>

      <div class="chat-handoff-bar" id="chatHandoffBar">
        <span class="chat-handoff-label">
          <i class="fa fa-robot"></i> Chatting with AI
        </span>
        <button class="chat-handoff-btn" id="chatHandoffBtn" onclick="requestHuman()">
          <i class="fa fa-user-headset"></i> Talk to a Human
        </button>
      </div>

      <div class="chat-input-area">
        <textarea class="chat-input" id="chatInput"
          placeholder="Ask me anything..." rows="1" aria-label="Type your message">
        </textarea>
        <button class="chat-send-btn" id="chatSendBtn">
          <i class="fa fa-paper-plane"></i>
        </button>
      </div>

      <div class="chat-footer">
        <span id="chatFooterText">Powered by Groq AI</span>
        &nbsp;·&nbsp; SwiftGlobal Logistics
      </div>
    </div>`;
}

/* ---------- ADD MESSAGE TO UI ---------- */
function addMessage(role, content, quickReplies = [], isSystem = false, skipSave = false) {
  const msgs    = document.getElementById("chatMessages");
  if (!msgs) return;

  const isUser  = role === "user";
  const isAgent = role === "agent";

  const msgEl = document.createElement("div");
  msgEl.className = `chat-msg ${isUser ? "user" : "bot"} ${isAgent ? "agent" : ""}`;

  const icon        = isUser ? "fa-user" : isAgent ? "fa-user-tie" : "fa-robot";
  const avatarStyle = isAgent ? 'style="background:var(--chat-success);color:#fff;"' : "";

  msgEl.innerHTML = `
    <div class="chat-msg-avatar" ${avatarStyle}>
      <i class="fa ${icon}"></i>
    </div>
    <div class="chat-msg-content">
      ${isAgent ? '<span class="chat-agent-label">Support Agent</span>' : ""}
      <div class="chat-msg-bubble ${isSystem ? "system-bubble" : ""}">
        ${isUser ? escHtml(content) : fmtMsg(content)}
      </div>
      <div class="chat-msg-time">${getTime()}</div>
      ${quickReplies.length ? `
        <div class="chat-quick-replies">
          ${quickReplies.map(r =>
            `<button class="chat-quick-btn" onclick="sendQuickReply('${r.replace(/'/g, "\\'")}')">
              ${escHtml(r)}</button>`).join("")}
        </div>` : ""}
    </div>`;

  msgs.appendChild(msgEl);
  scrollBottom();

  if (!skipSave && !isSystem) {
    sessionMessages.push({ role, content, time: getTime(), id: Date.now() + Math.random() });
    persistState();
  }

  /* Unread badge when window is closed */
  if (!isUser) {
    const chatWindow = document.getElementById("chatWindow");
    if (chatWindow && !chatWindow.classList.contains("open")) {
      unreadCount++;
      const badge = document.getElementById("chatUnreadBadge");
      if (badge) {
        badge.textContent   = unreadCount > 9 ? "9+" : unreadCount;
        badge.style.display = "flex";
      }
    }
  }
}

/* ---------- TYPING INDICATOR ---------- */
function showTyping(isAgent = false) {
  const msgs = document.getElementById("chatMessages");
  if (!msgs) return;
  const el = document.createElement("div");
  el.className = "chat-typing";
  el.id = "chatTyping";
  const icon  = isAgent ? "fa-user-tie" : "fa-robot";
  const style = isAgent ? 'style="background:var(--chat-success);color:#fff;"' : "";
  el.innerHTML = `
    <div class="chat-msg-avatar" ${style}><i class="fa ${icon}"></i></div>
    <div class="chat-typing-bubble">
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
    </div>`;
  msgs.appendChild(el);
  scrollBottom();
}
function hideTyping() { document.getElementById("chatTyping")?.remove(); }

/* ---------- HUMAN UI ---------- */
function setHumanUI() {
  const avatar = document.getElementById("chatHeaderAvatar");
  if (avatar) {
    avatar.innerHTML  = '<i class="fa fa-user-headset"></i>';
    avatar.style.cssText =
      "background:rgba(56,161,105,0.2);border-color:var(--chat-success);color:var(--chat-success);";
  }
  const name = document.getElementById("chatHeaderName");
  if (name) name.textContent = "Human Support";
  const status = document.getElementById("chatHeaderStatus");
  if (status) status.textContent = "Connected — Human Support";
  const banner = document.getElementById("chatHumanBanner");
  if (banner) banner.style.display = "flex";
  const footer = document.getElementById("chatFooterText");
  if (footer) footer.textContent = "Live Human Support";
  const bar = document.getElementById("chatHandoffBar");
  if (bar) bar.innerHTML = `
    <span class="chat-handoff-label" style="color:var(--chat-success);">
      <i class="fa fa-user-headset"></i> Connected to Human Support
    </span>
    <button class="chat-handoff-btn chat-handoff-btn--ai" onclick="switchBackToAI()">
      <i class="fa fa-robot"></i> Back to AI
    </button>`;
  const input = document.getElementById("chatInput");
  if (input) input.placeholder = "Type your message to our agent…";
}

/* ---------- REQUEST HUMAN ---------- */
async function requestHuman() {
  if (isHumanMode) return;

  /* Wait up to 3 seconds for Firebase bridge to be ready */
  for (let i = 0; i < 30; i++) {
    if (window.__sgChat) break;
    await new Promise(r => setTimeout(r, 100));
  }

  if (!window.__sgChat) {
    addMessage("bot",
      "⚠️ Unable to connect to human support right now. Please email us at **info@swiftglobalogistics.com**",
      [], false, true);
    return;
  }

  const name = prompt("Please enter your name so our agent can assist you:");
  if (!name?.trim()) return;

  visitorName  = name.trim();
  isHumanMode  = true;
  sessionId    = genSessionId();
  /* FIX Bug #1 companion: replyStartMs is the watermark.
     Only replies with timestampMs > replyStartMs will be delivered.
     This prevents replaying any stale replies if session IDs collide. */
  replyStartMs = Date.now();

  setHumanUI();

  addMessage("bot",
    `✅ **You're now connected to human support!**\n\nHi **${escHtml(visitorName)}**! A member of our team will be with you shortly. You can also reach us at **info@swiftglobalogistics.com** 📧`,
    [], false, false
  );

  const historyMsgs = sessionMessages.filter(m =>
    m.role === "user" || m.role === "bot" || m.role === "agent"
  );

  try {
    await window.__sgChat.saveSession(sessionId, {
      id:          sessionId,
      visitorName: visitorName,
      page:        window.location.pathname,
      startTime:   new Date().toISOString(),
      lastActive:  new Date().toISOString(),
      isHuman:     true,
      status:      "waiting",
      messages:    historyMsgs,
      unread:      historyMsgs.filter(m => m.role === "user").length,
    });
  } catch (err) {
    console.error("[SwiftGlobal] Could not save session:", err);
  }

  persistState();
  startReplyListener();
}
window.requestHuman = requestHuman;

/* ============================================================
   REPLY LISTENER
   FIX Bug #1: Called with 3 args (sessionId, replyStartMs, cb)
               matching the restored firebase.js signature.
   FIX Bug #4: startReplyListener() is now also called on page
               load (via restoreAndReconnect) when isHumanMode
               is true, not only when the bubble is clicked.
   FIX Bug #5: deliveredReplyIds Set prevents the same reply from
               being shown twice if two tabs are open or the
               listener fires multiple times.
   ============================================================ */
function startReplyListener() {
  stopReplyListener();

  if (!window.__sgChat) {
    /* Firebase not ready yet — retry in 500ms */
    setTimeout(() => {
      if (isHumanMode && sessionId) startReplyListener();
    }, 500);
    return;
  }

  if (!sessionId) return;

  console.log("[SwiftGlobal] Starting reply listener, afterMs:", replyStartMs);

  /* FIX Bug #1: passing replyStartMs as the second argument.
     firebase.js listenReplies(sessionId, afterMs, cb) — 3 params. */
  unsubReplies = window.__sgChat.listenReplies(
    sessionId,
    replyStartMs,        /* afterMs watermark */
    (replies) => {       /* callback — now lands in the correct slot */

      replies.forEach(reply => {
        /* FIX Bug #5: skip if already delivered in this tab */
        if (!reply.id || deliveredReplyIds.has(reply.id)) return;
        if (!reply.content) return;

        deliveredReplyIds.add(reply.id);
        /* Update the watermark so page reloads don't re-deliver */
        if ((reply.timestampMs || 0) > replyStartMs) {
          replyStartMs = reply.timestampMs;
        }

        hideTyping();

        const statusEl = document.getElementById("chatHeaderStatus");
        if (statusEl) statusEl.textContent = "Connected — Human Support";

        /* Add to session messages for persistence */
        sessionMessages.push({
          role:    "agent",
          content: reply.content,
          time:    getTime(),
          id:      Date.now() + Math.random(),
        });

        addMessage("agent", reply.content, [], false, true);
        persistState();

        /* Show unread badge if chat window is closed */
        const chatWindow = document.getElementById("chatWindow");
        if (chatWindow && !chatWindow.classList.contains("open")) {
          unreadCount++;
          const badge = document.getElementById("chatUnreadBadge");
          if (badge) {
            badge.textContent   = unreadCount > 9 ? "9+" : unreadCount;
            badge.style.display = "flex";
          }
        }
      });
    }
  );
}

function stopReplyListener() {
  if (typeof unsubReplies === "function") {
    unsubReplies();
  }
  unsubReplies = null;
}

/* ---------- SWITCH BACK TO AI ---------- */
function switchBackToAI() {
  isHumanMode = false;
  stopReplyListener();
  clearState();

  const avatar = document.getElementById("chatHeaderAvatar");
  if (avatar) { avatar.innerHTML = '<i class="fa fa-robot"></i>'; avatar.style.cssText = ""; }
  const name = document.getElementById("chatHeaderName");
  if (name) name.textContent = "SwiftBot AI";
  const status = document.getElementById("chatHeaderStatus");
  if (status) status.textContent = "Online — SwiftGlobal Logistics";
  const banner = document.getElementById("chatHumanBanner");
  if (banner) banner.style.display = "none";
  const footer = document.getElementById("chatFooterText");
  if (footer) footer.textContent = "Powered by Groq AI";
  const bar = document.getElementById("chatHandoffBar");
  if (bar) bar.innerHTML = `
    <span class="chat-handoff-label">
      <i class="fa fa-robot"></i> Chatting with AI
    </span>
    <button class="chat-handoff-btn" onclick="requestHuman()">
      <i class="fa fa-user-headset"></i> Talk to a Human
    </button>`;
  const input = document.getElementById("chatInput");
  if (input) input.placeholder = "Ask me anything...";

  addMessage("bot",
    "🤖 You've been switched back to **SwiftBot AI**. How can I help you?",
    QUICK_REPLIES.general, false, true
  );
}
window.switchBackToAI = switchBackToAI;

/* ---------- QUICK REPLY ---------- */
function sendQuickReply(text) {
  const input = document.getElementById("chatInput");
  if (input) input.value = text;
  sendMessage();
}
window.sendQuickReply = sendQuickReply;

/* ---------- SEND MESSAGE ---------- */
async function sendMessage() {
  const input   = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendBtn");
  const text    = input?.value.trim();
  if (!text || isTyping) return;

  addMessage("user", text);
  if (input) { input.value = ""; input.style.height = "auto"; }

  /* ── HUMAN MODE ── */
  if (isHumanMode && sessionId) {
    const msgObj = {
      role:    "user",
      content: text,
      time:    getTime(),
      id:      Date.now() + Math.random(),
    };

    if (window.__sgChat) {
      try {
        await window.__sgChat.appendSessionMessage(sessionId, msgObj);
        await window.__sgChat.updateSession(sessionId, {
          status:     "waiting",
          unread:     999,
          lastActive: new Date().toISOString(),
        });
      } catch (err) {
        console.warn("[SwiftGlobal] Could not save message:", err);
      }
    }

    persistState();
    return;
  }

  /* ── AI MODE ── */
  chatHistory.push({ role: "user", content: text });
  isTyping = true;
  if (sendBtn) sendBtn.disabled = true;
  showTyping(false);

  try {
    const response = await fetch(CHATBOT_CONFIG.apiURL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        systemPrompt: SYSTEM_PROMPT,
        messages:     chatHistory.map(m => ({
          role:    m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const data  = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I could not process that request.";

    chatHistory.push({ role: "assistant", content: reply });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    const lo = (text + reply).toLowerCase();
    let qr   = QUICK_REPLIES.general;
    if (lo.includes("track")) qr = QUICK_REPLIES.tracking;
    else if (lo.includes("quote") || lo.includes("price") || lo.includes("cost")) qr = QUICK_REPLIES.quote;

    hideTyping();
    addMessage("bot", reply, qr);
    persistState();
  } catch (err) {
    console.error("[SwiftGlobal] Chatbot error:", err);
    hideTyping();
    addMessage("bot",
      "I'm having a small issue right now. Please try again or click **Talk to a Human** for immediate help! 🙂",
      QUICK_REPLIES.general
    );
  }

  isTyping = false;
  if (sendBtn) sendBtn.disabled = false;
  if (input) input.focus();
}

/* ---------- CLEAR CHAT ---------- */
function clearChat() {
  stopReplyListener();
  clearState();

  const msgs = document.getElementById("chatMessages");
  if (msgs) msgs.innerHTML = "";

  const avatar = document.getElementById("chatHeaderAvatar");
  if (avatar) { avatar.innerHTML = '<i class="fa fa-robot"></i>'; avatar.style.cssText = ""; }
  const name = document.getElementById("chatHeaderName");
  if (name) name.textContent = "SwiftBot AI";
  const status = document.getElementById("chatHeaderStatus");
  if (status) status.textContent = "Online — SwiftGlobal Logistics";
  const banner = document.getElementById("chatHumanBanner");
  if (banner) banner.style.display = "none";
  const footer = document.getElementById("chatFooterText");
  if (footer) footer.textContent = "Powered by Groq AI";
  const bar = document.getElementById("chatHandoffBar");
  if (bar) bar.innerHTML = `
    <span class="chat-handoff-label">
      <i class="fa fa-robot"></i> Chatting with AI
    </span>
    <button class="chat-handoff-btn" onclick="requestHuman()">
      <i class="fa fa-user-headset"></i> Talk to a Human
    </button>`;
  const input = document.getElementById("chatInput");
  if (input) input.placeholder = "Ask me anything...";

  showWelcomeMessage();
}

/* ---------- WELCOME MESSAGE ---------- */
function showWelcomeMessage() {
  setTimeout(() => {
    addMessage("bot",
      "👋 Hi there! I'm **SwiftBot**, your AI assistant for **SwiftGlobal Logistics**.\n\nI can help you with:\n• Tracking your parcel 📦\n• Getting a freight quote 💰\n• Learning about our services 🚢✈️🚛\n• Customs and warehousing info 📋\n\nOr click **\"Talk to a Human\"** below to chat with our team directly!",
      QUICK_REPLIES.greeting, false, true
    );
  }, 600);
}

/* ---------- RESTORE PREVIOUS CONVERSATION ---------- */
function restoreConversation() {
  if (!sessionMessages.length) return;

  const msgs = document.getElementById("chatMessages");
  if (!msgs) return;

  sessionMessages.forEach(m => {
    const isUser  = m.role === "user";
    const isAgent = m.role === "agent";
    const msgEl   = document.createElement("div");
    msgEl.className = `chat-msg ${isUser ? "user" : "bot"} ${isAgent ? "agent" : ""}`;
    const icon        = isUser ? "fa-user" : isAgent ? "fa-user-tie" : "fa-robot";
    const avatarStyle = isAgent ? 'style="background:var(--chat-success);color:#fff;"' : "";
    msgEl.innerHTML = `
      <div class="chat-msg-avatar" ${avatarStyle}><i class="fa ${icon}"></i></div>
      <div class="chat-msg-content">
        ${isAgent ? '<span class="chat-agent-label">Support Agent</span>' : ""}
        <div class="chat-msg-bubble">${isUser ? escHtml(m.content) : fmtMsg(m.content)}</div>
        <div class="chat-msg-time">${m.time || ""}</div>
      </div>`;
    msgs.appendChild(msgEl);
  });

  if (isHumanMode) setHumanUI();
  scrollBottom();
}

/* ============================================================
   FIX Bug #4: Reconnect reply listener immediately on page load
   if the visitor was already in human mode.
   Previously the listener only started when the bubble was
   clicked. If the visitor navigated while waiting for a reply,
   the listener was never established on the new page and replies
   were silently dropped.
   ============================================================ */
function restoreAndReconnect() {
  if (!isHumanMode || !sessionId) return;

  /* Start the listener immediately — don't wait for bubble click */
  if (window.__sgChat) {
    startReplyListener();
  } else {
    /* Firebase bridge not ready yet — wait for it */
    const interval = setInterval(() => {
      if (window.__sgChat) {
        clearInterval(interval);
        startReplyListener();
      }
    }, 100);
    /* Give up after 5 seconds */
    setTimeout(() => clearInterval(interval), 5000);
  }
}

/* ---------- INIT ---------- */
function initChatbot() {
  if (chatInitialized) return;
  chatInitialized = true;

  const hasHistory = restoreState();

  /* FIX Bug #4: reconnect listener immediately on page load */
  restoreAndReconnect();

  const container = document.createElement("div");
  container.id    = "swiftbotContainer";
  container.innerHTML = buildChatHTML();
  document.body.appendChild(container);

  if (!document.querySelector('link[href*="chatbot.css"]')) {
    const link = document.createElement("link");
    link.rel   = "stylesheet";
    link.href  = (window.location.pathname.includes("/pages/") ? "../" : "") + "css/chatbot.css";
    document.head.appendChild(link);
  }

  const bubbleBtn  = document.getElementById("chatBubbleBtn");
  const chatWindow = document.getElementById("chatWindow");
  const input      = document.getElementById("chatInput");
  const sendBtn    = document.getElementById("chatSendBtn");

  bubbleBtn?.addEventListener("click", () => {
    const isOpen = chatWindow.classList.toggle("open");
    bubbleBtn.classList.toggle("open", isOpen);
    const icon = document.getElementById("chatBubbleIcon");
    if (icon) icon.className = isOpen ? "fa fa-times" : "fa fa-comment-dots";

    if (isOpen) {
      unreadCount = 0;
      const badge = document.getElementById("chatUnreadBadge");
      if (badge) badge.style.display = "none";

      const msgs = document.getElementById("chatMessages");
      if (msgs && !msgs.children.length) {
        if (hasHistory) {
          restoreConversation();
        } else {
          showWelcomeMessage();
        }
      }
      setTimeout(() => input?.focus(), 300);
    }
  });

  document.getElementById("chatCloseBtn")?.addEventListener("click", () => {
    chatWindow?.classList.remove("open");
    bubbleBtn?.classList.remove("open");
    const icon = document.getElementById("chatBubbleIcon");
    if (icon) icon.className = "fa fa-comment-dots";
  });

  document.getElementById("chatClearBtn")?.addEventListener("click", clearChat);
  sendBtn?.addEventListener("click", sendMessage);

  input?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  input?.addEventListener("input", () => {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
    if (isHumanMode && sessionId && window.__sgChat) {
      window.__sgChat.updateSession(sessionId, { visitorTyping: Date.now() })
        .catch(() => {});
    }
  });

  /* Auto unread bubble after 15s */
  setTimeout(() => {
    const cw    = document.getElementById("chatWindow");
    const badge = document.getElementById("chatUnreadBadge");
    if (cw && !cw.classList.contains("open") && badge && unreadCount === 0) {
      unreadCount = 1;
      badge.textContent   = "1";
      badge.style.display = "flex";
    }
  }, 15000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChatbot);
} else {
  initChatbot();
}