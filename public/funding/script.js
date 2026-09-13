/* PARTNERSHIP DATA
 * Phase 1: change status here (available, pending, filled). All five start open;
 * no invented sponsors or reservations. Exclusivity applies per placement.
 * Optional public currentPartner: { name, logoUrl, websiteUrl, activeThrough }.
 * Future admin records: partner name/logo, slot, status, start/expiration dates,
 * contact email, payment status, assets received, approval status, campaign notes,
 * website URL, promotion start/end. Keep contact/payment/approval/notes private
 * on the backend. Publish only approved public fields. No authentication yet.
 */
const partnerSlots = [
  { id: 'prize', title: 'Prize Partner', price: 'Approved prize contribution', duration: '1 tournament per prize', status: 'available', currentPartner: null,
    description: ['Provide products or digital rewards directly to XBTesports™ tournament champions.', 'Contribute an approved product, digital item, gift code, membership, subscription, or other prize. Digital prizes are preferred; physical products must be discussed through email before the event.', 'XBTesports™ promotes your business as the prize provider when announcing and presenting the reward.'],
    requirementsTitle: 'ELIGIBLE PRIZE EXAMPLES', requirements: ['Digital gift cards', 'Game codes', 'Memberships or subscriptions', 'Software licenses', 'Brand merchandise', 'Gaming accessories', 'Controllers and peripherals'] },
  { id: 'broadcast', title: 'Broadcast Partner', price: 250, duration: '1 month', status: 'available', currentPartner: null,
    description: ['Your logo will be displayed throughout XBTesports™ livestreams, including Starting Soon, Live Match, Be Right Back, Just Chatting, and Ending scenes.', 'A consistent brand presence in the designated sponsor placement throughout the active promotional period.'],
    requirementsTitle: 'ASSET REQUIREMENTS', requirements: ['High-quality transparent PNG or SVG.', 'XBTesports™ resizes the logo to fit the designated placement while preserving its original proportions.'] },
  { id: 'segment', title: 'Segment Partner', price: 350, duration: '1 month', status: 'available', currentPartner: null,
    description: ['Promote your brand directly during XBTesports™ livestreams with short commercial placements.', 'Your commercial appears approximately once every 15 minutes during eligible broadcasts. Most standard broadcasts last approximately one hour, allowing up to four placements during a typical stream.'],
    requirementsTitle: 'COMMERCIAL REQUIREMENTS', requirements: ['Maximum length: 20 seconds.', 'File format: MP4.', 'Content must be approved by XBTesports™ before airing.', 'Eligible platforms, formats, and scheduling are confirmed before activation.'] },
  { id: 'social', title: 'Social Media Partner', price: 400, duration: '1 month', status: 'available', currentPartner: null,
    description: ['Place your brand directly inside XBTesports™ short-form content.', 'Videos published through official XBTesports™ short-form social channels may include your sponsor message at the end of participating videos.'],
    requirementsTitle: 'SPONSOR MESSAGE REQUIREMENTS', requirements: ['Business or brand name.', 'Short promotional message.', 'Maximum sponsor segment: 10 seconds.', 'Message must be appropriate for XBTesports™ audiences.'] },
  { id: 'tournament', title: 'Tournament Partner', price: 750, duration: '1 month', status: 'available', currentPartner: null,
    description: ['Receive co-branding throughout XBTesports™ bracket events during your active partnership period. Your name or brand may become part of the event presentation.', 'XBTesports™ manages tournament operations, promotion, broadcast, and competition management. Partners are encouraged to advertise and repost participating events, but are not required to manage tournament operations.'],
    example: 'XBTesports™ Open — PRESENTED BY [PARTNER]', requirementsTitle: 'PARTNERSHIP INCLUDES', requirements: ['Co-branded tournament title.', 'Partner logo on official tournament posters.', 'Recognition on registration or tournament pages.', 'Branding on bracket and match graphics.', 'Recognition during winner announcements.', 'Inclusion across qualifying bracket events during the active month.'] }
];

