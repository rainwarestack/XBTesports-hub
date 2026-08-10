"use client";

import { useEffect, useState } from "react";

type Settings = { brand: string; hero: string; intro: string; email: string; accent: string };
const defaults: Settings = { brand: "XBT Esports", hero: "Make noise. Leave a mark.", intro: "An independent esports platform for sharp players, brave ideas, and the communities that move culture forward.", email: "hello@xbtesports.nyc", accent: "#125740" };

export default function BuilderPage() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [saved, setSaved] = useState(false);

  useEffect(() => { const stored = window.localStorage.getItem("xbte-builder-settings"); if (stored) setSettings({ ...defaults, ...JSON.parse(stored) }); }, []);
  const update = (key: keyof Settings, value: string) => setSettings((current) => ({ ...current, [key]: value }));
  const save = () => { window.localStorage.setItem("xbte-builder-settings", JSON.stringify(settings)); setSaved(true); window.setTimeout(() => setSaved(false), 2200); };
  const download = () => { const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "xbte-site-settings.json"; link.click(); URL.revokeObjectURL(url); };

  return <main className="builder-shell">
    <header className="builder-top"><a href="/" className="builder-brand"><span className="brand-mark">X</span> XBT ESPORTS</a><a href="/" className="back-link">← VIEW SITE</a></header>
    <section className="builder-intro"><p className="eyebrow">XBTE / BUILDER PORTAL</p><h1>Shape your<br /><em>signal.</em></h1><p>Make changes here, save them on this device, and download your settings when you’re ready to publish.</p></section>
    <div className="builder-grid">
      <section className="builder-card"><div className="card-heading"><span>01 / BASIC DETAILS</span><span>EDIT</span></div>
        <label>Brand name<input value={settings.brand} onChange={(e) => update("brand", e.target.value)} /></label>
        <label>Main headline<textarea rows={2} value={settings.hero} onChange={(e) => update("hero", e.target.value)} /></label>
        <label>Short introduction<textarea rows={4} value={settings.intro} onChange={(e) => update("intro", e.target.value)} /></label>
        <label>Contact email<input type="email" value={settings.email} onChange={(e) => update("email", e.target.value)} /></label>
        <label>Primary color<div className="color-field"><input type="color" value={settings.accent} onChange={(e) => update("accent", e.target.value)} /><code>{settings.accent}</code></div></label>
        <div className="builder-actions"><button onClick={save}>{saved ? "SAVED ✓" : "SAVE CHANGES"}</button><button className="secondary" onClick={download}>DOWNLOAD SETTINGS</button></div>
      </section>
      <section className="builder-card preview-card"><div className="card-heading"><span>02 / LIVE PREVIEW</span><span className="preview-dot">● LIVE</span></div><div className="mini-preview" style={{ background: settings.accent }}><div className="mini-brand">{settings.brand}</div><div><p>COMPETITIVE CULTURE LAB</p><h2>{settings.hero}</h2><span>{settings.intro}</span></div><small>{settings.email}</small></div><p className="helper">Your preview updates as you type. The live public site changes after the settings file is published through GitHub.</p></section>
    </div>
  </main>;
}
