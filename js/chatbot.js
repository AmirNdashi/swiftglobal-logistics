////////////// chatbot.js //////////////////////////////
/* ============================================
   SWIFTGLOBAL LOGISTICS — AI + HUMAN CHATBOT
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
let sessionMessages = []; /* all messages shown in chat (for session save) */
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
function fb() { 
  return window.__sgChat || null; 
}

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
    return sessionMessages.length > 0;
  } catch (e) { 
    return false; 
  }
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
          placeholder="Ask me anything..." rows="1" aria-label="Type your message"></textarea>
        <button class="chat-send-btn" id="chatSendBtn">
          <i class="fa fa-paper-plane"></i>
        </button>
      </div>

      <div class="chat-footer">
        <span id="chatFooterText">Powered by Groq AI</span>
        &nbsp;·&nbsp;
        SwiftGlobal Logistics
      </div>
    </div>`;
}

/* ---------- ADD MESSAGE TO UI ---------- */
function addMessage(role, content, quickReplies = [], isSystem = false, skipSave = false, msgId = null) {
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

  /* Track in sessionMessages using original DB ID or a stable fall-back to prevent cross-page duplication loop */
  if (!skipSave && !isSystem) {
    sessionMessages.push({ 
      role, 
      content, 
      time: getTime(), 
      id: msgId || (Date.now() + Math.random()) 
    });
    persistState();
  }

  /* Unread badge logic when window is closed or tucked away */
  if (!isUser && !document.getElementById("chatWindow").classList.contains("open")) {
    unreadCount++;
    const badge = document.getElementById("chatUnreadBadge");
    if (badge) {
      badge.textContent = unreadCount > 9 ? "9+" : unreadCount;
      badge.style.display = "flex";
    }
  }
}

/* ---------- TYPING INDICATOR ---------- */
function showTyping(isAgent = false) {
  const msgs = document.getElementById("chatMessages");
  if (!msgs || document.getElementById("chatTyping")) return;
  
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

function hideTyping() { 
  document.getElementById("chatTyping")?.remove(); 
}

/* ---------- SWITCH TO HUMAN UI ---------- */
function setHumanUI() {
  const avatar = document.getElementById("chatHeaderAvatar");
  if (avatar) {
    avatar.innerHTML = '<i class="fa fa-user-headset"></i>';
    avatar.style.cssText = "background:rgba(56,161,105,0.2);border-color:var(--chat-success);color:var(--chat-success);";
  }
  
  const headerName = document.getElementById("chatHeaderName");
  if (headerName) headerName.textContent = "Human Support";
  
  const statusText = document.getElementById("chatHeaderStatus");
  if (statusText) statusText.textContent = "Connected — Human Support";
  
  const banner = document.getElementById("chatHumanBanner");
  if (banner) banner.style.display = "flex";
  
  const footerText = document.getElementById("chatFooterText");
  if (footerText) footerText.textContent = "Live Human Support";
  
  const handoffBar = document.getElementById("chatHandoffBar");
  if (handoffBar) {
    handoffBar.innerHTML = `
      <span class="chat-handoff-label" style="color:var(--chat-success);">
        <i class="fa fa-user-headset"></i> Connected to Human Support
      </span>
      <button class="chat-handoff-btn chat-handoff-btn--ai" onclick="switchBackToAI()">
        <i class="fa fa-robot"></i> Back to AI
      </button>`;
  }
  
  const input = document.getElementById("chatInput");
  if (input) input.placeholder = `Type your message to our agent…`;
}

/* ---------- REQUEST HUMAN ---------- */
async function requestHuman() {
  if (isHumanMode) return;

  /* Polling loop for async initialization safety */
  for (let i = 0; i < 30; i++) {
    if (window.__sgChat) break;
    await new Promise(r => setTimeout(r, 100));
  }

  const name = prompt('Please enter your name so our agent can assist you:');
  if (!name?.trim()) return;

  visitorName  = name.trim();
  isHumanMode  = true;
  sessionId    = genSessionId();
  replyStartMs = Date.now();
  setHumanUI();

  addMessage('bot',
    `✅ **You're now connected to human support!**\n\nHi **${escHtml(visitorName)}**! A member of our team will be with you shortly. You can also reach us at **info@swiftglobalogistics.com** 📧`,
    [], false, false
  );

  const historyMsgs = sessionMessages.filter(m =>
    m.role === 'user' || m.role === 'bot' || m.role === 'agent'
  );

  const sessionData = {
    id:          sessionId,
    visitorName: visitorName,
    page:        window.location.pathname,
    startTime:   new Date().toISOString(),
    lastActive:  new Date().toISOString(),
    isHuman:     true,
    status:      'waiting',
    messages:    historyMsgs,
    unread:      historyMsgs.filter(m => m.role === 'user').length,
    newRequest:  true,
  };

  if (window.__sgChat) {
    try {
      await window.__sgChat.saveSession(sessionId, sessionData);
      console.log('Session saved to Firebase ✅');
    } catch (err) {
      console.error('Could not save session:', err);
    }
  }

  persistState();
  startReplyListener();
}
window.requestHuman = requestHuman;

