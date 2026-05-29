/* ============================================
   SWIFTGLOBAL LOGISTICS — AI + HUMAN CHATBOT
   v2 — Firebase fixes:
   - Visitor messages now correctly saved to Firestore
   - Session + history persisted in sessionStorage (survives page refresh)
   - Admin replies received via Firestore onSnapshot (no polling)
   - Removed random "message received" spam
   - "Connecting to agent" resolves once session is saved

   HOW TO LOAD ON PUBLIC PAGES:
   <script type="module">
     import { saveSession, updateSession, appendSessionMessage, addReply, listenReplies }
       from "./admin/firebase.js";
     window.__sgChat = { saveSession, updateSession, appendSessionMessage, addReply, listenReplies };
   </script>
   <script src="js/chatbot.js" defer></script>

   Adjust the import path if the page is in a subfolder:
     from "../admin/firebase.js"
   ============================================ */

/* ---------- CONFIG ---------- */
const CHATBOT_CONFIG = {
  apiURL:    "https://swiftglobal-ai.swiftglobal.workers.dev",
  maxTokens: 500,
};

const SYSTEM_PROMPT = `You are SwiftBot, the friendly and professional AI assistant for SwiftGlobal Logistics. You help visitors with questions about the company's services, pricing, tracking, and logistics needs.

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
  sessionId:   "sg_chat_sessionId",
  visitorName: "sg_chat_visitorName",
  isHuman:     "sg_chat_isHuman",
  history:     "sg_chat_history",
  messages:    "sg_chat_messages",  /* rendered messages for UI restore */
  replyMark:   "sg_chat_replyMark",
};

/* ---------- STATE ---------- */
let chatHistory     = [];
let sessionMessages = [];   /* all messages shown in chat (for session save) */
let isTyping        = false;
let chatInitialized = false;
let unreadCount     = 0;
let isHumanMode     = false;
let sessionId       = null;
let visitorName     = "";
let replyStartMs    = 0;
let unsubReplies    = null;

const QUICK_REPLIES = {
  greeting: ["Track a parcel 📦", "Get a quote 💰", "Sea Freight 🚢", "Air Freight ✈️"],
  tracking: ["Go to tracking page", "Which carriers?", "Tracking not working"],
  quote:    ["Sea Freight quote", "Air Freight quote", "Land Freight quote", "Customs help"],
  general:  ["Tell me about services", "How to contact you?", "Track my parcel", "Get a quote"],
};

/* ---------- FIREBASE HELPERS (via window bridge) ---------- */
function fb() { return window.__sgChat || null; }

/* ---------- SESSION PERSISTENCE ---------- */
function persistState() {
  try {
    sessionStorage.setItem(SS.sessionId,   sessionId   || "");
    sessionStorage.setItem(SS.visitorName, visitorName || "");
    sessionStorage.setItem(SS.isHuman,     isHumanMode ? "1" : "0");
    sessionStorage.setItem(SS.history,     JSON.stringify(chatHistory));
    sessionStorage.setItem(SS.messages,    JSON.stringify(sessionMessages));
    sessionStorage.setItem(SS.replyMark,   String(replyStartMs));
  } catch (e) { /* sessionStorage full or private mode */ }
}

function restoreState() {
  try {
    sessionId    = sessionStorage.getItem(SS.sessionId)   || null;
    visitorName  = sessionStorage.getItem(SS.visitorName) || "";
    isHumanMode  = sessionStorage.getItem(SS.isHuman)     === "1";
    replyStartMs = parseInt(sessionStorage.getItem(SS.replyMark) || "0");
    const h = sessionStorage.getItem(SS.history);
    const m = sessionStorage.getItem(SS.messages);
    chatHistory     = h ? JSON.parse(h) : [];
    sessionMessages = m ? JSON.parse(m) : [];
    return sessionMessages.length > 0; /* true = we have something to restore */
  } catch (e) { return false; }
}

function clearState() {
  Object.values(SS).forEach(k => sessionStorage.removeItem(k));
  chatHistory     = [];
  sessionMessages = [];
  sessionId       = null;
  visitorName     = "";
  isHumanMode     = false;
  replyStartMs    = 0;
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

  /* Track in sessionMessages for persistence (skip system/AI-only messages) */
  if (!skipSave && !isSystem) {
    sessionMessages.push({ role, content, time: getTime(), id: Date.now() + Math.random() });
    persistState();
  }

  /* Unread badge when window is closed */
  if (!isUser && !document.getElementById("chatWindow").classList.contains("open")) {
    unreadCount++;
    const badge = document.getElementById("chatUnreadBadge");
    badge.textContent = unreadCount > 9 ? "9+" : unreadCount;
    badge.style.display = "flex";
  }
}

/* ---------- TYPING INDICATOR ---------- */
function showTyping(isAgent = false) {
  const msgs = document.getElementById("chatMessages");
  const el   = document.createElement("div");
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

/* ---------- SWITCH TO HUMAN UI ---------- */
function setHumanUI() {
  document.getElementById("chatHeaderAvatar").innerHTML  = '<i class="fa fa-user-headset"></i>';
  document.getElementById("chatHeaderAvatar").style.cssText =
    "background:rgba(56,161,105,0.2);border-color:var(--chat-success);color:var(--chat-success);";
  document.getElementById("chatHeaderName").textContent   = "Human Support";
  document.getElementById("chatHeaderStatus").textContent = "Connected — Human Support";
  document.getElementById("chatHumanBanner").style.display = "flex";
  document.getElementById("chatFooterText").textContent   = "Live Human Support";
  document.getElementById("chatHandoffBar").innerHTML = `
    <span class="chat-handoff-label" style="color:var(--chat-success);">
      <i class="fa fa-user-headset"></i> Connected to Human Support
    </span>
    <button class="chat-handoff-btn chat-handoff-btn--ai" onclick="switchBackToAI()">
      <i class="fa fa-robot"></i> Back to AI
    </button>`;
  document.getElementById("chatInput").placeholder =
    `Type your message to our agent…`;
}

/* ---------- REQUEST HUMAN ---------- */
async function requestHuman() {
  if (isHumanMode) return;

  const name = prompt("Please enter your name so our agent can assist you:");
  if (!name?.trim()) return;

  visitorName  = name.trim();
  isHumanMode  = true;
  sessionId    = genSessionId();
  replyStartMs = Date.now();

  setHumanUI();

  /* Confirmation message to visitor */
  addMessage("bot",
    `✅ **You're now connected to human support!**\n\nHi **${escHtml(visitorName)}**! A member of our team will be with you shortly. You can also reach us at **info@swiftglobalogistics.com** 📧`,
    [], false, false
  );

  /* Collect ONLY user messages from rendered chat (not bot/system) */
  const historyMsgs = sessionMessages.filter(m => m.role === "user" || m.role === "agent");

  /* Save session to Firestore */
  if (fb()) {
    await fb().saveSession(sessionId, {
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
  }

  persistState();

  /* Start Firestore reply listener */
  startReplyListener();
}

window.requestHuman = requestHuman;

/* ---------- REPLY LISTENER (Firestore onSnapshot) ---------- */
function startReplyListener() {
  stopReplyListener();
  if (!fb() || !sessionId) return;

  unsubReplies = fb().listenReplies(sessionId, replyStartMs, replies => {
    replies.forEach(reply => {
      hideTyping();
      document.getElementById("chatHeaderStatus").textContent = "Connected — Human Support";

      /* Add agent reply to UI and persist it */
      const msgObj = { role: "agent", content: reply.content, time: getTime(), id: Date.now() + Math.random() };
      sessionMessages.push(msgObj);

      addMessage("agent", reply.content, [], false, true /* skip double-save */);
      replyStartMs = reply.timestampMs;
      persistState();
    });
  });
}

function stopReplyListener() {
  if (unsubReplies) { unsubReplies(); unsubReplies = null; }
}

/* ---------- SWITCH BACK TO AI ---------- */
function switchBackToAI() {
  isHumanMode = false;
  stopReplyListener();
  clearState();

  document.getElementById("chatHeaderAvatar").innerHTML  = '<i class="fa fa-robot"></i>';
  document.getElementById("chatHeaderAvatar").style.cssText = "";
  document.getElementById("chatHeaderName").textContent  = "SwiftBot AI";
  document.getElementById("chatHeaderStatus").textContent = "Online — SwiftGlobal Logistics";
  document.getElementById("chatHumanBanner").style.display = "none";
  document.getElementById("chatFooterText").textContent  = "Powered by Groq AI";
  document.getElementById("chatHandoffBar").innerHTML = `
    <span class="chat-handoff-label">
      <i class="fa fa-robot"></i> Chatting with AI
    </span>
    <button class="chat-handoff-btn" onclick="requestHuman()">
      <i class="fa fa-user-headset"></i> Talk to a Human
    </button>`;
  document.getElementById("chatInput").placeholder = "Ask me anything...";

  addMessage("bot",
    "🤖 You've been switched back to **SwiftBot AI**. How can I help you?",
    QUICK_REPLIES.general, false, true
  );
}
window.switchBackToAI = switchBackToAI;

/* ---------- QUICK REPLY ---------- */
function sendQuickReply(text) {
  document.getElementById("chatInput").value = text;
  sendMessage();
}
window.sendQuickReply = sendQuickReply;

/* ---------- SEND MESSAGE ---------- */
async function sendMessage() {
  const input   = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendBtn");
  const text    = input.value.trim();
  if (!text || isTyping) return;

  addMessage("user", text);
  input.value        = "";
  input.style.height = "auto";

  /* ── HUMAN MODE ── */
  if (isHumanMode && sessionId) {
    /* Build message object */
    const msgObj = {
      role:    "user",
      content: text,
      time:    getTime(),
      id:      Date.now() + Math.random(),
    };

    /* Append to Firestore session atomically so admin sees it immediately */
    if (fb()) {
      try {
        await fb().appendSessionMessage(sessionId, msgObj);
        /* Also update status back to waiting so admin badge lights up */
        await fb().updateSession(sessionId, {
          status:    "waiting",
          unread:    999, /* admin resets this to 0 when they open the session */
        });
      } catch (err) {
        console.warn("Could not save message to Firestore:", err);
      }
    }

    persistState();
    return;
  }

  /* ── AI MODE ── */
  chatHistory.push({ role: "user", content: text });
  isTyping = true;
  sendBtn.disabled = true;
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
    let qr = QUICK_REPLIES.general;
    if (lo.includes("track"))                                       qr = QUICK_REPLIES.tracking;
    else if (lo.includes("quote") || lo.includes("price") || lo.includes("cost")) qr = QUICK_REPLIES.quote;

    hideTyping();
    addMessage("bot", reply, qr);
    persistState();
  } catch (err) {
    console.error("Chatbot error:", err);
    hideTyping();
    addMessage("bot",
      "I'm having a small issue right now. Please try again or click **Talk to a Human** for immediate help! 🙂",
      QUICK_REPLIES.general
    );
  }

  isTyping         = false;
  sendBtn.disabled = false;
  input.focus();
}

