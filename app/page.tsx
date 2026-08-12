"use client";

import { useState } from "react";

type Panel = "battlefy" | "funding";

const embedSlots = [
  { label: "AUTHOR GIF", hint: "Team / organizer identity", wide: true },
  { label: "THUMBNAIL GIF", hint: "Event or campaign visual" },
  { label: "FOOTER IMAGE", hint: "Brand signature" },
];

export default function Home() {
  const [panel, setPanel] = useState<Panel>("battlefy");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <main className="site-shell">
      <div className="topo topo-one" aria-hidden="true" />
      <div className="topo topo-two" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark">X</span><span>XBTesports<span className="trade">™</span></span></a>
        <div className="location">NORTH AMERICA / ONLINE <span className="status-dot" /></div>
      </header>

      <section id="top" className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">XBT-001 / COMPETITIVE CULTURE LAB</p>
          <h1>Play the<br /><em>long game.</em></h1>
          <p className="intro">Free-to-enter esports events, built for players and powered by the community around them.</p>
          <button className="primary-action" onClick={() => setDrawerOpen(true)}>EXPLORE XBT <span>↗</span></button>
        </div>
        <div className="hero-stat"><span className="stat-label">NEXT DROP</span><strong>08</strong><span className="stat-foot">OPEN TOPOGRAPHIC SIGNALS<br />SEASON / 2026</span></div>
      </section>

      <nav className="tabs" aria-label="XBTesports sections">
        <button className={panel === "battlefy" ? "tab active" : "tab"} onClick={() => setPanel("battlefy")}>01 / BATTLEFY</button>
        <button className={panel === "funding" ? "tab active" : "tab"} onClick={() => setPanel("funding")}>02 / FUNDING</button>
      </nav>

      <section className="command-panel" aria-live="polite">
        {panel === "battlefy" ? <>
          <div className="panel-copy"><p className="eyebrow">PLAYER ACCESS / 01</p><h2>Find your<br /><em>next match.</em></h2><p>Check brackets, schedules, standings, and event details in one place. Battlefy embeds can live right here.</p><a className="text-link" href="https://battlefy.com" target="_blank" rel="noreferrer">OPEN BATTLEFY ↗</a></div>
          <div className="battlefy-frame"><div className="frame-top"><span>LIVE EVENT FEED</span><span className="frame-dot">● CONNECTED</span></div><div className="frame-placeholder"><span className="frame-cross">+</span><strong>BATTLEFY<br />IFRAME SLOT</strong><small>PASTE YOUR EMBED URL IN CODEPEN</small></div></div>
        </> : <>
          <div className="panel-copy"><p className="eyebrow">COMMUNITY CAPITAL / 02</p><h2>Keep the<br /><em>signal live.</em></h2><p>Donate, sponsor an event, or place your brand in front of the players shaping what comes next.</p><button className="text-link button-link" onClick={() => setSupportOpen(!supportOpen)}>SEE WAYS TO HELP {supportOpen ? "↘" : "↗"}</button></div>
          <div className="funding-grid"><div className="fund-card"><span>01 / DONATE</span><strong>Any amount<br />moves us forward.</strong><button onClick={() => setSupportOpen(true)}>SUPPORT THE ORG ↗</button></div><div className="fund-card silver"><span>02 / PARTNER</span><strong>Sponsor a<br />free event.</strong><a href="mailto:partners@xbtesports.com">START A CONVERSATION ↗</a></div></div>
        </>}
      </section>

      <section className="embed-section"><div className="section-heading"><span>DISCORD-STYLE EMBED SLOTS</span><span>01—03 / DROP ZONES</span></div><div className="embed-grid">{embedSlots.map((slot, i) => <div className={`embed-slot ${slot.wide ? "wide" : ""}`} key={slot.label}><div className="slot-number">0{i + 1}</div><div><strong>{slot.label}</strong><small>{slot.hint}</small></div><span className="slot-plus">+</span></div>)}</div></section>
      <footer className="footer"><span>XBTesports™ / FREE EVENTS FOR THE CULTURE</span><span>BUILT FOR THE NEXT ROUND <b>↗</b></span></footer>

      <button className={`pull-tag ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(!drawerOpen)} aria-expanded={drawerOpen}>{drawerOpen ? "CLOSE" : "ABOUT XBT"}<span>↗</span></button>
      <aside className={`drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}><p className="eyebrow">THE SHORT VERSION</p><h2>Built for<br /><em>everybody.</em></h2><p>XBTesports™ is an independent esports org making competitive play more accessible. Free events, clear pathways, and a community-funded future.</p><div className="drawer-lines"><span>EST. 2026</span><span>PLAYER-FIRST / COMMUNITY-POWERED</span><span>ONLINE / NORTH AMERICA</span></div><a href="mailto:hello@xbtesports.com">HELLO@XBTESPORTS.COM ↗</a></aside>
      {supportOpen && panel === "funding" && <div className="support-toast"><strong>Thanks for backing the next round.</strong><span>Connect a donation link, sponsor deck, or payment flow here.</span><button onClick={() => setSupportOpen(false)}>×</button></div>}
    </main>
  );
}
