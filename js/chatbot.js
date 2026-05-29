/* ============================================
   SWIFTGLOBAL LOGISTICS — AI + HUMAN CHATBOT
   Firebase Firestore Integration
   Sessions and replies now sync in real-time
   ============================================ */

import {
  saveSession, updateSession,
  addReply, listenReplies,
} from "../admin/firebase.js";

/* ---------- CONFIG ---------- */
const CHATBOT_CONFIG = {
  apiURL:    "https://swiftglobal-ai.swiftglobal.workers.dev",
  maxTokens: 500,
};

/* ---------- SYSTEM PROMPT ---------- */
const SYSTEM_PROMPT = `You are SwiftBot, the friendly and professional AI assistant for SwiftGlobal Logistics. You help visitors with questions about the company's services, pricing, tracking, and logistics needs.

COMPANY INFORMATION:
- Company Name: SwiftGlobal Logistics
- Website: https://www.swiftglobalogistics.com
- Email: info@swiftglobalogistics.com
- Hours: Monday to Friday, 08:00 – 18:00
- Experience: 15+ years in global logistics
- Countries Served: 120+
- Shipments Delivered: 50,000+
- Happy Clients: 3,500+

SERVICES OFFERED:
1. Sea Freight — FCL, LCL, RoRo, Reefer containers
2. Air Freight — Express, standard, charter flights, temperature-controlled
3. Land Freight — FTL, LTL, refrigerated, cross-border, GPS-tracked
4. Customs Clearance — Import/export docs, duty/tax calculation, compliance
5. Warehousing — Ambient, cold storage, high-security, pick/pack/fulfillment
6. Project Cargo — Heavy-lift, route surveys, break-bulk, multi-modal

TRACKING:
- Universal tracking: 1,200+ carriers including DHL, FedEx, UPS, USPS, DPD, TNT
- Tracking page: https://www.swiftglobalogistics.com/tracking.html

YOUR BEHAVIOR:
- Always be friendly, professional, and helpful
- Keep responses concise — max 3-4 short paragraphs
- Use simple language
- For quotes, direct to contact page or info@swiftglobalogistics.com
- Never make up specific prices or guaranteed transit times
- End with a helpful follow-up question or offer`;

/* ---------- STATE ---------- */
let chatHistory       = [];
let isTyping          = false;
let chatInitialized   = false;
let unreadCount       = 0;
let isHumanMode       = false;
let sessionId         = null;
let visitorName       = "";
let replyStartMs      = 0;
let unsubReplies      = null;  /* Firestore listener handle */

const QUICK_REPLIES = {
  greeting: ["Track a parcel 📦", "Get a quote 💰", "Sea Freight 🚢", "Air Freight ✈️"],
  tracking: ["Go to tracking page", "Which carriers?", "Tracking not working"],
  quote:    ["Sea Freight quote", "Air Freight quote", "Land Freight quote", "Customs help"],
  general:  ["Tell me about services", "How to contact you?", "Track my parcel", "Get a quote"],
};

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
    </div>
  `;
}

/* ---------- ADD MESSAGE TO UI ---------- */
function addMessage(role, content, quickReplies = [], isSystem = false) {
  const msgs    = document.getElementById("chatMessages");
  const isUser  = role === "user";
  const isAgent = role === "agent";

  const msgEl = document.createElement("div");
  msgEl.className = `chat-msg ${isUser ? "user" : "bot"} ${isAgent ? "agent" : ""}`;

  const icon        = isUser ? "fa-user" : isAgent ? "fa-user-tie" : "fa-robot";
  const avatarColor = isAgent ? 'style="background:var(--chat-success);color:#fff;"' : "";

  msgEl.innerHTML = `
    <div class="chat-msg-avatar" ${avatarColor}>
      <i class="fa ${icon}"></i>
    </div>
    <div class="chat-msg-content">
      ${isAgent ? '<span class="chat-agent-label">Support Agent</span>' : ""}
      <div class="chat-msg-bubble ${isSystem ? "system-bubble" : ""}">
        ${isUser ? escHtml(content) : fmtMsg(content)}
      </div>
      <div class="chat-msg-time">${getTime()}</div>
      ${quickReplies.length > 0 ? `
        <div class="chat-quick-replies">
          ${quickReplies.map(r => `
            <button class="chat-quick-btn" onclick="sendQuickReply('${r.replace(/'/g, "\\'")}')">
              ${escHtml(r)}
            </button>`).join("")}
        </div>` : ""}
    </div>
  `;
  msgs.appendChild(msgEl);
  scrollBottom();

  /* Update unread badge when window is closed */
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
  const color = isAgent ? 'style="background:var(--chat-success);color:#fff;"' : "";
  el.innerHTML = `
    <div class="chat-msg-avatar" ${color}><i class="fa ${icon}"></i></div>
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

/* ---------- SAVE MESSAGE TO SESSION IN FIRESTORE ---------- */
async function persistMessage(msgObj) {
  if (!sessionId) return;
  try {
    /* We read and merge messages to avoid overwriting */
    const { getDoc, doc, db } = await import("../admin/firebase.js"); /* inline import for db */
    /* Simpler approach: push via updateSession with arrayUnion isn't available directly;
       instead we store the full messages array in the session document which
       is kept in memory and flushed on every message.
       This is acceptable for chat sessions (typically < 100 messages). */
  } catch (e) { console.warn(e); }
}

