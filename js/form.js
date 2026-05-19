/* ============================================
   SWIFTTGLOBAL LOGISTICS — CONTACT FORM JS
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateForm()) {
      submitForm();
    }
  });
});

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
    if (!el.value.trim()) {
      err.textContent = f.msg;
      el.style.borderColor = 'var(--error)';
      valid = false;
    } else {
      err.textContent = '';
      el.style.borderColor = 'var(--success)';
    }
  });

  // Email validation
  const emailEl  = document.getElementById('email');
  const emailErr = document.getElementById('emailError');
  const emailRe  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(emailEl.value.trim())) {
    emailErr.textContent = 'Please enter a valid email address.';
    emailEl.style.borderColor = 'var(--error)';
    valid = false;
  } else {
    emailErr.textContent = '';
    emailEl.style.borderColor = 'var(--success)';
  }

  return valid;
}

function submitForm() {
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Sending...';

  // Simulate sending (replace with real backend / EmailJS / Formspree later)
  setTimeout(() => {
    document.getElementById('contactForm').style.display = 'none';
    document.getElementById('formSuccess').style.display = 'flex';
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-paper-plane"></i> Send Message';
  }, 1800);
}