/* ---------- REPLY LISTENER ---------- */
function startReplyListener() {
  stopReplyListener();
  if (!window.__sgChat || !sessionId) return;

  console.log('Starting reply listener for session:', sessionId);

  /* Collect previously loaded message IDs to shield against UI repetition */
  const receivedReplyIds = new Set();
  sessionMessages.forEach(m => {
    if (m.id) receivedReplyIds.add(m.id);
  });

  /* Utilize tracked chronological cursor timestamp safely */
  unsubReplies = window.__sgChat.listenReplies(
    sessionId,
    replyStartMs || 0,
    replies => {
      if (!replies) return;
      replies.forEach(reply => {
        if (receivedReplyIds.has(reply.id)) return;
        receivedReplyIds.add(reply.id);

        if (!reply.content) return;

        hideTyping();

        const statusText = document.getElementById('chatHeaderStatus');
        if (statusText) statusText.textContent = 'Connected — Human Support';

        addMessage(
          'agent',
          reply.content,
          [],
          false,
          false,
          reply.id // Pass database primary key explicitly
        );

        /* Update cursor to latest reply timestamp for cross-page continuity */
        if (reply.timestampMs && reply.timestampMs > replyStartMs) {
          replyStartMs = reply.timestampMs;
          persistState();
        }
      });
    }
  );
}

function stopReplyListener() {
  if (unsubReplies) { 
    unsubReplies(); 
    unsubReplies = null; 
  }
}

/* ---------- ASYNC LISTENER BINDER FOR NAVIGATIONS ---------- */
async function ensureReplyListener() {
  if (!isHumanMode || !sessionId) return;
  for (let i = 0; i < 40; i++) {
    if (window.__sgChat) break;
    await new Promise(r => setTimeout(r, 150));
  }
  if (window.__sgChat) {
    startReplyListener();
  }
}

/* ---------- SWITCH BACK TO AI ---------- */
function switchBackToAI() {
  isHumanMode = false;
  stopReplyListener();
  clearState();
  
  const avatar = document.getElementById("chatHeaderAvatar");
  if (avatar) {
    avatar.innerHTML = '<i class="fa fa-robot"></i>';
    avatar.style.cssText = "";
  }
  
  document.getElementById("chatHeaderName").textContent   = "SwiftBot AI";
  document.getElementById("chatHeaderStatus").textContent = "Online — SwiftGlobal Logistics";
  document.getElementById("chatHumanBanner").style.display = "none";
  document.getElementById("chatFooterText").textContent   = "Powered by Groq AI";
  
  const handoffBar = document.getElementById("chatHandoffBar");
  if (handoffBar) {
    handoffBar.innerHTML = `
      <span class="chat-handoff-label">
        <i class="fa fa-robot"></i> Chatting with AI
      </span>
      <button class="chat-handoff-btn" onclick="requestHuman()">
        <i class="fa fa-user-headset"></i> Talk to a Human
      </button>`;
  }
  
  const input = document.getElementById("chatInput");
  if (input) input.placeholder = "Ask me anything...";

  document.getElementById("chatMessages").innerHTML = "";
  addMessage("bot",
    "🤖 You've been switched back to **SwiftBot AI**. How can I help you?",
    QUICK_REPLIES.general, false, true
  );
}
window.switchBackToAI = switchBackToAI;

/* ---------- QUICK REPLY ---------- */
function sendQuickReply(text) {
  const input = document.getElementById("chatInput");
  if (input) {
    input.value = text;
    sendMessage();
  }
}
window.sendQuickReply = sendQuickReply;