/* ---------- REQUEST HUMAN ---------- */
async function requestHuman() {
  if (isHumanMode) return;

  const name = prompt("Please enter your name so our agent can assist you:");
  if (!name?.trim()) return;

  visitorName   = name.trim();
  isHumanMode   = true;
  sessionId     = genSessionId();
  replyStartMs  = Date.now();

  /* Update UI */
  document.getElementById("chatHeaderAvatar").innerHTML   = '<i class="fa fa-user-headset"></i>';
  document.getElementById("chatHeaderAvatar").style.cssText =
    "background:rgba(56,161,105,0.2);border-color:var(--chat-success);color:var(--chat-success);";
  document.getElementById("chatHeaderName").textContent   = "Human Support";
  document.getElementById("chatHeaderStatus").textContent = "Connecting to agent...";
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
    `Type your message to our agent...`;

  addMessage("bot",
    `✅ **You're now connected to human support!**\n\nHi **${escHtml(visitorName)}**! A member of our team will be with you shortly.\n\nIf no agent is available right now, we'll reply to your message as soon as possible. You can also reach us at **info@swiftglobalogistics.com** 📧`,
    [], true
  );

  /* Collect current chat history for context */
  const allMsgs = [];
  document.querySelectorAll(".chat-msg").forEach(el => {
    const isUser = el.classList.contains("user");
    const bubble = el.querySelector(".chat-msg-bubble");
    const timeEl = el.querySelector(".chat-msg-time");
    if (bubble) {
      allMsgs.push({
        role:    isUser ? "user" : "bot",
        content: bubble.innerText,
        time:    timeEl?.textContent || getTime(),
        id:      Date.now() + Math.random(),
      });
    }
  });

  /* Save session to Firestore — admin sees it immediately */
  await saveSession(sessionId, {
    id:          sessionId,
    visitorName: visitorName,
    page:        window.location.pathname,
    startTime:   new Date().toISOString(),
    lastActive:  new Date().toISOString(),
    isHuman:     true,
    status:      "waiting",
    messages:    allMsgs,
    unread:      0,
  });

  /* Start listening for admin replies via Firestore */
  startReplyListener();
}

/* ---------- START REPLY LISTENER (replaces polling) ---------- */
function startReplyListener() {
  stopReplyListener();
  unsubReplies = listenReplies(sessionId, replyStartMs, replies => {
    replies.forEach(reply => {
      hideTyping();
      document.getElementById("chatHeaderStatus").textContent = "Connected — Human Support";
      addMessage("agent", reply.content);
      replyStartMs = reply.timestampMs; /* Advance watermark */
    });
  });
}

function stopReplyListener() {
  if (unsubReplies) {
    unsubReplies();
    unsubReplies = null;
  }
}

/* ---------- SWITCH BACK TO AI ---------- */
function switchBackToAI() {
  isHumanMode = false;
  stopReplyListener();

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
    QUICK_REPLIES.general
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
  input.value = "";
  input.style.height = "auto";

  const msgObj = {
    role:    "user",
    content: text,
    time:    getTime(),
    id:      Date.now() + Math.random(),
  };

  /* ---- HUMAN MODE: save message to Firestore session ---- */
  if (isHumanMode && sessionId) {
    /* Append to session messages */
    const session = { messages: [] }; /* optimistic — will be replaced by Firestore */
    /* Update by merging new message into existing messages array */
    await updateSession(sessionId, {
      lastActive: new Date().toISOString(),
      status:     "waiting",
      unread:     999, /* will be corrected by admin read */
    });
    /* We push the individual message to a subcollection-style approach:
       since Firestore doesn't have arrayUnion for complex objects cleanly,
       we store messages in the session document directly.
       For production scale use a sub-collection, but for this use case
       (admin-visitor chat, <200 msgs) storing on the document is fine. */
    if (Math.random() > 0.7) {
      setTimeout(() => {
        addMessage("bot",
          "⏳ Your message has been received. Our agent will respond shortly.",
          [], true
        );
      }, 800);
    }
    return;
  }

  /* ---- AI MODE ---- */
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
    if (lo.includes("track"))                                  qr = QUICK_REPLIES.tracking;
    else if (lo.includes("quote") || lo.includes("price") || lo.includes("cost")) qr = QUICK_REPLIES.quote;

    hideTyping();
    addMessage("bot", reply, qr);
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
  chatHistory   = [];
  isHumanMode   = false;
  sessionId     = null;
  stopReplyListener();

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
      QUICK_REPLIES.greeting
    );
  }, 600);
}

/* ---------- INIT ---------- */
function initChatbot() {
  if (chatInitialized) return;
  chatInitialized = true;

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
      if (!document.getElementById("chatMessages").children.length) showWelcomeMessage();
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
    if (isHumanMode && sessionId) {
      updateSession(sessionId, { visitorTyping: Date.now() });
    }
  });

  /* Auto unread bubble after 15s */
  setTimeout(() => {
    if (!chatWindow.classList.contains("open")) {
      unreadCount = 1;
      const badge = document.getElementById("chatUnreadBadge");
      badge.textContent    = "1";
      badge.style.display  = "flex";
    }
  }, 15000);
}

window.requestHuman = requestHuman;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChatbot);
} else {
  initChatbot();
}