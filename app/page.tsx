"use client";

import { useEffect, useState } from "react";

type Tab = "brackets" | "funding";
type SiteSettings = { brand: string; hero: string; intro: string; email: string; accent: string; bracketsLabel: string; fundingLabel: string; signals: string[] };
const defaultSettings: SiteSettings = { brand: "XBT Esports", hero: "Make noise. Leave a mark.", intro: "An independent esports platform for sharp players, brave ideas, and the communities that move culture forward.", email: "hello@xbtesports.nyc", accent: "#125740", bracketsLabel: "BRACKETS", fundingLabel: "FUNDING", signals: [] };

const visualSlots = [
  { label: "Signal / 01", className: "slot-wide", src: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif" },
  { label: "Signal / 02", src: "https://media.giphy.com/media/3o7qE1YN7aBOFPRw8E/giphy.gif" },
  { label: "Signal / 03", src: "https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif" },
  { label: "Signal / 04", src: "https://media.giphy.com/media/26n6WywJyh39n1pBu/giphy.gif" },
  { label: "Signal / 05", className: "slot-tall", src: "https://media.giphy.com/media/3o7TKsQ8UQK0H6pM0E/giphy.gif" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("brackets");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  useEffect(() => { const stored = window.localStorage.getItem("xbte-builder-settings"); if (stored) setSettings({ ...defaultSettings, ...JSON.parse(stored) }); }, []);

  return (
    <main className="site-shell" style={{ "--green": settings.accent } as React.CSSProperties}>
      <div className="topo topo-one" aria-hidden="true" />
      <div className="topo topo-two" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="XBTE Sports home">
          <span className="brand-mark">X</span>
          <span>{settings.brand}</span>
        </a>
        <div className="location">NYC / 2026 <span className="status-dot" /></div>
      </header>

      <nav className="tabs" aria-label="Primary navigation">
        <button className={activeTab === "brackets" ? "tab active" : "tab"} onClick={() => setActiveTab("brackets")}>01 / {settings.bracketsLabel}</button>
        <button className={activeTab === "funding" ? "tab active" : "tab"} onClick={() => setActiveTab("funding")}>02 / {settings.fundingLabel}</button>
      </nav>

      <section id="top" className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">XBT-001 / COMPETITIVE CULTURE LAB</p>
          <h1>{activeTab === "brackets" ? <>Make noise.<br /><em>Leave a mark.</em></> : <>Back the<br /><em>next signal.</em></>}</h1>
          <p className="intro">{settings.intro}</p>
          <button className="primary-action" onClick={() => setDrawerOpen(true)}>ENTER THE FEED <span>↗</span></button>
        </div>
        <div className="hero-stat">
          <span className="stat-label">LIVE INDEX</span>
          <strong>{activeTab === "brackets" ? "08" : "$250K"}</strong>
          <span className="stat-foot">{activeTab === "brackets" ? "OPEN BRACKET SIGNALS" : "COMMUNITY CAPITAL TARGET"}</span>
        </div>
      </section>

      <section className="signal-section" aria-label="Visual signal board">
        <div className="section-heading"><span>FIELD NOTES</span><span>01—05 / VISUAL SIGNALS</span></div>
        <div className="signal-grid">
          {visualSlots.map((slot, index) => (
            <figure className={`visual-slot ${slot.className ?? ""}`} key={slot.label}>
              <img src={settings.signals?.[index] || slot.src} alt="" loading="lazy" />
              <div className="slot-overlay"><span>{slot.label}</span><span>↗</span></div>
            </figure>
          ))}
          <div className="visual-slot embed-slot"><span className="plus">＋</span><span>DROP YOUR<br />NEXT SIGNAL</span><small>PASTE A VISUAL URL</small></div>
        </div>
      </section>

      <footer className="footer"><span>XBTE / BROOKLYN, NY</span><span>BUILT FOR THE NEXT ROUND <b>↗</b></span></footer>

      <button className={`pull-tag ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(!drawerOpen)} aria-expanded={drawerOpen} aria-controls="brand-drawer">{drawerOpen ? "CLOSE" : "ABOUT XBTE"}<span>↗</span></button>
      <aside id="brand-drawer" className={`drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <p className="eyebrow">THE SHORT VERSION</p>
        <h2>Built by the<br /><em>players.</em></h2>
        <p>XBTE connects competitive play, creative production, and access to funding under one unmistakable signal. We are here for the people making the scene harder to ignore.</p>
        <a href="mailto:hello@xbtesports.nyc">hello@xbtesports.nyc ↗</a>
      </aside>
    </main>
  );
}
