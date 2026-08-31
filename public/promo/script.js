/* Edit this block to update the promo without changing the animation markup. */
const XBT_CONFIG = {
  brand: "XBTesports™",
  tagline: "ONLINE ELIMINATION BRACKETS",
  website: "XBTESPORTS.NYC",
  cta: "REGISTER. COMPETE. WIN.",
  event: {
    game: "CALL OF DUTY",
    mode: "FREE FOR ALL",
    format: "OPEN BRACKET",
    entry: "FREE ENTRY",
    crossplay: "CROSSPLAY ENABLED",
    date: "MATCH DAY"
  },
  scenes: {
    intro: true,
    brand: true,
    howToCompete: true,
    event: true,
    recruitment: true,
    ident: true
  },
  durations: {
    intro: 3200,
    brand: 7600,
    howToCompete: 8500,
    event: 7600,
    recruitment: 7000,
    ident: 4800,
    sponsor: 8000
  },
  sponsorMode: false,
  sponsor: {
    // Add a local or hosted video source later to replace the Event scene.
    video: ""
  }
};

const setText = (selector, value) => document.querySelectorAll(selector).forEach((element) => {
  element.textContent = value;
});

function populatePromo() {
  setText("[data-brand]", XBT_CONFIG.brand);
  setText("[data-tagline]", XBT_CONFIG.tagline);
  setText("[data-website]", XBT_CONFIG.website);
  setText("[data-cta]", XBT_CONFIG.cta);
  setText("[data-event-game]", XBT_CONFIG.event.game);
  setText("[data-event-mode]", XBT_CONFIG.event.mode);
  setText("[data-event-format]", XBT_CONFIG.event.format);
  setText("[data-event-entry]", XBT_CONFIG.event.entry);
  setText("[data-event-crossplay]", XBT_CONFIG.event.crossplay);
  setText("[data-event-date]", XBT_CONFIG.event.date);
}

function buildSponsorScene() {
  const sponsorScene = document.querySelector('[data-scene="sponsor"]');
  if (!XBT_CONFIG.sponsorMode || !XBT_CONFIG.sponsor.video) return;

  sponsorScene.hidden = false;
  sponsorScene.querySelector(".media-slot").innerHTML = `<video muted autoplay loop playsinline src="${XBT_CONFIG.sponsor.video}"></video>`;
}

function getSceneRotation() {
  const sequence = Object.entries(XBT_CONFIG.scenes)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);

  if (XBT_CONFIG.sponsorMode && XBT_CONFIG.sponsor.video) {
    const eventIndex = sequence.indexOf("event");
    if (eventIndex !== -1) sequence.splice(eventIndex, 1, "sponsor");
    else sequence.push("sponsor");
  }

  return sequence.map((name) => ({
    name,
    element: document.querySelector(`[data-scene="${name}"]`),
    duration: XBT_CONFIG.durations[name] || 6000
  })).filter((scene) => scene.element);
}

function startRotation() {
  const rotation = getSceneRotation();
  if (!rotation.length) return;
  let index = 0;

  const showNextScene = () => {
    rotation.forEach((scene, sceneIndex) => scene.element.classList.toggle("is-active", sceneIndex === index));
    window.setTimeout(() => {
      index = (index + 1) % rotation.length;
      showNextScene();
    }, rotation[index].duration);
  };

  showNextScene();
}

populatePromo();
buildSponsorScene();
startRotation();