/* ---------- CLEAR CHAT ---------- */
function clearChat() {
  stopReplyListener();
  clearState();

  document.getElementById("chatMessages").innerHTML = "";
  document.getElementById("chatHeaderName").textContent   = "SwiftBot AI";
  document.getElementById("chatHeaderStatus").textContent = "Online — SwiftGlobal Logistics";
  document.getElementById("chatHumanBanner").style.display = "none";
  document.getElementById("chatHeaderAvatar").innerHTML   = '<i class="fa fa-robot"></i>';
  document.getElementById("chatHeaderAvatar").style.cssText = "";
  document.getElementById("chatHandoffBar").innerHTML = `
    <span class="chat-handoff-label">
      <i class="fa fa-robot"></i> Chatting with AI
    </span>
    <button class="chat-handoff-btn" onclick="requestHuman()">
      <i class="fa fa-user-headset"></i> Talk to a Human
    </button>`;
  document.getElementById("chatInput").placeholder = "Ask me anything...";
  document.getElementById("chatFooterText").textContent = "Powered by Groq AI";

  showWelcomeMessage();
}

/* ---------- WELCOME MESSAGE ---------- */
function showWelcomeMessage() {
  setTimeout(() => {
    addMessage("bot",
      "👋 Hi there! I'm **SwiftBot**, your AI assistant for **SwiftGlobal Logistics**.\n\nI can help you with:\n• Tracking your parcel 📦\n• Getting a freight quote 💰\n• Learning about our services 🚢✈️🚛\n• Customs and warehousing info 📋\n\nOr click **\"Talk to a Human\"** below to chat with our team directly!",
      QUICK_REPLIES.greeting, false, true /* skipSave — welcome is not a real message */
    );
  }, 600);
}

