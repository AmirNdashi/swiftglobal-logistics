/* ============================================
   SWIFTGLOBAL LOGISTICS — CONTACT FORM
   ============================================ */

/* ---------- EMAILJS CONFIG ---------- */
const EMAIL_CONFIG = {
  publicKey:       "TtNp08mJHpnvCjPew",
  serviceId:       "service_1a6do58",
  templateContact: "template_kadcmca",
  templateReply:   "template_gqqo16d",
};

const ADMIN_EMAILS = ["amiridirisu@gmail.com", "info@swiftglobalogistics.com"];

/* ---------- SECURITY: RATE LIMITING ---------- */
let formTimestamps = [];
const MAX_FORM_SUBMISSIONS_PER_HOUR = 5;

(function initEmailJS() {
  if (typeof emailjs !== "undefined") {
    emailjs.init(EMAIL_CONFIG.publicKey);
  }
})();

/* ---------- FORM INIT ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    if (validateForm()) submitForm();
  });
});

/* ---------- VALIDATE ---------- */
function validateForm() {
  let valid = true;

  const fields = [
    { id: "firstName", errorId: "firstNameError", msg: "Please enter your first name." },
    { id: "lastName",  errorId: "lastNameError",  msg: "Please enter your last name."  },
    { id: "subject",   errorId: "subjectError",   msg: "Please enter a subject."       },
    { id: "message",   errorId: "messageError",   msg: "Please enter your message."    },
  ];

  fields.forEach(f => {
    const el  = document.getElementById(f.id);
    const err = document.getElementById(f.errorId);
    if (!el || !err) return;
    if (!el.value.trim()) {
      err.textContent      = f.msg;
      el.style.borderColor = "var(--error)";
      valid = false;
    } else {
      err.textContent      = "";
      el.style.borderColor = "var(--success)";
    }
  });

  const emailEl  = document.getElementById("email");
  const emailErr = document.getElementById("emailError");
  if (emailEl && emailErr) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(emailEl.value.trim())) {
      emailErr.textContent      = "Please enter a valid email address.";
      emailEl.style.borderColor = "var(--error)";
      valid = false;
    } else {
      emailErr.textContent      = "";
      emailEl.style.borderColor = "var(--success)";
    }
  }

  return valid;
}

/* ---------- SECURITY: RATE LIMITING CHECK ---------- */
function checkFormRateLimit() {
  const now = Date.now();
  const oneHourAgo = now - 3600000;

  // Remove timestamps older than 1 hour
  formTimestamps = formTimestamps.filter(ts => ts > oneHourAgo);

  // Check if user exceeded rate limit
  if (formTimestamps.length >= MAX_FORM_SUBMISSIONS_PER_HOUR) {
    return false;
  }

  // Add current timestamp
  formTimestamps.push(now);
  return true;
}

/* ---------- SECURITY: MESSAGE VALIDATION ---------- */
function validateFormData(data) {
  // Check message length
  if (data.message.length > 2000) {
    return { valid: false, error: "Message too long. Please keep it under 2000 characters." };
  }

  // Check for repeated characters (spam pattern)
  const repeatedCharPattern = /(.)\1{15,}/;
  if (repeatedCharPattern.test(data.message + data.subject)) {
    return { valid: false, error: "Invalid message format detected." };
  }

  // Check for non-English characters (optional - remove if you want to allow other languages)
  const nonEnglishPattern = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u0400-\u04FF]/;
  if (nonEnglishPattern.test(data.message + data.subject)) {
    return { valid: false, error: "Please use English characters only." };
  }

  // Check for suspicious patterns (excessive URLs, etc.)
  const urlPattern = /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
  const urlMatches = (data.message + data.subject).match(urlPattern);
  if (urlMatches && urlMatches.length > 3) {
    return { valid: false, error: "Too many URLs in your message. Please contact us directly." };
  }

  return { valid: true };
}

/* ---------- SUBMIT ---------- */
async function submitForm() {
  const btn    = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Sending...';

  const data = {
    firstName: document.getElementById("firstName")?.value.trim() || "",
    lastName:  document.getElementById("lastName")?.value.trim()  || "",
    email:     document.getElementById("email")?.value.trim()     || "",
    phone:     document.getElementById("phone")?.value.trim()     || "—",
    service:   document.getElementById("service")?.value          || "",
    subject:   document.getElementById("subject")?.value.trim()   || "",
    message:   document.getElementById("message")?.value.trim()   || "",
  };

  /* SECURITY: Rate limiting check */
  if (!checkFormRateLimit()) {
    alert("You've submitted too many forms recently. Please wait before trying again.");
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-paper-plane"></i> Send Message';
    return;
  }

  /* SECURITY: Message validation */
  const validation = validateFormData(data);
  if (!validation.valid) {
    alert(validation.error);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-paper-plane"></i> Send Message';
    return;
  }

  const fromName = `${data.firstName} ${data.lastName}`.trim();

  try {
    /* STEP 1: Save to Firestore via bridge set by HTML module script */
    if (typeof window.__sgAddMessage === "function") {
      await window.__sgAddMessage(data);
      console.log("[SwiftGlobal] Message saved to Firestore ✅");
    } else {
      /* Fallback: localStorage so message isn't lost */
      console.warn("[SwiftGlobal] Firebase not ready — saving to localStorage");
      const existing = JSON.parse(localStorage.getItem("swiftglobal_messages") || "[]");
      existing.unshift({
        ...data,
        id:   Date.now().toString(),
        read: false,
        date: new Date().toISOString(),
      });
      localStorage.setItem("swiftglobal_messages", JSON.stringify(existing));
    }

    /* STEP 2: Send emails */
    if (typeof emailjs !== "undefined") {
      for (const adminEmail of ADMIN_EMAILS) {
        await emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.templateContact, {
          from_name:  fromName,
          from_email: data.email,
          phone:      data.phone,
          service:    data.service || "Not specified",
          subject:    data.subject,
          message:    data.message,
          to_email:   adminEmail,
        });
      }
      /* STEP 3: Auto-reply to sender */
      await emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.templateReply, {
        from_name:  fromName,
        from_email: data.email,
        service:    data.service || "Not specified",
        subject:    data.subject,
        message:    data.message,
      });
    }

    showSuccess();
  } catch (err) {
    console.error("[SwiftGlobal] Form submit error:", err);
    showSuccess(); /* Message is saved — don't show error to user */
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa fa-paper-plane"></i> Send Message';
}

/* ---------- SHOW SUCCESS ---------- */
function showSuccess() {
  const form    = document.getElementById("contactForm");
  const success = document.getElementById("formSuccess");
  if (success) success.style.display = "flex";
  if (form) {
    form.reset();
    form.querySelectorAll("input, textarea, select").forEach(f => {
      f.style.borderColor = "";
    });
  }
  setTimeout(() => {
    if (success) success.style.display = "none";
  }, 5000);
}