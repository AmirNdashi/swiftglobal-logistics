/* ============================================
   SWIFTGLOBAL LOGISTICS — CONTACT FORM JS
   Firebase + EmailJS Integration
   ============================================ */

const EMAIL_CONFIG = {
  publicKey:       'TtNp08mJHpnvCjPew',
  serviceId:       'service_1a6do58',
  templateContact: 'template_kadcmca',
  templateReply:   'template_gqqo16d',
};

const ADMIN_EMAILS = [
  'amiridirisu@gmail.com',
  'info@swiftglobalogistics.com',
];

/* Init EmailJS when available */
function initEmailJS() {
  if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAIL_CONFIG.publicKey);
  }
}

/* ---------- FORM INIT ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initEmailJS();
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateForm()) submitForm();
  });
});

/* ---------- VALIDATE ---------- */
function validateForm() {
  let valid = true;

  const fields = [
    { id: 'firstName', errorId: 'firstNameError', msg: 'Please enter your first name.' },
    { id: 'lastName',  errorId: 'lastNameError',  msg: 'Please enter your last name.'  },
    { id: 'subject',   errorId: 'subjectError',   msg: 'Please enter a subject.'       },
    { id: 'message',   errorId: 'messageError',   msg: 'Please enter your message.'    },
  ];

  fields.forEach(f => {
    const el  = document.getElementById(f.id);
    const err = document.getElementById(f.errorId);
    if (!el || !err) return;
    if (!el.value.trim()) {
      err.textContent      = f.msg;
      el.style.borderColor = 'var(--error)';
      valid = false;
    } else {
      err.textContent      = '';
      el.style.borderColor = 'var(--success)';
    }
  });

  const emailEl  = document.getElementById('email');
  const emailErr = document.getElementById('emailError');
  if (emailEl && emailErr) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(emailEl.value.trim())) {
      emailErr.textContent      = 'Please enter a valid email address.';
      emailEl.style.borderColor = 'var(--error)';
      valid = false;
    } else {
      emailErr.textContent      = '';
      emailEl.style.borderColor = 'var(--success)';
    }
  }
  return valid;
}

/* ---------- SUBMIT ---------- */
async function submitForm() {
  const btn     = document.getElementById('submitBtn');
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Sending...';

  const data = {
    firstName: document.getElementById('firstName')?.value.trim() || '',
    lastName:  document.getElementById('lastName')?.value.trim()  || '',
    email:     document.getElementById('email')?.value.trim()     || '',
    phone:     document.getElementById('phone')?.value.trim()     || '—',
    service:   document.getElementById('service')?.value          || '',
    subject:   document.getElementById('subject')?.value.trim()   || '',
    message:   document.getElementById('message')?.value.trim()   || '',
  };

  const fromName = `${data.firstName} ${data.lastName}`.trim();

  try {
    /* ---- Save to Firebase Firestore ---- */
    await saveMessageToFirebase(data);

    /* ---- Send emails via EmailJS ---- */
    if (typeof emailjs !== 'undefined') {
      for (const adminEmail of ADMIN_EMAILS) {
        await emailjs.send(
          EMAIL_CONFIG.serviceId,
          EMAIL_CONFIG.templateContact,
          {
            from_name:  fromName,
            from_email: data.email,
            phone:      data.phone,
            service:    data.service || 'Not specified',
            subject:    data.subject,
            message:    data.message,
            to_email:   adminEmail,
          }
        );
      }

      /* Auto-reply to sender */
      await emailjs.send(
        EMAIL_CONFIG.serviceId,
        EMAIL_CONFIG.templateReply,
        {
          from_name:  fromName,
          from_email: data.email,
          service:    data.service || 'Not specified',
          subject:    data.subject,
          message:    data.message,
        }
      );
    }

    showSuccess();

  } catch (err) {
    console.error('Form submit error:', err);
    /* Still show success — message was saved */
    showSuccess();
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa fa-paper-plane"></i> Send Message';
}

/* ---------- SAVE TO FIREBASE ---------- */
async function saveMessageToFirebase(data) {
  /* Wait up to 3 seconds for Firebase to be ready */
  for (let i = 0; i < 30; i++) {
    if (typeof window.__sgAddMessage === 'function') break;
    await new Promise(r => setTimeout(r, 100));
  }

  if (typeof window.__sgAddMessage === 'function') {
    await window.__sgAddMessage(data);
    console.log('Message saved to Firebase ✅');
  } else {
    /* Fallback to localStorage if Firebase failed to load */
    console.warn('Firebase not available — saving to localStorage');
    const existing = JSON.parse(localStorage.getItem('swiftglobal_messages') || '[]');
    existing.unshift({
      ...data,
      id:   Date.now().toString(),
      read: false,
      date: new Date().toISOString(),
    });
    localStorage.setItem('swiftglobal_messages', JSON.stringify(existing));
  }
}

/* ---------- SHOW SUCCESS ---------- */
function showSuccess() {
  const form    = document.getElementById('contactForm');
  const success = document.getElementById('formSuccess');
  if (form)    form.style.display    = 'none';
  if (success) success.style.display = 'flex';
}