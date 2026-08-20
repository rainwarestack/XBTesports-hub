(function () {
  const KEY = 'xbtesports-scoreboard-v1';
  const initial = {
    mode: 'compact', title: 'FFA LIVE', event: 'XBTesports™ / BLACK OPS 7', showMovement: false, alert: null,
    players: [
      { id: 'p1', position: 1, gamertag: 'Xx_Blakelol', kd: '2.41', visible: true },
      { id: 'p2', position: 2, gamertag: 'Dr. Popcornfloor', kd: '1.87', visible: true },
      { id: 'p3', position: 3, gamertag: 'chaos787', kd: '1.63', visible: true },
      { id: 'p4', position: 4, gamertag: 'Guard_Moth', kd: '1.42', visible: true },
      { id: 'p5', position: 5, gamertag: 'deeronION', kd: '1.21', visible: true },
      { id: 'p6', position: 6, gamertag: 'niGht_sunshine', kd: '1.08', visible: true },
      { id: 'p7', position: 7, gamertag: 'Xgrumpy_KRTkido', kd: '0.98', visible: true },
      { id: 'p8', position: 8, gamertag: 'dark_fox_00', kd: '0.86', visible: false }
    ]
  };
  const API_URL = window.XBT_SCOREBOARD_API || '';
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  function localRead() { try { return { ...initial, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return initial; } }
  window.XBTScoreboard = { KEY, initial, API_URL, read: localRead,
    async fetch() { if (!API_URL) return localRead(); try { const response = await fetch(API_URL + '/scoreboard', { cache: 'no-store' }); if (!response.ok) throw new Error('scoreboard unavailable'); const data = await response.json(); localStorage.setItem(KEY, JSON.stringify(data)); return data; } catch { return localRead(); } },
    async save(data) { localStorage.setItem(KEY, JSON.stringify(data)); channel?.postMessage(data); window.dispatchEvent(new CustomEvent('xbte-scoreboard', { detail: data })); if (API_URL) { await fetch(API_URL + '/scoreboard', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }); } }
  };
})();
