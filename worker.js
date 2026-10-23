const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Swift Global Logistics — Temporarily Unavailable</title>
<meta name="robots" content="noindex, nofollow" />
<style>
:root{--bg:#0a2342;--bg2:#1a1a2e;--accent:#e8a317;--text:#fff;--muted:#cbd5e1}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;background:linear-gradient(135deg,var(--bg) 0%,var(--bg2) 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--text);padding:24px;line-height:1.6}
.card{text-align:center;max-width:640px;width:100%;padding:48px 32px}
.logo{font-size:1.75rem;font-weight:700;letter-spacing:.5px;color:var(--accent);margin-bottom:24px}
.logo span{color:var(--text)}
.visual{font-size:3.5rem;margin-bottom:24px;color:var(--accent)}
h1{font-size:2rem;font-weight:600;margin-bottom:16px}
.message{font-size:1.125rem;color:var(--muted);margin-bottom:12px}
.note{font-size:1rem;color:var(--muted)}
@media (max-width:600px){.card{padding:32px 20px}h1{font-size:1.5rem}.visual{font-size:2.75rem}.logo{font-size:1.5rem}}
</style>
</head>
<body>
<main class="card" role="main">
<div class="logo">Swift<span> Global Logistics</span></div>
<div class="visual" aria-hidden="true">&#128666;</div>
<h1>Our Website Is Temporarily Unavailable</h1>
<p class="message">We are currently carrying out temporary maintenance to improve your experience. Our website will be back online soon.</p>
<p class="note">Please check back later. Thank you for your patience and understanding.</p>
</main>
</body>
</html>`;
export default {
  async fetch() {
    return new Response(HTML, {
      status: 503,
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "cache-control": "no-store, no-cache, must-revalidate",
        "retry-after": "3600",
      },
    });
  },
};
