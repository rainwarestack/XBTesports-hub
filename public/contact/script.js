// DELIVERY CONFIGURATION
// Add a verified HTTPS form-service endpoint here when delivery is configured.
// Store the receiving email ONLY in that service's private settings. Never put
// a personal email, API secret, or email-containing action URL in public files.
// This adapter expects Formspree-compatible JSON POST requests/responses.
// Configure provider-side spam protection/rate limits and disable autoresponses
// that expose the receiving address. Replies should use the chosen business inbox.
const contactConfig = { endpoint: 'https://formspree.io/f/xdeknado' };
const form = document.getElementById('contact-form');
const fields = document.getElementById('contact-fields');
const button = document.getElementById('send-button');
const notice = document.getElementById('delivery-notice');
const status = document.getElementById('form-status');
let sending = false;
let endpoint = null;
try {
  const candidate = new URL(contactConfig.endpoint);
  if (candidate.protocol === 'https:' && !candidate.username && !candidate.password) endpoint = candidate.href;
} catch { /* Fail closed: do not collect messages until delivery is connected. */ }
if (endpoint) {
  fields.disabled = false;
  button.disabled = false;
  button.firstChild.textContent = 'SEND INQUIRY ';
  notice.textContent = 'Complete the form below to contact XBTesports.';
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!endpoint || sending || !form.reportValidity()) return;
  const payload = Object.fromEntries(new FormData(form));
  if (payload._gotcha) return;
  sending = true;
  button.disabled = true;
  fields.disabled = true;
  button.firstChild.textContent = 'SENDING… ';
  form.setAttribute('aria-busy', 'true');
  status.textContent = '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    if (!response.ok) throw new Error('Delivery rejected');
    form.reset();
    status.textContent = 'Your inquiry has been sent. Thank you for contacting XBTesports.';
  } catch {
    status.textContent = 'We couldn’t confirm delivery. Your message is still here. Please try again later.';
  } finally {
    clearTimeout(timeout);
    sending = false;
    fields.disabled = false;
    button.disabled = false;
    button.firstChild.textContent = 'SEND INQUIRY ';
    form.removeAttribute('aria-busy');
    status.focus();
  }
});
