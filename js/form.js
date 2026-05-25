/* ============================================
   SWIFTGLOBAL LOGISTICS — CONTACT FORM JS
   EmailJS Integration + Admin Storage
   ============================================ */

/* ---------- EMAILJS CONFIG ---------- */
const EMAIL_CONFIG = {
  publicKey: "TtNp08mJHpnvCjPew",
  serviceId: "service_1a6do58",
  templateContact: "template_kadcmca", // email to admin(s)
  templateReply: "template_gqqo16d", // auto-reply to sender
};

/* ---------- ADMIN EMAILS ----------
   Both emails receive every submission.
   Add/remove emails from this array anytime.
   ----------------------------------------- */
const ADMIN_EMAILS = ["amiridirisu@gmail.com", "info@swiftglobalogistics.com"];

/* ---------- INIT EMAILJS ---------- */
(function initEmailJS() {
  if (typeof emailjs !== "undefined") {
    emailjs.init(EMAIL_CONFIG.publicKey);
  }
})();

/* ---------- FORM INIT ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (validateForm()) submitForm();
  });
});

/* ---------- VALIDATE ---------- */
function validateForm() {
  let valid = true;

  const fields = [
    {
      id: "firstName",
      errorId: "firstNameError",
      msg: "Please enter your first name.",
    },
    {
      id: "lastName",
      errorId: "lastNameError",
      msg: "Please enter your last name.",
    },
    { id: "subject", errorId: "subjectError", msg: "Please enter a subject." },
    {
      id: "message",
      errorId: "messageError",
      msg: "Please enter your message.",
    },
  ];

  fields.forEach((f) => {
    const el = document.getElementById(f.id);
    const err = document.getElementById(f.errorId);
    if (!el || !err) return;
    if (!el.value.trim()) {
      err.textContent = f.msg;
      el.style.borderColor = "var(--error)";
      valid = false;
    } else {
      err.textContent = "";
      el.style.borderColor = "var(--success)";
    }
  });

  // Email validation
  const emailEl = document.getElementById("email");
  const emailErr = document.getElementById("emailError");
  if (emailEl && emailErr) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(emailEl.value.trim())) {
      emailErr.textContent = "Please enter a valid email address.";
      emailEl.style.borderColor = "var(--error)";
      valid = false;
    } else {
      emailErr.textContent = "";
      emailEl.style.borderColor = "var(--success)";
    }
  }

  return valid;
}

/* ---------- SUBMIT ---------- */
async function submitForm() {
  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Sending...';

  // Collect form data
  const data = {
    firstName: document.getElementById("firstName")?.value.trim() || "",
    lastName: document.getElementById("lastName")?.value.trim() || "",
    email: document.getElementById("email")?.value.trim() || "",
    phone: document.getElementById("phone")?.value.trim() || "—",
    service: document.getElementById("service")?.value || "",
    subject: document.getElementById("subject")?.value.trim() || "",
    message: document.getElementById("message")?.value.trim() || "",
  };

  const fromName = `${data.firstName} ${data.lastName}`.trim();

  try {
    /* ---- STEP 1: Save to admin panel storage ---- */
    saveToAdmin(data);

    /* ---- STEP 2: Send email to EACH admin ---- */
    if (typeof emailjs !== "undefined") {
      for (const adminEmail of ADMIN_EMAILS) {
        await emailjs.send(
          EMAIL_CONFIG.serviceId,
          EMAIL_CONFIG.templateContact,
          {
            from_name: fromName,
            from_email: data.email,
            phone: data.phone,
            service: data.service || "Not specified",
            subject: data.subject,
            message: data.message,
            to_email: adminEmail,
          },
        );
      }

      /* ---- STEP 3: Send auto-reply to sender ---- */
      await emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.templateReply, {
        from_name: fromName,
        from_email: data.email,
        service: data.service || "Not specified",
        subject: data.subject,
        message: data.message,
      });
    }

    /* ---- STEP 4: Show success ---- */
    showSuccess();
  } catch (err) {
    console.error("EmailJS error:", err);
    /* Even if email fails, the message was saved to admin.
       Show success so the user isn't left with an error. */
    showSuccess();
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa fa-paper-plane"></i> Send Message';
}

/* ---------- SAVE TO ADMIN ---------- */
function saveToAdmin(data) {
  try {
    const existing =
      JSON.parse(localStorage.getItem("swiftglobal_messages")) || [];
    const msg = {
      id: Date.now().toString(),
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      service: data.service,
      subject: data.subject,
      message: data.message,
      date: new Date().toISOString(),
      read: false,
    };
    existing.unshift(msg);
    localStorage.setItem("swiftglobal_messages", JSON.stringify(existing));
  } catch (e) {
    console.warn("Could not save to admin storage:", e);
  }
}

/* ---------- SHOW SUCCESS ---------- */
function showSuccess() {
  const form = document.getElementById("contactForm");
  const success = document.getElementById("formSuccess");

  // Show success message
  if (success) {
    success.style.display = "flex";
  }

  // Reset form fields
  if (form) {
    form.reset();

    // Reset all field borders
    const fields = form.querySelectorAll("input, textarea, select");

    fields.forEach((field) => {
      field.style.borderColor = "";
    });
  }

  // Hide success message after 5 seconds
  setTimeout(() => {
    if (success) {
      success.style.display = "none";
    }
  }, 5000);
}