/* ---------- RESTORE PREVIOUS CONVERSATION ---------- */
function restoreConversation() {
  if (!sessionMessages.length) return;

  const msgs = document.getElementById("chatMessages");
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

  /* Restore human mode UI if needed */
  if (isHumanMode) {
    setHumanUI();
    startReplyListener();
  }

  scrollBottom();
}

/* ---------- INIT ---------- */
function initChatbot() {
  if (chatInitialized) return;
  chatInitialized = true;

  /* Try to restore previous session */
  const hasHistory = restoreState();

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

  bubbleBtn.addEventListener("click", () => {
    const isOpen = chatWindow.classList.toggle("open");
    bubbleBtn.classList.toggle("open", isOpen);
    document.getElementById("chatBubbleIcon").className =
      isOpen ? "fa fa-times" : "fa fa-comment-dots";

    if (isOpen) {
      unreadCount = 0;
      document.getElementById("chatUnreadBadge").style.display = "none";

      const msgs = document.getElementById("chatMessages");
      if (!msgs.children.length) {
        if (hasHistory) {
          restoreConversation();
        } else {
          showWelcomeMessage();
        }
      }
      setTimeout(() => input.focus(), 300);
    }
  });

  document.getElementById("chatCloseBtn").addEventListener("click", () => {
    chatWindow.classList.remove("open");
    bubbleBtn.classList.remove("open");
    document.getElementById("chatBubbleIcon").className = "fa fa-comment-dots";
  });

  document.getElementById("chatClearBtn").addEventListener("click", clearChat);
  sendBtn.addEventListener("click", sendMessage);

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
    /* Notify Firestore that visitor is typing */
    if (isHumanMode && sessionId && fb()) {
      fb().updateSession(sessionId, { visitorTyping: Date.now() })
        .catch(() => {});
    }
  });

  /* Auto unread bubble after 15s if chat not opened */
  setTimeout(() => {
    if (!chatWindow.classList.contains("open")) {
      unreadCount = 1;
      const badge = document.getElementById("chatUnreadBadge");
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