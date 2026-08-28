(function () {
  const KEY = 'xbtesports-scoreboard-v1';
  const initial = {
    mode: 'compact', title: 'FFA LIVE', event: 'XBTesports™ / BLACK OPS 7', showMovement: false, alert: null,
    players: [
      { id: 'p1', position: 1, gamertag: 'Xx_Blakelol', eliminations: 0 },
      { id: 'p2', position: 2, gamertag: 'Dr. Popcornfloor', eliminations: 0 },
      { id: 'p3', position: 3, gamertag: 'chaos787', eliminations: 0 },
      { id: 'p4', position: 4, gamertag: 'Guard_Moth', eliminations: 0 },
      { id: 'p5', position: 5, gamertag: 'deeronION', eliminations: 0 },
      { id: 'p6', position: 6, gamertag: 'niGht_sunshine', eliminations: 0 },
      { id: 'p7', position: 7, gamertag: 'Xgrumpy_KRTkido', eliminations: 0 },
      { id: 'p8', position: 8, gamertag: 'dark_fox_00', eliminations: 0 }
    ]
  };
  const API_URL = window.XBT_SCOREBOARD_API || '';
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  function localRead() { try { return { ...initial, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return initial; } }
  if (location.pathname.includes('/admin') && sessionStorage.xbtAdmin !== '1') {
    if (prompt('XBTesports admin passcode:') === '1400') sessionStorage.xbtAdmin = '1';
    else { document.body.innerHTML = '<h1 style="font-family:Arial;padding:40px">Access denied</h1>'; throw new Error('Admin authentication failed'); }
  }
  window.XBTScoreboard = { KEY, initial, API_URL, read: localRead,
    async fetch() { if (!API_URL) return localRead(); try { const response = await fetch(API_URL + '/scoreboard', { cache: 'no-store' }); if (!response.ok) throw new Error('scoreboard unavailable'); const data = await response.json(); localStorage.setItem(KEY, JSON.stringify(data)); return data; } catch { return localRead(); } },
    async save(data) { localStorage.setItem(KEY, JSON.stringify(data)); channel?.postMessage(data); window.dispatchEvent(new CustomEvent('xbte-scoreboard', { detail: data })); if (API_URL) { await fetch(API_URL + '/scoreboard', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }); } }
  };
})();