// STATUS UTILITIES — text and symbols convey status without color alone.
const statusLabels = { available: { label: 'AVAILABLE', symbol: '●' }, pending: { label: 'PENDING', symbol: '◌' }, filled: { label: 'FILLED', symbol: '×' } };
const normalizeStatus = value => Object.hasOwn(statusLabels, value) ? value : 'pending';
const padCount = count => String(count).padStart(2, '0');
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function safePublicUrl(value) {
  if (!value) return null;
  try { const url = new URL(value, window.location.origin); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

// INVENTORY COUNTS — never maintain counts separately in HTML.
function renderInventoryCounts(slots) {
  document.querySelectorAll('[data-total]').forEach(node => { node.textContent = padCount(slots.length); });
  for (const status of Object.keys(statusLabels)) document.getElementById(`${status}-count`).textContent = padCount(slots.filter(slot => normalizeStatus(slot.status) === status).length);
}

// PARTNERSHIP RENDERING — textContent keeps future public data out of raw HTML.
function renderPartner(slot, index) {
  const status = normalizeStatus(slot.status);
  const article = element('article', `xbt-partner is-${status}`);
  article.id = slot.id;
  article.setAttribute('aria-labelledby', `${slot.id}-title`);
  const watermark = element('span', 'xbt-partner-watermark', padCount(index + 1));
  watermark.setAttribute('aria-hidden', 'true'); article.append(watermark);
  const top = element('div', 'xbt-partner-top');
  const indexLabel = element('span', 'xbt-partner-index');
  indexLabel.append(element('span', '', padCount(index + 1)), document.createTextNode(' / PARTNER POSITION'));
  const badge = element('span', 'xbt-partner-status'); badge.dataset.status = status;
  const symbol = element('span', 'xbt-status-symbol', statusLabels[status].symbol); symbol.setAttribute('aria-hidden', 'true');
  badge.append(symbol, document.createTextNode(`STATUS // ${statusLabels[status].label}`)); top.append(indexLabel, badge);
  const heading = element('div', 'xbt-partner-heading');
  const title = element('h3'); title.id = `${slot.id}-title`;
  title.append(document.createTextNode(slot.title.replace(/ Partner$/, '')), element('span', '', 'PARTNER'));
  const pricing = element('div', 'xbt-partner-pricing');
  const price = element('p', `xbt-partner-price${typeof slot.price === 'number' ? '' : ' xbt-contribution'}`);
  if (typeof slot.price === 'number') price.append(document.createTextNode(`$${slot.price}`), element('span', 'xbt-price-currency', 'USD'));
  else { price.append(document.createTextNode('APPROVED'), element('br'), document.createTextNode('CONTRIBUTION')); price.setAttribute('aria-label', slot.price); }
  pricing.append(price, element('p', 'xbt-partner-duration', slot.duration.toUpperCase())); heading.append(title, pricing);
  const content = element('div', 'xbt-partner-content');
  const description = element('div', 'xbt-partner-description');
  slot.description.forEach(text => description.append(element('p', '', text)));
  if (slot.example) description.append(element('div', 'xbt-partner-example', slot.example));
  const requirements = element('div', 'xbt-partner-requirements'); requirements.append(element('h4', '', slot.requirementsTitle));
  const list = element('ul'); slot.requirements.forEach(text => list.append(element('li', '', text))); requirements.append(list);
  content.append(description, requirements);
  if (status === 'filled') {
    const partner = element('div', 'xbt-current-partner'); partner.append(element('span', 'xbt-micro', 'CURRENT PARTNER'));
    const current = slot.currentPartner; partner.append(element('strong', '', current?.name || 'PARTNER RESERVED'));
    const logoUrl = safePublicUrl(current?.logoUrl);
    if (logoUrl && current?.name) { const logo = element('img'); logo.src = logoUrl; logo.alt = `${current.name} logo`; logo.loading = 'lazy'; partner.append(logo); }
    if (current?.activeThrough) partner.append(element('span', '', `Active through ${current.activeThrough}`));
    description.append(partner);
  }
  const bottom = element('div', 'xbt-partner-bottom');
  const note = status === 'filled' ? 'Next availability may open following the current promotional period.' : status === 'pending' ? 'This position is under review. Contact us to discuss upcoming availability.' : 'ONE POSITION / ONE APPROVED PARTNER';
  bottom.append(element('p', 'xbt-slot-note', note));
  if (status === 'filled') {
    const disabled = element('span', 'xbt-partner-cta', 'CURRENTLY FILLED'); disabled.setAttribute('role', 'link'); disabled.setAttribute('aria-disabled', 'true'); disabled.setAttribute('aria-label', `${slot.title}: currently filled`); bottom.append(disabled);
  } else {
    const link = element('a', 'xbt-partner-cta', 'CONTACT XBTESPORTS'); link.href = '/contact'; link.setAttribute('aria-label', `Contact XBTesports about ${slot.title}`);
    const arrow = element('span', '', '→'); arrow.setAttribute('aria-hidden', 'true'); link.append(arrow); bottom.append(link);
  }
  // Phase 2: Checkout button insertion for approved fixed-price slots only.
  // Browser → secure server endpoint → Stripe Checkout Session → hosted checkout.
  // Browser sends slot ID only. Server owns price, approval and availability,
  // reserves inventory atomically and verifies payment through signed webhooks.
  // Never expose secret keys or trust frontend prices/status or success redirects.
  // Expire unpaid holds safely. Prize contributions remain manual. Apple Pay and
  // other wallets appear only within an actual eligible Stripe Checkout flow.
  article.append(top, heading, content, bottom); return article;
}

// INITIALIZATION — reusable after a future admin-backed public inventory refresh.
function renderPartnershipInventory(slots = partnerSlots) {
  const sorted = [...slots].sort((a, b) => (typeof a.price === 'number' ? a.price : 0) - (typeof b.price === 'number' ? b.price : 0));
  document.getElementById('partner-slots').replaceChildren(...sorted.map(renderPartner));
  renderInventoryCounts(sorted);
}
renderPartnershipInventory();