/* ---------- SEND MESSAGE ---------- */
async function sendMessage() {
  const input   = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendBtn");
  if (!input || !sendBtn) return;

  const text    = input.value.trim();
  if (!text || isTyping) return;

  addMessage("user", text);
  input.value        = "";
  input.style.height = "auto";

  /* ── HUMAN MODE ── */
  if (isHumanMode && sessionId) {
    const msgObj = {
      role:    'user',
      content: text,
      time:    getTime(),
      id:      Date.now() + Math.random(),
    };
    if (window.__sgChat) {
      try {
        await window.__sgChat.appendSessionMessage(sessionId, msgObj);
        await window.__sgChat.updateSession(sessionId, {
          status:    'waiting',
          unread:    999,
          lastActive: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Could not save message:', err);
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
    if (lo.includes("track")) qr = QUICK_REPLIES.tracking;
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

  const msgs = document.getElementById("chatMessages");
  if (msgs) msgs.innerHTML = "";
  
  document.getElementById("chatHeaderName").textContent   = "SwiftBot AI";
  document.getElementById("chatHeaderStatus").textContent = "Online — SwiftGlobal Logistics";
  document.getElementById("chatHumanBanner").style.display = "none";
  
  const avatar = document.getElementById("chatHeaderAvatar");
  if (avatar) {
    avatar.innerHTML   = '<i class="fa fa-robot"></i>';
    avatar.style.cssText = "";
  }
  
  const handoffBar = document.getElementById("chatHandoffBar");
  if (handoffBar) {
    handoffBar.innerHTML = `
      <span class="chat-handoff-label">
        <i class="fa fa-robot"></i> Chatting with AI
      </span>
      <button class="chat-handoff-btn" onclick="requestHuman()">
        <i class="fa fa-user-headset"></i> Talk to a Human
      </button>`;
  }
  
  const input = document.getElementById("chatInput");
  if (input) input.placeholder = "Ask me anything...";
  
  document.getElementById("chatFooterText").textContent = "Powered by Groq AI";

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
  
  msgs.innerHTML = ""; /* Purge node space to prevent background rendering overlaps */
  
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

  if (isHumanMode) {
    setHumanUI();
  }
  scrollBottom();
}

/* ---------- INIT ---------- */
function initChatbot() {
  if (chatInitialized) return;
  chatInitialized = true;

  const hasHistory = restoreState();

  const container = document.createElement("div");
  container.id = "swiftbotContainer";
  container.innerHTML = buildChatHTML();
  document.body.appendChild(container);

  if (!document.querySelector('link[href*="chatbot.css"]')) {
    const link = document.createElement("link");
    link.rel   = "stylesheet";
    link.href  = (window.location.pathname.includes("/pages/") ? "../" : "") + "css/chatbot.css";
    document.head.appendChild(link);
  }

  /* Structural Fix: Instantiate dialogue structures onto the DOM immediately on page mount */
  if (hasHistory) {
    restoreConversation();
  }

  /* Structural Fix: Activate background listener instantly on page load if session is human */
  if (isHumanMode && sessionId) {
    ensureReplyListener();
  }

  const bubbleBtn  = document.getElementById("chatBubbleBtn");
  const chatWindow = document.getElementById("chatWindow");
  const input      = document.getElementById("chatInput");
  const sendBtn    = document.getElementById("chatSendBtn");

  bubbleBtn.addEventListener("click", () => {
    const isOpen = chatWindow.classList.toggle("open");
    bubbleBtn.classList.toggle("open", isOpen);
    document.getElementById("chatBubbleIcon").className = isOpen ? "fa fa-times" : "fa fa-comment-dots";

    if (isOpen) {
      unreadCount = 0;
      const badge = document.getElementById("chatUnreadBadge");
      if (badge) {
        badge.textContent = "0";
        badge.style.display = "none";
      }

      const msgs = document.getElementById("chatMessages");
      if (!msgs.children.length && !hasHistory) {
        showWelcomeMessage();
      }
      scrollBottom();
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
    if (isHumanMode && sessionId && fb()) {
      fb().updateSession(sessionId, { visitorTyping: Date.now() }).catch(() => {});
    }
  });

  setTimeout(() => {
    if (!chatWindow.classList.contains("open") && !hasHistory) {
      unreadCount = 1;
      const badge = document.getElementById("chatUnreadBadge");
      if (badge) {
        badge.textContent   = "1";
        badge.style.display = "flex";
      }
    }
  }, 15000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChatbot);
} else {
  initChatbot();
}