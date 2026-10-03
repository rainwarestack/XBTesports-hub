var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// social/core.mjs
var fail = /* @__PURE__ */ __name((message, status = 400) => Object.assign(new Error(message), { status }), "fail");
var now = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "now");
var id = /* @__PURE__ */ __name(() => crypto.randomUUID(), "id");
var query = /* @__PURE__ */ __name((db, sql, ...args) => db.prepare(sql).bind(...args), "query");
var one = /* @__PURE__ */ __name((db, sql, ...args) => query(db, sql, ...args).first(), "one");
var rows = /* @__PURE__ */ __name(async (db, sql, ...args) => (await query(db, sql, ...args).all()).results, "rows");
var run = /* @__PURE__ */ __name((db, sql, ...args) => query(db, sql, ...args).run(), "run");
function str(value, name, max = 1e3, required = false) {
  if (value == null) value = "";
  if (typeof value !== "string" || value.length > max || required && !value.trim()) throw fail(`Check ${name}.`);
  return value.trim();
}
__name(str, "str");
function num(value, name, min = 0, max = 1e5) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw fail(`Check ${name}.`);
  return n;
}
__name(num, "num");
function choice(value, choices, name) {
  if (!choices.includes(value)) throw fail(`Choose a valid ${name}.`);
  return value;
}
__name(choice, "choice");
async function read(request, limit = 65536) {
  const r = request.body?.getReader();
  if (!r) throw fail("Missing request.");
  let size = 0;
  const parts = [];
  while (true) {
    const x = await r.read();
    if (x.done) break;
    size += x.value.length;
    if (size > limit) {
      await r.cancel();
      throw fail("Upload is too large.", 413);
    }
    parts.push(x.value);
  }
  const data = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    data.set(p, o);
    o += p.length;
  }
  return data;
}
__name(read, "read");
async function body(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw fail("JSON required.", 415);
  try {
    return JSON.parse(new TextDecoder().decode(await read(request)));
  } catch (e) {
    if (e.status) throw e;
    throw fail("Invalid JSON.");
  }
}
__name(body, "body");
var hash = /* @__PURE__ */ __name(async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (x) => x.toString(16).padStart(2, "0")).join(""), "hash");
var secret = /* @__PURE__ */ __name(() => Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, "0")).join(""), "secret");
function url(value) {
  const s = str(value, "link", 2048);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password) throw Error();
    return u.href;
  } catch {
    throw fail("Links must start with https://.");
  }
}
__name(url, "url");
async function rate(db, key, max = 30, seconds = 60) {
  const t = Math.floor(Date.now() / 1e3);
  const result2 = await one(db, "INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count", key, t + seconds, t, t);
  if (result2.count > max) throw fail("Please wait before trying again.", 429);
}
__name(rate, "rate");
async function notify(db, user, text, link) {
  if (user) await run(db, "INSERT INTO notifications VALUES(?,?,?,?,0,?)", id(), user, text, link, now());
}
__name(notify, "notify");
async function notifyMany(db, recipients, text, link) {
  const data = [...new Set(recipients.filter(Boolean))].map((user) => ({ id: id(), user, text, link, created: now() }));
  if (data.length) await run(db, "INSERT INTO notifications SELECT json_extract(value,'$.id'),json_extract(value,'$.user'),json_extract(value,'$.text'),json_extract(value,'$.link'),0,json_extract(value,'$.created') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM users WHERE id=json_extract(value,'$.user'))", JSON.stringify(data));
}
__name(notifyMany, "notifyMany");
function page(url2) {
  return Math.min(Math.max(Number(url2.searchParams.get("page")) || 0, 0), 1e4) * 30;
}
__name(page, "page");
function publicProfile(row) {
  if (!row) return null;
  const { password_hash, salt, recovery_hash, ...safe } = row;
  return safe;
}
__name(publicProfile, "publicProfile");

// social/auth.mjs
import { pbkdf2Sync, scryptSync, timingSafeEqual } from "node:crypto";
var reserved = /* @__PURE__ */ new Set(["admin", "administrator", "xbtesports", "support", "tournaments", "social", "official", "system", "moderator", "editor", "host"]);
function handle(value) {
  const s = str(value, "handle", 24, true);
  if (!/^[A-Za-z0-9_]{3,24}$/.test(s) || reserved.has(s.toLowerCase())) throw fail("Use 3\u201324 letters, numbers or underscores. This handle may be reserved.");
  return s;
}
__name(handle, "handle");
function password(value, salt, legacy = false) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) throw fail("Use a password of 12\u2013128 characters.");
  if (legacy) return pbkdf2Sync(value, salt, 21e4, 32, "sha512").toString("hex");
  return "scrypt-v1$" + scryptSync(value, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString("hex");
}
__name(password, "password");
var equal = /* @__PURE__ */ __name((a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)), "equal");
async function actor(request, db) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const user = await one(db, "SELECT u.*,p.* FROM sessions s JOIN users u ON u.id=s.user_id JOIN profiles p ON p.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?", await hash(token), Date.now());
  if (!user) return null;
  if (["banned", "suspended"].includes(user.status)) throw fail("This account is suspended.", 403);
  await run(db, "UPDATE users SET last_active=? WHERE id=? AND (last_active IS NULL OR last_active<?)", (/* @__PURE__ */ new Date()).toISOString(), user.id, new Date(Date.now() - 3e5).toISOString());
  return publicProfile(user);
}
__name(actor, "actor");
function requireUser(user, write = false) {
  if (!user) throw fail("Sign in to continue.", 401);
  if (write && user.status === "muted") throw fail("This account is currently muted.", 403);
  return user;
}
__name(requireUser, "requireUser");
function staff(user, roles = ["editor", "administrator"]) {
  requireUser(user);
  if (!roles.includes(user.role)) throw fail("This action requires an authorized editor.", 403);
}
__name(staff, "staff");
async function session(db, user) {
  const token = secret();
  await run(db, "INSERT INTO sessions VALUES(?,?,?)", await hash(token), user.id, Date.now() + 864e5);
  return { token, user: publicProfile(await one(db, "SELECT u.*,p.* FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=?", user.id)) };
}
__name(session, "session");
async function authRoute(request, env, path, user) {
  const db = env.SOCIAL_DB;
  if (path === "/session" && request.method === "GET") return { user };
  if (path === "/logout" && request.method === "POST") {
    const t = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (t) await run(db, "DELETE FROM sessions WHERE token_hash=?", await hash(t));
    if (user) await run(db, "DELETE FROM chat_presence WHERE user_id=?", user.id);
    return { ok: true };
  }
  if (["/signup", "/login", "/recover"].includes(path) && request.method === "POST") {
    await rate(db, "auth-ip:" + await hash(request.headers.get("CF-Connecting-IP") || "local"), 12, 900);
    const b = await body(request), h = str(b.handle, "handle", 24, true);
    await rate(db, "auth-h:" + h.toLowerCase(), 10, 900);
    if (path === "/signup") {
      handle(h);
      const salt = secret(), recovery = secret(), uid = id(), digest2 = password(b.password, salt);
      try {
        await db.batch([query(db, "INSERT INTO users(id,handle,password_hash,salt,recovery_hash,created_at) VALUES(?,?,?,?,?,?)", uid, h, digest2, salt, await hash(recovery), now()), query(db, "INSERT INTO profiles(user_id,display_name,presence) VALUES(?,?,'online')", uid, h)]);
      } catch (e) {
        if (String(e).includes("UNIQUE")) throw fail("That handle is already taken.", 409);
        throw e;
      }
      return { ...await session(db, { id: uid }), recovery };
    }
    const row = await one(db, "SELECT * FROM users WHERE handle=?", h);
    if (path === "/recover") {
      if (!row || !equal(await hash(str(b.recovery, "recovery key", 128, true)), row.recovery_hash)) throw fail("Handle or recovery key is incorrect.", 401);
      const salt = secret(), recovery = secret();
      await db.batch([query(db, "UPDATE users SET password_hash=?,salt=?,recovery_hash=? WHERE id=?", password(b.password, salt), salt, await hash(recovery), row.id), query(db, "DELETE FROM sessions WHERE user_id=?", row.id)]);
      return { recovery, ok: true };
    }
    const digest = password(b.password, row?.salt || "nonexistent-account", !!row?.password_hash && !row.password_hash.startsWith("scrypt-v1$"));
    if (!row || !equal(digest, row.password_hash)) throw fail("Handle or password is incorrect.", 401);
    if (["banned", "suspended"].includes(row.status)) throw fail("This account is suspended.", 403);
    return session(db, row);
  }
  if (path === "/profile" && request.method === "PUT") {
    requireUser(user, true);
    const b = await body(request);
    b.country = str(b.country, "country", 2).toUpperCase();
    if (b.country && !/^[A-Z]{2}$/.test(b.country)) throw fail("Choose a country flag or none.");
    const fontURL = str(b.font_url, "font URL", 1e3);
    if (fontURL && (!/^\/api\/social\/media\/[a-f0-9-]{36}$/.test(fontURL) || !await one(db, "SELECT 1 FROM media WHERE id=? AND user_id=? AND kind='font'", fontURL.split("/").pop(), user.id))) throw fail("Upload your own font first.");
    const values = [str(b.display_name, "display name", 40, true), str(b.bio, "bio", 500), str(b.country, "country", 2), str(b.avatar, "avatar", 200), str(b.banner, "banner", 200), /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : choice(b.color, ["teal", "white", "blue", "red", "gold"], "color"), choice(b.font, ["condensed", "tactical", "mono", "bold", "standard"], "font"), str(b.games, "games", 200), str(b.platform, "platform", 60), str(b.gamertag, "gamertag", 80), str(b.region, "region", 80), str(b.preferred_role, "preferred role", 80), choice(b.presence, ["online", "away", "in tournament", "offline"], "presence")];
    for (const media of [b.avatar, b.banner]) if (media) {
      if (!/^\/api\/social\/media\/[a-f0-9-]{36}$/.test(media) || !await one(db, "SELECT 1 FROM media WHERE id=? AND user_id=? AND kind='image'", media.split("/").pop(), user.id)) throw fail("Upload your own profile image first.");
    }
    await run(db, "UPDATE profiles SET display_name=?,bio=?,country=?,avatar=?,banner=?,color=?,font=?,games=?,platform=?,gamertag=?,region=?,preferred_role=?,presence=?,font_url=? WHERE user_id=?", ...values, fontURL, user.id);
    return { ok: true };
  }
  return void 0;
}
__name(authRoute, "authRoute");

// social/integrations.mjs
var cache = /* @__PURE__ */ new Map();
var twitchToken;
var enabled = /* @__PURE__ */ __name((env) => ({ igdb: !!(env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET), lastfm: !!env.LASTFM_API_KEY, unsplash: !!env.UNSPLASH_ACCESS_KEY }), "enabled");
async function cached(key, seconds, load) {
  const old = cache.get(key);
  if (old?.expires > Date.now()) return old.data;
  const data = await load();
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
  cache.set(key, { expires: Date.now() + seconds * 1e3, data });
  return data;
}
__name(cached, "cached");
async function json(url2, options = {}) {
  try {
    const r = await fetch(url2, { ...options, signal: AbortSignal.timeout(8e3), redirect: "error" });
    if (!r.ok) throw Error();
    const d = await r.json();
    if (d.error) throw Error();
    return d;
  } catch {
    throw fail("This provider is unavailable. Please try again later.", 502);
  }
}
__name(json, "json");
var safeURL = /* @__PURE__ */ __name((value, host) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === host && !u.username && !u.password ? u.href : "";
  } catch {
    return "";
  }
}, "safeURL");
async function games(env, query2) {
  if (!enabled(env).igdb) throw fail("Game search is not connected yet.", 503);
  return cached("games:" + query2, 3600, async () => {
    if (!twitchToken || twitchToken.expires < Date.now() || twitchToken.client !== env.IGDB_CLIENT_ID) {
      const d2 = await json("https://id.twitch.tv/oauth2/token", { method: "POST", body: new URLSearchParams({ client_id: env.IGDB_CLIENT_ID, client_secret: env.IGDB_CLIENT_SECRET, grant_type: "client_credentials" }) });
      twitchToken = { value: d2.access_token, expires: Date.now() + Math.max(0, d2.expires_in - 60) * 1e3, client: env.IGDB_CLIENT_ID };
    }
    const d = await json("https://api.igdb.com/v4/games", { method: "POST", headers: { "Client-ID": env.IGDB_CLIENT_ID, Authorization: "Bearer " + twitchToken.value, "Content-Type": "text/plain" }, body: query2 });
    return d.map((g) => ({ id: g.id, name: String(g.name).slice(0, 150), cover: /^[A-Za-z0-9_]+$/.test(g.cover?.image_id || "") ? "https://images.igdb.com/igdb/image/upload/t_cover_big/" + g.cover.image_id + ".jpg" : "", url: safeURL(g.url, "www.igdb.com") }));
  });
}
__name(games, "games");
async function photo(env, id2) {
  return cached("photo:" + id2, 3600, async () => {
    const d = await json("https://api.unsplash.com/photos/" + encodeURIComponent(id2), { headers: { Authorization: "Client-ID " + env.UNSPLASH_ACCESS_KEY } });
    return normalizePhoto(d);
  });
}
__name(photo, "photo");
function normalizePhoto(p) {
  return { id: p.id, url: safeURL(p.urls?.regular, "images.unsplash.com"), thumb: safeURL(p.urls?.small, "images.unsplash.com"), name: String(p.user?.name || "Photographer").slice(0, 120), profile: safeURL(p.user?.links?.html, "unsplash.com"), download: safeURL(p.links?.download_location, "api.unsplash.com"), alt: String(p.alt_description || "Profile banner").slice(0, 200) };
}
__name(normalizePhoto, "normalizePhoto");
var defaults = /* @__PURE__ */ __name(() => ({ lastfm: "", clock: false, games: [], shots: [], timezone: "America/New_York" }), "defaults");
async function profileExtras(db, uid) {
  const r = await one(db, "SELECT * FROM profile_extras WHERE user_id=?", uid);
  return r ? { lastfm: r.lastfm, clock: !!r.clock, games: JSON.parse(r.games), shots: JSON.parse(r.shots), timezone: r.timezone } : defaults();
}
__name(profileExtras, "profileExtras");
async function integrationsRoute(request, env, path, user) {
  const u = new URL(request.url), db = env.SOCIAL_DB, method = request.method;
  if (path === "/integrations" && method === "GET") return enabled(env);
  if (path === "/profile/extras") {
    requireUser(user, method !== "GET");
    if (method === "GET") return profileExtras(db, user.id);
    if (method !== "PUT") return;
    const b = await body(request), lastfm = str(b.lastfm, "Last.fm username", 32);
    if (lastfm && !/^[A-Za-z0-9_-]{1,32}$/.test(lastfm)) throw fail("Enter a Last.fm username, not a URL.");
    if (typeof b.clock !== "boolean" || !Array.isArray(b.games) || b.games.length > 8 || b.games.some((id2) => !Number.isSafeInteger(id2) || id2 < 1)) throw fail("Choose up to eight games.");
    const previous = await profileExtras(db, user.id), ids = [...new Set(b.games)];
    let selected;
    if (ids.every((id2) => previous.games.some((g) => g.id === id2))) selected = ids.map((id2) => previous.games.find((g) => g.id === id2));
    else {
      await rate(db, "igdb:" + user.id, 20, 60);
      selected = await games(env, `fields name,cover.image_id,url; where id = (${ids.join(",")}); limit 8;`);
      if (selected.length !== ids.length) throw fail("Choose games from the search results.");
    }
    const timezone = str(b.timezone, "timezone", 80, true);
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      throw fail("Choose a valid timezone.");
    }
    if (!Array.isArray(b.shots) || b.shots.length > 6) throw fail("Choose up to six favorite shots.");
    const shots = [];
    for (const item of b.shots) {
      const key = str(item?.id, "image", 80, true), source = item?.source;
      if (source === "upload") {
        if (!/^[a-f0-9-]{36}$/.test(key) || !await one(db, "SELECT 1 FROM media WHERE id=? AND user_id=? AND kind='image'", key, user.id)) throw fail("Upload your own screenshot first.");
        shots.push({ id: key, source, url: "/api/social/media/" + key, alt: "Favorite screenshot" });
        continue;
      }
      if (source !== "unsplash" || !/^[A-Za-z0-9_-]+$/.test(key)) throw fail("Choose an image from the search results.");
      let shot = previous.shots.find((s) => s.source === "unsplash" && s.id === key);
      if (!shot) {
        if (!enabled(env).unsplash) throw fail("Image search is not connected yet.", 503);
        await rate(db, "unsplash:" + user.id, 20, 60);
        shot = await photo(env, key);
        if (!shot.url || !shot.download || !shot.profile) throw fail("Choose another image.");
        await json(shot.download, { headers: { Authorization: "Client-ID " + env.UNSPLASH_ACCESS_KEY } });
        shot = { ...shot, source: "unsplash" };
        delete shot.download;
      }
      if (!shots.some((s) => s.source === source && s.id === key)) shots.push(shot);
    }
    await run(db, "INSERT INTO profile_extras(user_id,lastfm,clock,games,shots,timezone) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET lastfm=excluded.lastfm,clock=excluded.clock,games=excluded.games,shots=excluded.shots,timezone=excluded.timezone", user.id, lastfm, b.clock ? 1 : 0, JSON.stringify(selected), JSON.stringify(shots), timezone);
    return { ok: true };
  }
  if (path === "/integrations/games" && method === "GET") {
    requireUser(user);
    await rate(db, "igdb:" + user.id, 20, 60);
    const q = str(u.searchParams.get("q"), "search", 60, true);
    if (q.length < 2) return { items: [] };
    return { items: await games(env, `search ${JSON.stringify(q)}; fields name,cover.image_id,url; limit 8;`) };
  }
  if (path === "/integrations/photos" && method === "GET") {
    requireUser(user);
    if (!enabled(env).unsplash) throw fail("Photo search is not connected yet.", 503);
    await rate(db, "unsplash:" + user.id, 15, 60);
    const q = str(u.searchParams.get("q"), "search", 60, true);
    return cached("photos:" + q, 600, async () => {
      const d = await json("https://api.unsplash.com/search/photos?" + new URLSearchParams({ query: q, per_page: "8", orientation: "landscape", content_filter: "high" }), { headers: { Authorization: "Client-ID " + env.UNSPLASH_ACCESS_KEY } });
      return { items: d.results.map(normalizePhoto).map(({ download, ...p }) => p) };
    });
  }
  if (path.startsWith("/profile/extras/") && method === "GET") {
    const handle2 = decodeURIComponent(path.slice("/profile/extras/".length));
    const p = await one(db, "SELECT id FROM users WHERE handle=? AND status NOT IN ('banned','suspended')", handle2);
    if (!p) throw fail("Player not found.", 404);
    const data = await profileExtras(db, p.id);
    return data;
  }
  if (path.startsWith("/integrations/music/") && method === "GET") {
    if (!enabled(env).lastfm) throw fail("Music is not connected yet.", 503);
    await rate(db, "music-ip:" + (request.headers.get("CF-Connecting-IP") || "local"), 60, 60);
    const p = await one(db, "SELECT e.lastfm FROM profile_extras e JOIN users u ON u.id=e.user_id WHERE u.handle=? AND u.status NOT IN ('banned','suspended')", decodeURIComponent(path.slice("/integrations/music/".length)));
    if (!p?.lastfm) return { tracks: [] };
    return cached("music:" + p.lastfm, 60, async () => {
      const d = await json("https://ws.audioscrobbler.com/2.0/?" + new URLSearchParams({ method: "user.getRecentTracks", user: p.lastfm, api_key: env.LASTFM_API_KEY, format: "json", limit: "3" }));
      const list = d.recenttracks?.track;
      return { tracks: (Array.isArray(list) ? list : list ? [list] : []).map((t) => ({ name: String(t.name).slice(0, 200), artist: String(t.artist?.["#text"] || "").slice(0, 200), url: safeURL(t.url, "www.last.fm"), playing: t["@attr"]?.nowplaying === "true" })) };
    });
  }
}
__name(integrationsRoute, "integrationsRoute");

// social/oauth.mjs
var providers = { discord: { name: "Discord", prefix: "DISCORD", authorize: "https://discord.com/oauth2/authorize", token: "https://discord.com/api/oauth2/token", identity: "https://discord.com/api/v10/users/@me", scope: "identify" }, google: { name: "Google", prefix: "GOOGLE", authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", identity: "https://openidconnect.googleapis.com/v1/userinfo", scope: "openid profile" } };
var configured = /* @__PURE__ */ __name((env, key) => !!(providers[key] && env[providers[key].prefix + "_CLIENT_ID"] && env[providers[key].prefix + "_CLIENT_SECRET"] && env.OAUTH_BASE_URL), "configured");
var redirect = /* @__PURE__ */ __name((env, key = "discord") => env.OAUTH_BASE_URL + "/api/social/oauth/" + (key === "google" ? "google/" : "") + "callback", "redirect");
var cookie = "__Host-xbt-oauth";
async function oauthRoute(request, env, path, user) {
  if (!path.startsWith("/oauth/")) return;
  const db = env.SOCIAL_DB, u = new URL(request.url);
  if (path === "/oauth/providers" && request.method === "GET") return { providers: Object.keys(providers).filter((key) => configured(env, key)).map((key) => providers[key].name) };
  if (path === "/oauth/begin" && request.method === "POST") {
    await rate(db, "oauth:" + await hash(request.headers.get("CF-Connecting-IP") || "local"), 12, 900);
    const b = await body(request), provider = String(b.provider || "discord").toLowerCase();
    if (!configured(env, provider)) throw fail("Provider sign-in is not configured yet.", 503);
    if (!/^[a-f0-9]{64}$/.test(b.challenge || "")) throw fail("Invalid sign-in request.");
    if (b.link) requireUser(user, true);
    const state2 = secret();
    await run(db, "DELETE FROM oauth_flows WHERE expires_at<?", Date.now());
    await run(db, "INSERT INTO oauth_flows(state_hash,verifier_hash,user_id,expires_at,provider,provider_verifier) VALUES(?,?,?,?,?,?)", await hash(state2), b.challenge, b.link ? user.id : null, Date.now() + 6e5, provider, secret());
    return { state: state2, url: env.OAUTH_BASE_URL + "/api/social/oauth/start?state=" + state2 };
  }
  const state = str(u.searchParams.get("state"), "state", 64);
  if (path === "/oauth/start" && request.method === "GET") {
    const flow = state ? await one(db, "SELECT * FROM oauth_flows WHERE state_hash=? AND expires_at>? AND subject IS NULL", await hash(state), Date.now()) : null;
    if (!flow) throw fail("Sign-in expired. Start again.");
    const provider = providers[flow.provider];
    if (!configured(env, flow.provider)) throw fail("Provider unavailable.", 503);
    const authorize = new URL(provider.authorize);
    authorize.search = new URLSearchParams({ client_id: env[provider.prefix + "_CLIENT_ID"], response_type: "code", scope: provider.scope, redirect_uri: redirect(env, flow.provider), state, prompt: flow.provider === "google" ? "select_account" : "consent" });
    if (flow.provider === "google") {
      authorize.searchParams.set("code_challenge", Buffer.from(await hash(flow.provider_verifier), "hex").toString("base64url"));
      authorize.searchParams.set("code_challenge_method", "S256");
    }
    return new Response(null, { status: 302, headers: { Location: authorize.href, "Set-Cookie": `${cookie}=${state}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600` } });
  }
  if (["/oauth/callback", "/oauth/google/callback"].includes(path) && request.method === "GET") {
    const saved = (request.headers.get("Cookie") || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(cookie + "="))?.slice(cookie.length + 1);
    if (!state || saved !== state) throw fail("Sign-in validation failed. Close this window and try again.", 403);
    const flow = await one(db, "SELECT * FROM oauth_flows WHERE state_hash=? AND expires_at>? AND subject IS NULL", await hash(state), Date.now());
    if (!flow || !u.searchParams.get("code")) throw fail("Sign-in cancelled or expired. Close this window and try again.");
    const key = path === "/oauth/google/callback" ? "google" : "discord", provider = providers[key];
    if (flow.provider !== key || !configured(env, key)) throw fail("Provider mismatch. Start sign-in again.", 403);
    const tokenResponse = await fetch(provider.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env[provider.prefix + "_CLIENT_ID"], client_secret: env[provider.prefix + "_CLIENT_SECRET"], grant_type: "authorization_code", code: u.searchParams.get("code"), redirect_uri: redirect(env, key), ...key === "google" ? { code_verifier: flow.provider_verifier } : {} }), signal: AbortSignal.timeout(1e4) });
    if (!tokenResponse.ok) throw fail("The provider could not verify this sign-in. Please retry.", 502);
    const token = await tokenResponse.json();
    const identityResponse = await fetch(provider.identity, { headers: { Authorization: "Bearer " + token.access_token }, signal: AbortSignal.timeout(1e4) });
    if (!identityResponse.ok) throw fail("Provider identity could not be verified.", 502);
    const identity = await identityResponse.json(), subject = key === "google" ? identity.sub : identity.id;
    if (typeof subject !== "string" || !/^[A-Za-z0-9_-]{5,255}$/.test(subject)) throw fail("Invalid provider identity.", 502);
    await run(db, "UPDATE oauth_flows SET subject=? WHERE state_hash=? AND subject IS NULL", subject, await hash(state));
    return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Sign-in verified</title><body><h1>Identity verified</h1><p>Return to XBTesports Social to finish signing in. You can close this window.</p></body></html>', { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer", "Set-Cookie": `${cookie}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0` } });
  }
  if (path === "/oauth/complete" && request.method === "POST") {
    const b = await body(request);
    if (!/^[a-f0-9]{64}$/.test(b.verifier || "") || !/^[a-f0-9]{64}$/.test(b.state || "")) throw fail("Invalid sign-in request.");
    const stateHash = await hash(b.state), verifierHash = await hash(b.verifier), flow = await one(db, "SELECT * FROM oauth_flows WHERE state_hash=? AND verifier_hash=? AND expires_at>?", stateHash, verifierHash, Date.now());
    if (!flow) throw fail("Sign-in expired. Start again.", 401);
    if (!flow.subject) return { pending: true };
    const existing = await one(db, "SELECT u.* FROM oauth_identities o JOIN users u ON u.id=o.user_id WHERE o.provider=? AND o.subject=?", flow.provider, flow.subject);
    if (flow.user_id) {
      requireUser(user, true);
      if (user.id !== flow.user_id) throw fail("Sign in to the original account before linking.", 403);
      if (existing && existing.id !== user.id) throw fail("This provider account is already linked to another player.", 409);
    }
    if (existing && ["banned", "suspended"].includes(existing.status)) throw fail("This account is suspended.", 403);
    if (!existing && !flow.user_id && !b.handle) return { needsHandle: true };
    let selectedHandle;
    if (!existing && !flow.user_id) {
      selectedHandle = handle(b.handle);
      if (await one(db, "SELECT 1 FROM users WHERE handle=?", selectedHandle)) throw fail("That handle is already taken. Sign in with its password to link the provider, or choose another handle.", 409);
    }
    const consumed = await one(db, "DELETE FROM oauth_flows WHERE state_hash=? AND verifier_hash=? AND expires_at>? RETURNING state_hash", stateHash, verifierHash, Date.now());
    if (!consumed) throw fail("Sign-in already completed. Start again.", 409);
    const uid = existing?.id || flow.user_id || id();
    if (!existing) {
      try {
        const statements = [];
        if (!flow.user_id) statements.push(query(db, "INSERT INTO users(id,handle,password_hash,salt,recovery_hash,created_at) VALUES(?,?,?,?,?,?)", uid, selectedHandle, "oauth-only", secret(), await hash(secret()), now()), query(db, "INSERT INTO profiles(user_id,display_name) VALUES(?,?)", uid, selectedHandle));
        statements.push(query(db, "INSERT INTO oauth_identities(provider,subject,user_id) VALUES(?,?,?)", flow.provider, flow.subject, uid));
        await db.batch(statements);
      } catch (e) {
        if (String(e).includes("UNIQUE")) throw fail("This account or handle was just linked. Start sign-in again.", 409);
        throw e;
      }
    }
    return { ...await session(db, { id: uid }), linked: !!flow.user_id };
  }
  throw fail("Not found.", 404);
}
__name(oauthRoute, "oauthRoute");

// social/network.mjs
var fields = "u.id,u.handle,p.display_name,p.bio,p.avatar,p.country,p.color,p.font,p.font_url,p.games,p.platform";
var presence = "CASE WHEN cp.seen_at>? AND p.presence<>'offline' THEN p.presence ELSE 'offline' END presence";
var joins = "FROM users u JOIN profiles p ON p.user_id=u.id LEFT JOIN chat_presence cp ON cp.user_id=u.id";
var literal = /* @__PURE__ */ __name((value) => "%" + value.replace(/[\\%_]/g, "\\$&") + "%", "literal");
async function networkRoute(request, env, path, user) {
  const db = env.SOCIAL_DB, method = request.method, u = new URL(request.url), cutoff = Date.now() - 9e4, uid = user?.id || "";
  if (path === "/presence") {
    if (method === "POST") {
      requireUser(user);
      if (user.id !== "access-owner") await run(db, "INSERT INTO chat_presence VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET seen_at=excluded.seen_at", uid, Date.now());
    }
    if (method === "GET" || method === "POST") {
      const items = await rows(db, `SELECT ${fields},p.presence ${joins} WHERE cp.seen_at>? AND p.presence<>'offline' AND u.status IN ('active','muted') ORDER BY lower(u.handle)='rainsoranked' DESC,u.handle LIMIT 100`, cutoff);
      const count = await one(db, `SELECT count(*) n ${joins} WHERE cp.seen_at>? AND p.presence<>'offline' AND u.status IN ('active','muted')`, cutoff);
      return { items, count: count.n };
    }
  }
  if (path === "/players" && method === "GET") {
    const q = literal(str(u.searchParams.get("q"), "search", 80).replace(/^@/, "")), game = literal(str(u.searchParams.get("game"), "game", 80)), platform = literal(str(u.searchParams.get("platform"), "platform", 60)), country = str(u.searchParams.get("country"), "country", 2);
    return { items: await rows(db, `SELECT ${fields},${presence},f.status friendship,f.sender_id friend_sender ${joins} LEFT JOIN friends f ON (f.sender_id=? AND f.recipient_id=u.id) OR (f.recipient_id=? AND f.sender_id=u.id) WHERE u.status NOT IN ('banned','suspended') AND u.id<>'access-owner' AND (u.handle LIKE ? ESCAPE '\\' OR p.display_name LIKE ? ESCAPE '\\') AND p.games LIKE ? ESCAPE '\\' AND p.platform LIKE ? ESCAPE '\\' AND (?='' OR p.country=?) ORDER BY lower(u.handle)='rainsoranked' DESC,cp.seen_at DESC,u.handle LIMIT 30 OFFSET ?`, cutoff, uid, uid, q, q, game, platform, country, country, page(u)) };
  }
  if (path === "/chat" && method === "GET") {
    const after = Math.max(0, Number(u.searchParams.get("after")) || 0), filter = "m.channel='global' AND m.removed=0 AND u.status NOT IN ('banned','suspended') AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=? AND target_id=m.user_id) OR(user_id=m.user_id AND target_id=?)) AND NOT EXISTS(SELECT 1 FROM mutes WHERE user_id=? AND target_id=m.user_id)", join = "FROM messages m JOIN users u ON u.id=m.user_id JOIN profiles p ON p.user_id=u.id";
    const items = (await rows(db, `SELECT m.*,m.rowid cursor,u.handle,p.display_name,p.avatar,p.color,p.font,p.font_url,p.country ${join} WHERE ${filter} ORDER BY m.rowid DESC LIMIT 50`, uid, uid, uid)).reverse();
    const unread = await one(db, `SELECT count(*) n ${join} WHERE ${filter} AND m.rowid>?`, uid, uid, uid, after);
    return { items, cursor: items.at(-1)?.cursor || after, unread: unread.n };
  }
  if (path === "/conversations" && method === "GET") {
    requireUser(user);
    return { items: await rows(db, `SELECT m.content,m.created_at,u.handle,p.display_name,p.avatar,p.color,p.font,p.font_url,p.country FROM messages m JOIN users u ON u.id=CASE WHEN m.user_id=? THEN m.recipient_id ELSE m.user_id END JOIN profiles p ON p.user_id=u.id WHERE m.recipient_id IS NOT NULL AND (m.user_id=? OR m.recipient_id=?) AND m.removed=0 AND u.status NOT IN ('banned','suspended') AND NOT EXISTS(SELECT 1 FROM messages newer WHERE newer.channel=m.channel AND newer.removed=0 AND newer.rowid>m.rowid) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=? AND target_id=u.id) OR(user_id=u.id AND target_id=?)) ORDER BY m.rowid DESC LIMIT 50`, uid, uid, uid, uid, uid) };
  }
  if (path === "/my-crews" && method === "GET") {
    requireUser(user);
    return { items: await rows(db, "SELECT g.id,g.name FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=? AND gm.status='accepted' AND gm.role IN ('owner','moderator') ORDER BY g.name", uid) };
  }
  if (path === "/friends") {
    requireUser(user, method === "POST");
    if (method === "GET") return { items: await rows(db, `SELECT ${fields},f.status friendship,f.sender_id friend_sender ${joins} JOIN friends f ON u.id=CASE WHEN f.sender_id=? THEN f.recipient_id ELSE f.sender_id END WHERE f.sender_id=? OR f.recipient_id=? ORDER BY f.created_at DESC LIMIT 100`, uid, uid, uid) };
    if (method === "POST") {
      const b = await body(request), target = await one(db, "SELECT id FROM users WHERE handle=? AND status NOT IN ('banned','suspended')", str(b.handle, "handle", 24, true));
      if (!target || target.id === uid) throw fail("Choose another player.");
      if (await one(db, "SELECT 1 FROM blocks WHERE(user_id=? AND target_id=?) OR(user_id=? AND target_id=?)", uid, target.id, target.id, uid)) throw fail("This player is unavailable.", 403);
      const key = [uid, target.id].sort().join(":"), f = await one(db, "SELECT * FROM friends WHERE pair_key=?", key);
      if (b.action === "request") {
        if (f) return { status: f.status };
        await run(db, "INSERT INTO friends VALUES(?,?,?,'pending',?)", key, uid, target.id, now());
        await notify(db, target.id, `@${user.handle} sent you a friend request`, "/social/players");
      } else if (b.action === "accept") {
        if (!f || f.recipient_id !== uid || f.status !== "pending") throw fail("Only the recipient can accept a pending request.", 403);
        await run(db, "UPDATE friends SET status='accepted' WHERE pair_key=?", key);
        await notify(db, f.sender_id, `@${user.handle} accepted your friend request`, "/social/players");
      } else if (["decline", "cancel", "remove"].includes(b.action)) {
        if (!f) throw fail("Request not found.", 404);
        if (b.action === "decline" && f.recipient_id !== uid || b.action === "cancel" && f.sender_id !== uid) throw fail("This request cannot be changed.", 403);
        await run(db, "DELETE FROM friends WHERE pair_key=?", key);
      } else throw fail("Choose a friend action.");
      return { ok: true };
    }
  }
  return void 0;
}
__name(networkRoute, "networkRoute");

// social/brackets.mjs
var FORMATS = ["Single Elimination", "Double Elimination", "Round Robin", "Swiss", "Free For All"];
function settings(input = {}) {
  return { roundRobinRounds: Math.floor(num(input.roundRobinRounds ?? 0, "round robin rounds", 0, 128)), tiebreak: choice(input.tiebreak || "buchholz", ["buchholz", "wins", "seed"], "tiebreak"), pairing: choice(input.pairing || "score", ["score", "seed"], "pairing rule"), preventRepeats: input.preventRepeats !== false && input.preventRepeats !== "allow repeats", advancement: typeof input.advancement === "string" ? input.advancement.split(",").filter((x) => x.trim()).map((x) => Math.floor(num(x, "advancement count", 1, 128))) : Array.isArray(input.advancement) ? input.advancement.map((x) => Math.floor(num(x, "advancement count", 1, 128))) : [], rounds: Math.floor(num(input.rounds ?? 3, "rounds", 1, 16)), groups: Math.floor(num(input.groups ?? 1, "groups", 1, 16)), lobbySize: Math.floor(num(input.lobbySize ?? 12, "lobby size", 2, 64)), advance: Math.floor(num(input.advance ?? 4, "advancement count", 1, 63)), winPoints: num(input.winPoints ?? 3, "win points", 0, 100), drawPoints: num(input.drawPoints ?? 1, "draw points", 0, 100), killPoints: num(input.killPoints ?? 1, "elimination points", 0, 100), placementPoints: num(input.placementPoints ?? 10, "placement points", 0, 100), scorePoints: num(input.scorePoints ?? 1, "score multiplier", 0, 100), advanceBy: choice(input.advanceBy ?? "score", ["score", "placement", "eliminations"], "advancement rule") };
}
__name(settings, "settings");
function match(id2, round, sources, section = "Winners") {
  return { id: id2, round, sources, section, players: [], status: "Waiting", scores: [], winner: null, loser: null, map: "", mode: "", notes: "", stream: "", start: "", proof: "", result: null };
}
__name(match, "match");
function seeds(n) {
  let s = [1, 2];
  for (let count = 4; count <= n; count *= 2) s = s.flatMap((x) => [x, count + 1 - x]);
  return s;
}
__name(seeds, "seeds");
function elimination(players, double, slots = players.map((p) => p.id)) {
  let n = 2;
  while (n < slots.length) n *= 2;
  const matches = [], k = Math.log2(n), seedOrder = seeds(n);
  for (let r = 1; r <= k; r++) for (let j = 0; j < n / 2 ** r; j++) {
    const sources = r === 1 ? [{ player: slots[seedOrder[j * 2] - 1] || null }, { player: slots[seedOrder[j * 2 + 1] - 1] || null }] : [{ win: `W${r - 1}-${j * 2}` }, { win: `W${r - 1}-${j * 2 + 1}` }];
    matches.push(match(`W${r}-${j}`, r, sources));
  }
  if (double && n > 2) {
    for (let r = 1; r <= 2 * (k - 1); r++) {
      const count = n / 2 ** (Math.floor((r + 1) / 2) + 1);
      for (let j = 0; j < count; j++) {
        let sources;
        if (r === 1) sources = [{ lose: `W1-${j * 2}` }, { lose: `W1-${j * 2 + 1}` }];
        else if (r % 2 === 0) sources = [{ win: `L${r - 1}-${j}` }, { lose: `W${r / 2 + 1}-${count === 1 ? j : count - 1 - j}` }];
        else sources = [{ win: `L${r - 1}-${j * 2}` }, { win: `L${r - 1}-${j * 2 + 1}` }];
        matches.push(match(`L${r}-${j}`, r, sources, "Losers"));
      }
    }
  }
  if (double) {
    matches.push(match("GF", k + 1, [{ win: `W${k}-0` }, n === 2 ? { lose: "W1-0" } : { win: `L${2 * (k - 1)}-0` }], "Final"));
  }
  return matches;
}
__name(elimination, "elimination");
function robin(players, config) {
  const result2 = [];
  for (let g = 0; g < config.groups; g++) {
    const pool = players.filter((_, i) => i % config.groups === g).map((p) => p.id);
    if (pool.length < 2) continue;
    if (pool.length % 2) pool.push(null);
    const rounds = Math.min(config.roundRobinRounds || pool.length - 1, pool.length - 1);
    for (let r = 1; r <= rounds; r++) {
      for (let i = 0; i < pool.length / 2; i++) result2.push(match(`G${g + 1}-${r}-${i}`, r, [{ player: pool[i] }, { player: pool[pool.length - 1 - i] }], `Pool ${g + 1}`));
      pool.splice(1, 0, pool.pop());
    }
  }
  return result2;
}
__name(robin, "robin");
function createBracket(players, format, config = {}, slots = null) {
  choice(format, FORMATS, "format");
  if (players.length < 2 || players.length > 128) throw fail("A bracket needs 2\u2013128 approved players.");
  if (new Set(players.map((p) => p.id)).size !== players.length) throw fail("Each player must have a unique seed.");
  if (slots && (slots.length > 256 || new Set(slots.filter(Boolean)).size !== players.length || slots.filter(Boolean).length !== players.length || players.some((p) => !slots.includes(p.id)))) throw fail("Invalid player and bye positions.");
  const s = { format, slots: slots || players.map((p) => p.id), config: settings(config), players, matches: [], locked: false, paused: false, completed: false, champion: null };
  if (format.includes("Elimination")) s.matches = elimination(players, format === "Double Elimination", s.slots);
  else if (format === "Round Robin") {
    if (s.config.groups > Math.floor(players.length / 2)) throw fail("Each pool needs at least two players.");
    s.matches = robin(players, s.config);
  } else if (format === "Swiss") swiss(s);
  else ffa(s, players.map((p) => p.id), 1);
  propagate(s);
  return s;
}
__name(createBracket, "createBracket");
function resolve(source, s) {
  if ("player" in source) return { ready: true, id: source.player };
  const m = s.matches.find((m2) => m2.id === (source.win || source.lose));
  return { ready: !!m && m.status === "Completed", id: source.win ? m?.winner : m?.loser };
}
__name(resolve, "resolve");
function propagate(s) {
  for (const m of s.matches) {
    if (m.section === "FFA") continue;
    const resolved = m.sources.map((x) => resolve(x, s));
    if (!resolved.every((x) => x.ready)) {
      m.status = "Waiting";
      m.players = resolved.map((x) => x.id || null);
      continue;
    }
    m.players = resolved.map((x) => x.id || null);
    if (m.status === "Completed") continue;
    const dq = m.players.filter((id2) => id2 && s.disqualified?.includes(id2));
    if (dq.length) {
      m.winner = m.players.find((id2) => id2 && !s.disqualified.includes(id2)) || null;
      m.loser = dq.length === 1 ? dq[0] : null;
      m.status = "Completed";
      m.forfeit = true;
      m.scores = m.players.map((id2) => id2 === m.winner ? 1 : 0);
      continue;
    }
    const real = m.players.filter(Boolean);
    if (real.length < 2) {
      m.status = "Completed";
      m.winner = real[0] || null;
      m.loser = null;
      m.bye = true;
    } else {
      m.status = "Ready";
      m.bye = false;
    }
  }
  if (s.format === "Double Elimination") {
    const gf = s.matches.find((m) => m.id === "GF");
    if (gf?.status === "Completed" && gf.winner === gf.players[1] && !s.matches.some((m) => m.id === "RESET")) {
      s.matches.push(match("RESET", gf.round + 1, gf.players.map((player) => ({ player })), "Final"));
      propagate(s);
      return;
    }
  }
  s.completed = s.matches.length > 0 && s.matches.every((m) => m.status === "Completed") && (s.format !== "Swiss" || Math.max(...s.matches.map((m) => m.round)) >= s.config.rounds) && (s.format !== "Free For All" || Math.max(...s.matches.map((m) => m.round)) >= s.config.rounds || s.matches.at(-1).players.length <= 1);
  if (s.completed) {
    const final = s.matches.at(-1);
    s.champion = s.format.includes("Elimination") ? final.winner : s.format === "Free For All" && s.matches.filter((m) => m.round === final.round).length === 1 ? final.winner : standings(s)[0]?.id || null;
  }
}
__name(propagate, "propagate");
function standings(s) {
  const all = s.players.map((p) => ({ ...p, wins: 0, losses: 0, draws: 0, points: 0, played: 0, eliminations: 0, placements: [], opponents: [], buchholz: 0 })), byId = Object.fromEntries(all.map((p) => [p.id, p]));
  for (const m of s.matches) {
    if (m.status !== "Completed") continue;
    if (m.section === "FFA") {
      for (const entry of m.result || []) {
        const p = byId[entry.id];
        if (!p) continue;
        p.played++;
        p.placements.push(entry.placement);
        p.eliminations += entry.eliminations;
        p.points += entry.total;
        if (entry.placement === 1) p.wins++;
        else p.losses++;
      }
      continue;
    }
    if (m.bye) {
      if (s.format === "Swiss" && byId[m.winner]) byId[m.winner].points += s.config.winPoints;
      continue;
    }
    for (const pid of m.players) {
      const p = byId[pid];
      if (!p) continue;
      p.played++;
      p.opponents.push(...m.players.filter((x) => x && x !== pid));
      if (m.winner === pid) {
        p.wins++;
        p.points += s.config.winPoints;
      } else if (m.winner) {
        p.losses++;
      } else {
        p.draws++;
        p.points += s.config.drawPoints;
      }
    }
  }
  for (const p of all) {
    p.buchholz = p.opponents.reduce((a, id2) => a + (byId[id2]?.points || 0), 0);
    p.averagePlacement = p.placements.length ? p.placements.reduce((a, b) => a + b, 0) / p.placements.length : null;
  }
  return all.sort((a, b) => b.points - a.points || (s.config.tiebreak === "buchholz" ? b.buchholz - a.buchholz : s.config.tiebreak === "wins" ? b.wins - a.wins : 0) || a.seed - b.seed);
}
__name(standings, "standings");
function swiss(s) {
  const round = s.matches.length ? Math.max(...s.matches.map((m) => m.round)) + 1 : 1;
  const ranked = (s.matches.length ? standings(s) : s.players.map((p) => ({ ...p, opponents: [] }))).filter((p) => !s.disqualified?.includes(p.id));
  if (s.config.pairing === "seed") ranked.sort((a, b) => a.seed - b.seed);
  if (ranked.length < 2) {
    s.completed = true;
    s.champion = ranked[0]?.id || null;
    return;
  }
  let budget = 12e3;
  function pair(list) {
    if (!list.length) return [];
    if (--budget < 0) return null;
    const a = list[0];
    for (let i = 1; i < list.length; i++) {
      const b = list[i];
      if (s.config.preventRepeats && a.opponents.includes(b.id)) continue;
      const rest = pair(list.filter((_, j) => j !== 0 && j !== i));
      if (rest) return [[a, b], ...rest];
    }
    return null;
  }
  __name(pair, "pair");
  let bye = null, pairs = null, available = [...ranked];
  if (available.length % 2) {
    const candidates = [...available].reverse().sort((a, b) => Number(s.matches.some((m) => m.bye && m.winner === a.id)) - Number(s.matches.some((m) => m.bye && m.winner === b.id)));
    for (const candidate of candidates) {
      const trial = pair(available.filter((p) => p.id !== candidate.id));
      if (trial) {
        bye = candidate;
        pairs = trial;
        break;
      }
    }
    if (!pairs) {
      bye = candidates[0];
      available = available.filter((p) => p.id !== bye.id);
    }
  } else pairs = pair(available);
  if (!pairs) {
    pairs = [];
    while (available.length) {
      const a = available.shift();
      let i = available.findIndex((p) => !a.opponents.includes(p.id));
      if (i < 0) i = 0;
      pairs.push([a, available.splice(i, 1)[0]]);
    }
  }
  if (bye) s.matches.push(match(`S${round}-bye`, round, [{ player: bye.id }, { player: null }], "Swiss"));
  pairs.forEach(([a, b], i) => s.matches.push(match(`S${round}-${i}`, round, [{ player: a.id }, { player: b.id }], "Swiss")));
}
__name(swiss, "swiss");
function ffa(s, players, round) {
  for (let i = 0; i < players.length; i += s.config.lobbySize) {
    const ids = players.slice(i, i + s.config.lobbySize);
    s.matches.push({ ...match(`FFA${round}-${i / s.config.lobbySize}`, round, ids.map((player) => ({ player })), "FFA"), players: ids, status: ids.length === 1 ? "Completed" : "Ready", winner: ids.length === 1 ? ids[0] : null, bye: ids.length === 1, result: ids.length === 1 ? [{ id: ids[0], placement: 1, eliminations: 0, score: 0, total: 0 }] : null });
  }
}
__name(ffa, "ffa");
function nextRound(s) {
  if (!s.matches.every((m) => m.status === "Completed")) throw fail("Finish the current round first.");
  const round = Math.max(...s.matches.map((m) => m.round));
  if (round >= s.config.rounds) throw fail("All configured rounds are complete.");
  if (s.format === "Swiss") swiss(s);
  else if (s.format === "Free For All") {
    const adv = s.matches.filter((m) => m.round === round).flatMap((m) => [...m.result || []].sort((a, b) => s.config.advanceBy === "placement" ? a.placement - b.placement : s.config.advanceBy === "eliminations" ? b.eliminations - a.eliminations || a.placement - b.placement : b.total - a.total || a.placement - b.placement).slice(0, s.config.advancement[round - 1] || s.config.advance).map((p) => p.id)).filter((id2) => !s.disqualified?.includes(id2));
    if (adv.length < 2) {
      s.completed = true;
      s.champion = adv[0] || null;
      return s;
    }
    ffa(s, adv, round + 1);
  } else throw fail("This format already has its rounds.");
  propagate(s);
  return s;
}
__name(nextRound, "nextRound");
function invalidate(s, id2) {
  const descendants = s.matches.filter((m) => m.sources.some((x) => x.win === id2 || x.lose === id2));
  for (const m of descendants) {
    invalidate(s, m.id);
    m.status = "Waiting";
    m.result = null;
    m.winner = null;
    m.loser = null;
    m.scores = [];
  }
  if (id2 === "GF") s.matches = s.matches.filter((m) => m.id !== "RESET");
}
__name(invalidate, "invalidate");
function result(s, matchId, input) {
  if (s.paused) throw fail("Resume the bracket before entering results.");
  const m = s.matches.find((x) => x.id === matchId);
  if (!m || m.status === "Waiting" || m.bye) throw fail("This match is not ready.");
  if (m.status === "Completed") {
    if (["Swiss", "Free For All"].includes(s.format)) {
      s.matches = s.matches.filter((x) => x.round <= m.round);
    }
    invalidate(s, m.id);
  }
  if (s.format === "Free For All") {
    if (!Array.isArray(input.results) || input.results.length !== m.players.length) throw fail("Enter a result for every lobby player.");
    if (new Set(input.results.map((r) => r.id)).size !== m.players.length || input.results.some((r) => !m.players.includes(r.id))) throw fail("Invalid lobby players.");
    m.result = input.results.map((r) => ({ id: r.id, placement: Math.floor(num(r.placement, "placement", 1, m.players.length)), eliminations: num(r.eliminations, "eliminations", 0, 1e4), score: num(r.score || 0, "score", 0, 1e5) }));
    if (new Set(m.result.map((r) => r.placement)).size !== m.result.length) throw fail("Placements must be unique.");
    for (const r of m.result) r.total = r.eliminations * s.config.killPoints + Math.max(0, s.config.placementPoints - r.placement + 1) + r.score * s.config.scorePoints;
    m.winner = [...m.result].sort((a, b) => a.placement - b.placement)[0].id;
  } else {
    m.scores = [num(input.a, "score", 0, 1e5), num(input.b, "score", 0, 1e5)];
    if (m.scores[0] === m.scores[1] && s.format.includes("Elimination")) throw fail("Elimination matches cannot end in a draw.");
    m.winner = m.scores[0] === m.scores[1] ? null : m.players[m.scores[0] > m.scores[1] ? 0 : 1];
    m.loser = m.winner ? m.players.find((x) => x !== m.winner) : null;
  }
  m.status = "Completed";
  s.completed = false;
  s.champion = null;
  propagate(s);
  return s;
}
__name(result, "result");

// social/tournaments.mjs
var STATUSES = ["Draft", "Registration Open", "Registration Closed", "Check-In", "Live", "Completed", "Cancelled"];
var unpack = /* @__PURE__ */ __name((r) => r ? { ...JSON.parse(r.data), ...r, data: void 0 } : null, "unpack");
async function tournament(db, key, user) {
  const t = unpack(await one(db, "SELECT * FROM tournaments WHERE id=? OR slug=?", key, key));
  if (!t || t.status === "Draft" && !canManage(user, t)) throw fail("Tournament not found.", 404);
  return t;
}
__name(tournament, "tournament");
var canManage = /* @__PURE__ */ __name((u, t) => u && (["editor", "administrator"].includes(u.role) || u.role === "host" && t.owner_id === u.id), "canManage");
function manage(u, t) {
  requireUser(u);
  if (!canManage(u, t)) throw fail("Only an assigned tournament host or editor can do this.", 403);
}
__name(manage, "manage");
function date(v, label, required = false) {
  const s = str(v, label, 40, required);
  if (s && (!/T.*(Z|[+-]\d\d:\d\d)$/.test(s) || !Number.isFinite(Date.parse(s)))) throw fail(`${label} must include a valid timezone.`);
  return s;
}
__name(date, "date");
function validateTournament(b) {
  const title = str(b.title, "tournament name", 120, true), slug = str(b.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "slug", 120, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw fail("Use lowercase letters, numbers and hyphens for the URL.");
  const timezone = str(b.timezone || "America/New_York", "timezone", 80);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw fail("Invalid timezone.");
  }
  const data = { description: str(b.description, "description", 5e3), rules: str(b.rules, "rules", 1e4), start: date(b.start, "Start", true), registrationOpen: date(b.registrationOpen, "Registration opening"), registrationClose: date(b.registrationClose, "Registration closing"), min: Math.floor(num(b.min ?? 2, "minimum players", 2, 128)), max: Math.floor(num(b.max ?? 32, "maximum players", 2, 128)), region: str(b.region, "region", 80), timezone, registration: choice(b.registration || "Open", ["Open", "Invite Code", "Hybrid", "Private"], "registration mode"), banner: url(b.banner), thumbnail: url(b.thumbnail), stream: url(b.stream), config: settings(b.config) };
  if (data.min > data.max) throw fail("Minimum players cannot exceed maximum.");
  if (data.registrationOpen && data.registrationClose && data.registrationOpen >= data.registrationClose) throw fail("Registration must close after opening.");
  return { title, slug, game: str(b.game, "game", 120, true), format: choice(b.format, FORMATS, "format"), status: choice(b.status || "Draft", STATUSES, "status"), ...data };
}
__name(validateTournament, "validateTournament");
async function bracket(db, t) {
  const b = await one(db, "SELECT * FROM brackets WHERE tournament_id=?", t.id);
  return b ? { ...JSON.parse(b.data), revision: b.revision } : null;
}
__name(bracket, "bracket");
async function saveBracket(db, t, s, revision) {
  const mutation = id();
  const statements = [query(db, "UPDATE brackets SET data=?,revision=revision+1,mutation=? WHERE tournament_id=? AND revision=?", JSON.stringify(s), mutation, t.id, revision), query(db, "DELETE FROM matches WHERE tournament_id=? AND EXISTS(SELECT 1 FROM brackets WHERE tournament_id=? AND mutation=?)", t.id, t.id, mutation)];
  statements.push(query(db, "INSERT INTO matches(id,tournament_id,round,status,data) SELECT ? || ':' || json_extract(value,'$.id'),?,json_extract(value,'$.round'),json_extract(value,'$.status'),value FROM json_each(?) WHERE EXISTS(SELECT 1 FROM brackets WHERE tournament_id=? AND mutation=?)", t.id, t.id, JSON.stringify(s.matches), t.id, mutation));
  const r = await db.batch(statements);
  if (!r[0].meta.changes) throw fail("Another editor changed the bracket. Reload before saving.", 409);
  return { ...s, revision: revision + 1 };
}
__name(saveBracket, "saveBracket");
async function tournamentRoute(request, env, path, user) {
  const db = env.SOCIAL_DB, method = request.method, u = new URL(request.url);
  if (path === "/games" && method === "GET") return { items: await rows(db, "SELECT * FROM games WHERE title LIKE ? ORDER BY title LIMIT 50", "%" + str(u.searchParams.get("q"), "search", 80) + "%") };
  if (path === "/games" && method === "POST") {
    staff(user);
    const b = await body(request);
    await run(db, "INSERT INTO games VALUES(?,?,?,?,?,?)", id(), str(b.title, "game title", 120, true), str(b.platform, "platform", 80), str(b.genre, "genre", 80), url(b.image), str(b.publisher, "publisher", 100));
    return { ok: true };
  }
  if (path === "/tournaments" && method === "GET") {
    const admin = u.searchParams.get("manage") === "1";
    if (admin) staff(user, ["host", "editor", "administrator"]);
    return { items: (await rows(db, `SELECT * FROM tournaments WHERE ${admin ? user.role === "host" ? "owner_id=?" : "1=1" : "status<>'Draft'"} ORDER BY created_at DESC LIMIT 30 OFFSET ?`, ...admin && user.role === "host" ? [user.id] : [], page(u))).map(unpack) };
  }
  if (path === "/tournaments" && method === "POST") {
    staff(user, ["host", "editor", "administrator"]);
    const input = await body(request), t2 = validateTournament(input);
    let owner = user.id;
    if (input.host) {
      staff(user);
      const host = await one(db, "SELECT id FROM users WHERE handle=? AND role IN ('host','editor','administrator') AND status='active'", str(input.host, "host handle", 24));
      if (!host) throw fail("Choose a player with a host or editor role.");
      owner = host.id;
    }
    const tid = id();
    try {
      await run(db, "INSERT INTO tournaments VALUES(?,?,?,?,?,?,?,?,1,?,?)", tid, t2.slug, t2.title, t2.game, t2.format, t2.status, owner, JSON.stringify(t2), now(), now());
    } catch (e) {
      if (String(e).includes("UNIQUE")) throw fail("That tournament URL is already used.", 409);
      throw e;
    }
    return { id: tid, slug: t2.slug };
  }
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "tournaments" || !parts[1]) return void 0;
  const t = await tournament(db, parts[1], user), action = parts[2];
  if (!action && method === "GET") {
    const s = await bracket(db, t);
    return { tournament: t, bracket: s, standings: s ? standings(s) : [], players: await rows(db, "SELECT r.id,r.user_id,r.status,r.checked_in,r.seed,r.created_at,u.handle,p.display_name,p.avatar,p.gamertag FROM registrations r JOIN users u ON u.id=r.user_id JOIN profiles p ON p.user_id=u.id WHERE r.tournament_id=? AND r.status='approved' ORDER BY r.seed,r.created_at", t.id), registration: user ? await one(db, "SELECT * FROM registrations WHERE tournament_id=? AND user_id=?", t.id, user.id) : null, canManage: !!canManage(user, t) };
  }
  if (!action && method === "PUT") {
    manage(user, t);
    const b = await body(request), v = validateTournament(b);
    if (t.format !== v.format && await bracket(db, t)) throw fail("Reset the bracket before changing format.");
    const r = await run(db, "UPDATE tournaments SET title=?,slug=?,game=?,format=?,status=?,data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?", v.title, v.slug, v.game, v.format, v.status, JSON.stringify(v), now(), t.id, num(b.revision, "revision", 1));
    if (!r.meta.changes) throw fail("Tournament changed. Reload before saving.", 409);
    return { ok: true };
  }
  if (action === "register" && method === "POST") {
    requireUser(user, true);
    const b = await body(request);
    if (t.status !== "Registration Open" || t.registration === "Private" || t.registrationOpen && now() < t.registrationOpen || t.registrationClose && now() > t.registrationClose) throw fail("Registration is closed.");
    if (await one(db, "SELECT id FROM registrations WHERE tournament_id=? AND user_id=?", t.id, user.id)) throw fail("You already have a registration for this tournament.", 409);
    const code = str(b.code, "invite code", 40).toUpperCase();
    let invite;
    if (code) invite = await one(db, "SELECT * FROM invite_codes WHERE code=? AND tournament_id=? AND enabled=1 AND (expires_at IS NULL OR expires_at>?) AND (max_uses IS NULL OR uses<max_uses)", code, t.id, now());
    if (code && !invite || t.registration === "Invite Code" && !invite) throw fail("A valid invitation code is required.");
    const rid = id(), status = invite ? invite.auto_approve ? "approved" : "pending" : "approved";
    const insert = query(db, `INSERT INTO registrations(id,tournament_id,user_id,status,created_at) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM registrations WHERE tournament_id=? AND status IN ('approved','pending')) < ? ${invite ? "AND EXISTS(SELECT 1 FROM invite_codes WHERE id=? AND enabled=1 AND (expires_at IS NULL OR expires_at>?) AND (max_uses IS NULL OR uses<max_uses))" : ""}`, rid, t.id, user.id, status, now(), t.id, t.max, ...invite ? [invite.id, now()] : []);
    const queries = [insert];
    if (invite) queries.push(query(db, "UPDATE invite_codes SET uses=uses+1 WHERE id=? AND EXISTS(SELECT 1 FROM registrations WHERE id=?)", invite.id, rid));
    const r = await db.batch(queries);
    if (!r[0].meta.changes) throw fail("Tournament is full or this invitation is no longer available.", 409);
    await notify(db, user.id, status === "approved" ? "Tournament registration accepted" : "Registration awaiting approval", `/social/tournaments/${t.slug}`);
    return { status };
  }
  if (action === "check-in" && method === "POST") {
    requireUser(user);
    if (t.status !== "Check-In") throw fail("Check-in is not open.");
    await run(db, "UPDATE registrations SET checked_in=1 WHERE tournament_id=? AND user_id=? AND status='approved'", t.id, user.id);
    return { ok: true };
  }
  if (action === "submit-result" && method === "POST") {
    requireUser(user, true);
    const b = await body(request), s = await bracket(db, t), m = s?.matches.find((m2) => m2.id === b.match);
    if (!m || !m.players.includes(user.id)) throw fail("You are not assigned to that match.", 403);
    await run(db, "INSERT INTO result_submissions VALUES(?,?,?,?,?,?,?,?)", id(), t.id, m.id, user.id, JSON.stringify({ a: num(b.a ?? 0, "score"), b: num(b.b ?? 0, "score"), results: b.results || [], proof: url(b.proof) }), "Awaiting Verification", now());
    return { ok: true };
  }
  if (action === "registrations" && method === "GET") {
    manage(user, t);
    return { items: await rows(db, "SELECT r.*,u.handle,p.display_name,p.gamertag FROM registrations r JOIN users u ON r.user_id=u.id JOIN profiles p ON p.user_id=u.id WHERE tournament_id=? ORDER BY seed,created_at LIMIT 128", t.id) };
  }
  if (action === "registrations" && method === "POST") {
    manage(user, t);
    const activeBracket = await bracket(db, t);
    const b = await body(request), player = await one(db, "SELECT id FROM users WHERE handle=?", str(b.handle, "handle", 24, true));
    if (!player) throw fail("No player has that handle.", 404);
    const current = await one(db, "SELECT * FROM registrations WHERE tournament_id=? AND user_id=?", t.id, player.id);
    if (activeBracket && (!current || b.seed && Number(b.seed) !== current.seed)) throw fail("Reset the bracket before changing seeds or adding players.");
    const status = choice(b.status || "approved", ["approved", "pending", "rejected", "banned", "disqualified", "no-show"], "player status");
    await run(db, "INSERT INTO registrations(id,tournament_id,user_id,status,checked_in,seed,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(tournament_id,user_id) DO UPDATE SET status=excluded.status,checked_in=excluded.checked_in,seed=excluded.seed", id(), t.id, player.id, status, b.checked_in ? 1 : 0, b.seed ? Math.floor(num(b.seed, "seed", 1, 128)) : null, now());
    if (activeBracket && ["disqualified", "no-show", "banned"].includes(status)) {
      activeBracket.disqualified = [.../* @__PURE__ */ new Set([...activeBracket.disqualified || [], player.id])];
      propagate(activeBracket);
      await saveBracket(db, t, activeBracket, activeBracket.revision);
    }
    await notify(db, player.id, "Your tournament registration was updated", `/social/tournaments/${t.slug}`);
    return { ok: true };
  }
  if (action === "invitations") {
    manage(user, t);
    if (method === "GET") return { items: await rows(db, "SELECT * FROM invite_codes WHERE tournament_id=? ORDER BY created_at DESC LIMIT 100", t.id) };
    if (method === "POST") {
      const b = await body(request);
      if (b.id) {
        if (b.action === "delete") await run(db, "DELETE FROM invite_codes WHERE id=? AND tournament_id=?", b.id, t.id);
        else await run(db, "UPDATE invite_codes SET enabled=0 WHERE id=? AND tournament_id=?", b.id, t.id);
        return { ok: true };
      }
      const code = "XBT-" + secret().slice(0, 4).toUpperCase() + "-" + secret().slice(0, 8).toUpperCase();
      await run(db, "INSERT INTO invite_codes VALUES(?,?,?,?,0,?,?,1,?)", id(), code, t.id, b.max_uses ? Math.floor(num(b.max_uses, "maximum uses", 1, 1e4)) : null, date(b.expires_at, "Expiration") || null, b.auto_approve ? 1 : 0, now());
      return { code };
    }
  }
  if (action === "submissions" && method === "GET") {
    manage(user, t);
    return { items: await rows(db, "SELECT * FROM result_submissions WHERE tournament_id=? ORDER BY created_at DESC LIMIT 100", t.id) };
  }
  if (action === "bracket" && method === "POST") {
    manage(user, t);
    const b = await body(request), existing = await bracket(db, t);
    let s = existing;
    if (b.action === "generate") {
      if (existing?.locked) throw fail("Unlock the bracket first.");
      if (existing?.matches.some((m) => m.status === "Completed" && !m.bye) && !b.confirmReset) throw fail("Resetting removes recorded results. Confirm the reset.");
      let players = await rows(db, "SELECT r.user_id id,r.seed,p.display_name name,u.handle FROM registrations r JOIN profiles p ON r.user_id=p.user_id JOIN users u ON u.id=r.user_id WHERE tournament_id=? AND r.status='approved' ORDER BY r.seed IS NULL,r.seed,r.created_at", t.id);
      if (players.length < t.min || players.length > t.max) throw fail(`This tournament needs ${t.min}\u2013${t.max} approved players.`);
      if (b.seeding === "random") for (let i = players.length - 1; i > 0; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
        [players[i], players[j]] = [players[j], players[i]];
      }
      if (Array.isArray(b.order)) {
        if (b.order.filter(Boolean).length !== players.length || new Set(b.order.filter(Boolean)).size !== players.length || b.order.some((id2) => id2 && !players.some((p) => p.id === id2))) throw fail("Invalid seed order.");
        players = b.order.filter(Boolean).map((id2) => players.find((p) => p.id === id2));
      }
      players = players.map((p, i) => ({ ...p, seed: i + 1 }));
      s = createBracket(players, t.format, t.config, b.order || null);
      if (!existing) {
        await run(db, "INSERT OR IGNORE INTO brackets VALUES(?,?,1,?)", t.id, JSON.stringify(s), id());
        s = await saveBracket(db, t, s, 1);
      } else s = await saveBracket(db, t, s, num(b.revision, "revision", 1));
      await notifyMany(db, s.matches.filter((m) => m.status === "Ready").flatMap((m) => m.players), "Your tournament match is assigned", `/social/tournaments/${t.slug}`);
      return { bracket: s };
    }
    if (!s) throw fail("Generate a bracket first.");
    const revision = num(b.revision, "revision", 1);
    if (revision !== s.revision) throw fail("Bracket changed. Reload before saving.", 409);
    if (b.action === "result") {
      s = result(s, str(b.match, "match", 80, true), b);
    } else if (b.action === "reject") {
      await run(db, "UPDATE result_submissions SET status='Rejected' WHERE id=? AND tournament_id=?", b.submission, t.id);
      return { ok: true };
    } else if (b.action === "next") s = nextRound(s);
    else if (b.action === "lock") s.locked = true;
    else if (b.action === "unlock") s.locked = false;
    else if (b.action === "pause") s.paused = true;
    else if (b.action === "resume" || b.action === "start") {
      s.paused = false;
      s.locked = true;
    } else if (b.action === "complete") {
      if (!s.completed) throw fail("Finish all matches before completing the tournament.");
    } else if (b.action === "reset") {
      if (s.locked) throw fail("Unlock the bracket first.");
      if (!b.confirmReset) throw fail("Confirm resetting all results.");
      s = createBracket(s.players, t.format, t.config, s.slots);
    } else if (b.action === "match") {
      const m = s.matches.find((m2) => m2.id === b.match);
      if (!m) throw fail("Match not found.");
      Object.assign(m, { map: str(b.map, "map", 100), mode: str(b.mode, "mode", 100), notes: str(b.notes, "notes", 1e3), proof: url(b.proof), stream: url(b.stream), start: date(b.start, "Match start") });
      if (["Ready", "Live", "Disputed", "Scheduled"].includes(b.status) && m.players.filter(Boolean).length >= 2 && m.status !== "Completed") m.status = b.status;
    } else throw fail("Unknown bracket action.");
    s = await saveBracket(db, t, s, revision);
    if (b.action === "result" && b.submission) await run(db, "UPDATE result_submissions SET status='Confirmed' WHERE id=? AND tournament_id=?", b.submission, t.id);
    if (["start", "complete"].includes(b.action)) await run(db, "UPDATE tournaments SET status=?,revision=revision+1,updated_at=? WHERE id=?", b.action === "start" ? "Live" : "Completed", now(), t.id);
    if (["start", "next", "result"].includes(b.action)) await notifyMany(db, b.action === "result" ? s.matches.find((m) => m.id === b.match)?.players || [] : s.players.map((p) => p.id), b.action === "start" ? "Your tournament is starting" : b.action === "result" ? "Your match result was updated" : "Your next tournament round is ready", `/social/tournaments/${t.slug}`);
    return { bracket: s };
  }
  return void 0;
}
__name(tournamentRoute, "tournamentRoute");

// social/telemetry.mjs
async function telemetry(db, userId) {
  const matches = (await rows(db, "SELECT m.data,t.title,t.slug,t.updated_at FROM matches m JOIN tournaments t ON t.id=m.tournament_id WHERE t.status<>'Draft' AND m.status='Completed' AND EXISTS(SELECT 1 FROM json_each(m.data,'$.players') WHERE value=?) ORDER BY t.updated_at DESC,m.round DESC LIMIT 1000", userId)).map((m) => ({ ...JSON.parse(m.data), tournament: m.title, slug: m.slug })).filter((m) => !m.bye);
  const wins = matches.filter((m) => m.winner === userId).length, losses = matches.filter((m) => m.winner && m.winner !== userId).length, placements = matches.flatMap((m) => m.result?.filter((p) => p.id === userId).map((p) => p.placement) || []);
  let streak = 0, best = 0, run2 = 0;
  for (const m of [...matches].reverse()) {
    run2 = m.winner === userId ? run2 + 1 : 0;
    best = Math.max(best, run2);
  }
  for (const m of matches) {
    if (m.winner !== userId) break;
    streak++;
  }
  const entries = await one(db, "SELECT count(*) n FROM registrations r JOIN tournaments t ON t.id=r.tournament_id WHERE r.user_id=? AND t.status<>'Draft' AND r.status='approved'", userId), champions = await one(db, "SELECT count(*) n FROM brackets b JOIN tournaments t ON t.id=b.tournament_id WHERE json_extract(b.data,'$.champion')=? AND t.status='Completed'", userId);
  return { stats: { matches: matches.length, wins, losses, winPercentage: matches.length ? Math.round(wins / matches.length * 100) : 0, entries: entries.n, tournamentWins: champions.n, currentStreak: streak, bestStreak: best, averagePlacement: placements.length ? placements.reduce((a, b) => a + b, 0) / placements.length : null }, recent: matches.slice(0, 10) };
}
__name(telemetry, "telemetry");

// social/community.mjs
var profileFields = "u.id,u.handle,p.display_name,p.bio,p.country,p.avatar,p.banner,p.color,p.font,p.font_url,p.games,p.platform,p.gamertag,p.region,p.preferred_role,p.presence";
var postFields = `p.*,u.handle,pr.display_name,pr.avatar,pr.color,pr.font,pr.font_url,pr.country,(SELECT count(*) FROM likes WHERE post_id=p.id) likes,(SELECT count(*) FROM posts WHERE parent_id=p.id AND removed=0) replies`;
var postJoin = "FROM posts p JOIN users u ON u.id=p.user_id JOIN profiles pr ON pr.user_id=u.id";
var visibleGroup = `(p.group_id IS NULL OR EXISTS(SELECT 1 FROM groups g WHERE g.id=p.group_id AND (g.privacy='Public' OR EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=g.id AND gm.user_id=? AND gm.status='accepted'))))`;
async function group(db, gid, user, write = false) {
  const g = await one(db, "SELECT * FROM groups WHERE id=?", gid);
  if (!g) throw fail("Group not found.", 404);
  const m = user ? await one(db, "SELECT * FROM group_members WHERE group_id=? AND user_id=?", gid, user.id) : null;
  if ((write || g.privacy !== "Public") && m?.status !== "accepted") throw fail("Join this group to continue.", 403);
  return { g, m };
}
__name(group, "group");
async function accessPost(db, pid, user) {
  const p = await one(db, `SELECT p.* FROM posts p WHERE p.id=? AND p.removed=0 AND ${visibleGroup}`, pid, user?.id || "");
  if (!p) throw fail("Post not found.", 404);
  return p;
}
__name(accessPost, "accessPost");
async function blocked(db, a, b) {
  return !!await one(db, "SELECT 1 FROM blocks WHERE (user_id=? AND target_id=?) OR(user_id=? AND target_id=?)", a, b, b, a);
}
__name(blocked, "blocked");
async function communityRoute(request, env, path, user) {
  const db = env.SOCIAL_DB, method = request.method, u = new URL(request.url), parts = path.split("/").filter(Boolean);
  if (path === "/players" && method === "GET") {
    const q = "%" + str(u.searchParams.get("q"), "search", 80) + "%", game = "%" + str(u.searchParams.get("game"), "game", 80) + "%", country = str(u.searchParams.get("country"), "country", 2), platform = "%" + str(u.searchParams.get("platform"), "platform", 60) + "%";
    return { items: await rows(db, `SELECT ${profileFields} FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.status NOT IN ('banned','suspended') AND (u.handle LIKE ? OR p.display_name LIKE ?) AND p.games LIKE ? AND p.platform LIKE ? AND (?='' OR p.country=?) ORDER BY u.last_active DESC,u.created_at DESC LIMIT 30 OFFSET ?`, q, q, game, platform, country, country, page(u)) };
  }
  if (parts[0] === "players" && parts[1] && method === "GET") {
    const p = await one(db, `SELECT ${profileFields} FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.handle=? AND u.status NOT IN ('banned','suspended')`, parts[1].replace(/^@/, ""));
    if (!p) throw fail("Player not found.", 404);
    const record = await telemetry(db, p.id);
    return { profile: { ...p, presence: p.presence !== "offline" && await one(db, "SELECT 1 FROM chat_presence WHERE user_id=? AND seen_at>?", p.id, Date.now() - 9e4) ? p.presence : "offline", preferred_presence: p.presence }, ...record, followers: (await one(db, "SELECT count(*) n FROM follows WHERE following_id=?", p.id)).n, following: (await one(db, "SELECT count(*) n FROM follows WHERE follower_id=?", p.id)).n, isFollowing: user ? !!await one(db, "SELECT 1 FROM follows WHERE follower_id=? AND following_id=?", user.id, p.id) : false };
  }
  if (parts[0] === "players" && parts[2] === "follow" && method === "POST") {
    requireUser(user, true);
    const p = await one(db, "SELECT id FROM users WHERE handle=?", parts[1]);
    if (!p || p.id === user.id) throw fail("Choose another player.");
    if (await blocked(db, user.id, p.id)) throw fail("This player is unavailable.", 403);
    const exists = await one(db, "SELECT 1 FROM follows WHERE follower_id=? AND following_id=?", user.id, p.id);
    if (exists) await run(db, "DELETE FROM follows WHERE follower_id=? AND following_id=?", user.id, p.id);
    else {
      await run(db, "INSERT OR IGNORE INTO follows VALUES(?,?)", user.id, p.id);
      await notify(db, p.id, `@${user.handle} followed you`, `/social/@${user.handle}`);
    }
    return { following: !exists };
  }
  if (path === "/posts" && method === "GET") {
    const kind = choice(u.searchParams.get("kind") || "post", ["post", "thread", "clip", "comment"], "post type"), parent = u.searchParams.get("parent") || "", gid = u.searchParams.get("group") || "", author = u.searchParams.get("author") || "", category = u.searchParams.get("category") || "", q = "%" + str(u.searchParams.get("q"), "search", 80) + "%";
    return { items: await rows(db, `SELECT ${postFields} ${postJoin} WHERE p.kind=? AND p.removed=0 AND (?='' OR p.parent_id=?) AND (?='' OR p.group_id=?) AND (?='' OR u.handle=?) AND (?='' OR p.category=?) AND (p.content LIKE ? OR p.title LIKE ?) AND ${visibleGroup} AND NOT EXISTS(SELECT 1 FROM blocks b WHERE(b.user_id=? AND b.target_id=p.user_id) OR(b.user_id=p.user_id AND b.target_id=?)) AND NOT EXISTS(SELECT 1 FROM mutes WHERE user_id=? AND target_id=p.user_id) ${u.searchParams.get("following") === "1" ? "AND EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=p.user_id)" : ""} ORDER BY p.pinned DESC,p.created_at DESC LIMIT 30 OFFSET ?`, kind, parent, parent, gid, gid, author, author, category, category, q, q, user?.id || "", user?.id || "", user?.id || "", user?.id || "", ...u.searchParams.get("following") === "1" ? [user?.id || ""] : [], page(u)) };
  }
  if (path === "/posts" && method === "POST") {
    requireUser(user, true);
    const b = await body(request), kind = choice(b.kind || "post", ["post", "thread", "clip", "comment"], "post type"), content = str(b.content, "post", 4e3, true), pid = id();
    if (b.group_id) await group(db, b.group_id, user, true);
    let parent;
    if (kind === "comment") {
      parent = await accessPost(db, str(b.parent_id, "parent", 36, true), user);
      if (parent.locked) throw fail("This thread is locked.");
      if (await blocked(db, user.id, parent.user_id)) throw fail("This conversation is unavailable.", 403);
      b.group_id = parent.group_id;
    }
    if (kind === "thread" && !await one(db, "SELECT 1 FROM forum_categories WHERE name=?", b.category)) throw fail("Choose a forum category.");
    if (b.tournament_id && !await one(db, "SELECT 1 FROM tournaments WHERE id=? AND status<>'Draft'", str(b.tournament_id, "tournament", 36))) throw fail("Choose a published tournament ID.");
    let media = str(b.media, "media", 200);
    if (media) {
      if (!/^\/api\/social\/media\/[a-f0-9-]{36}$/.test(media)) throw fail("Upload media first.");
      const m = await one(db, "SELECT user_id,kind FROM media WHERE id=?", media.split("/").pop());
      if (!m || m.user_id !== user.id || (kind === "clip" ? m.kind !== "clip" : m.kind !== "image")) throw fail("Invalid media.");
    }
    if (kind === "clip" && !media) throw fail("Upload a clip first.");
    await run(db, "INSERT INTO posts(id,user_id,kind,parent_id,group_id,category,title,content,media,tournament_id,created_at,game,tags) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", pid, user.id, kind, parent?.id || null, b.group_id || null, str(b.category, "category", 80), str(b.title, "title", 140, kind === "thread" || kind === "clip"), content, media, b.tournament_id || null, now(), str(b.game, "game", 120), str(b.tags, "tags", 200));
    if (parent && parent.user_id !== user.id) await notify(db, parent.user_id, `@${user.handle} replied to you`, `/social/post/${parent.id}`);
    for (const mention of [...content.matchAll(/@([A-Za-z0-9_]{3,24})/g)].slice(0, 10)) {
      const p = await one(db, "SELECT id FROM users WHERE handle=?", mention[1]);
      if (p && p.id !== user.id && !await blocked(db, p.id, user.id)) await notify(db, p.id, `@${user.handle} mentioned you`, `/social/post/${pid}`);
    }
    return { id: pid };
  }
  if (parts[0] === "posts" && parts[1]) {
    const p = await accessPost(db, parts[1], user);
    if (method === "GET") return { post: await one(db, `SELECT ${postFields} ${postJoin} WHERE p.id=?`, p.id) };
    requireUser(user, true);
    if (method === "DELETE") {
      if (p.user_id !== user.id) staff(user, ["moderator", "editor", "administrator"]);
      await run(db, "UPDATE posts SET removed=1 WHERE id IN (WITH RECURSIVE children(id) AS (SELECT id FROM posts WHERE id=? UNION ALL SELECT p.id FROM posts p JOIN children c ON p.parent_id=c.id) SELECT id FROM children) AND ? IS NOT NULL", p.id, p.id);
      return { ok: true };
    }
    if (parts[2] === "like" && method === "POST") {
      const exists = await one(db, "SELECT 1 FROM likes WHERE user_id=? AND post_id=?", user.id, p.id);
      if (exists) await run(db, "DELETE FROM likes WHERE user_id=? AND post_id=?", user.id, p.id);
      else await run(db, "INSERT OR IGNORE INTO likes VALUES(?,?)", user.id, p.id);
      return { liked: !exists };
    }
  }
  if (path === "/categories" && method === "GET") return { items: await rows(db, "SELECT * FROM forum_categories ORDER BY name") };
  if (path === "/groups" && method === "GET") return { items: await rows(db, "SELECT g.*,(SELECT count(*) FROM group_members WHERE group_id=g.id AND status='accepted') members FROM groups g WHERE name LIKE ? ORDER BY created_at DESC LIMIT 30 OFFSET ?", "%" + str(u.searchParams.get("q"), "search", 80) + "%", page(u)) };
  if (path === "/groups" && method === "POST") {
    requireUser(user, true);
    const b = await body(request), gid = id(), avatar = str(b.avatar, "avatar", 200);
    if (avatar && (!/^\/api\/social\/media\/[a-f0-9-]{36}$/.test(avatar) || !await one(db, "SELECT 1 FROM media WHERE id=? AND user_id=? AND kind='image'", avatar.split("/").pop(), user.id))) throw fail("Upload your own crew picture first.");
    await db.batch([query(db, "INSERT INTO groups(id,handle,name,description,owner_id,privacy,games,created_at,avatar) VALUES(?,?,?,?,?,?,?,?,?)", gid, handle(b.handle), str(b.name, "group name", 80, true), str(b.description, "description", 1e3), user.id, choice(b.privacy, ["Public", "Request to Join", "Invite Only"], "privacy"), str(b.games, "games", 200), now(), avatar), query(db, "INSERT INTO group_members VALUES(?,?,'owner','accepted')", gid, user.id)]);
    return { id: gid };
  }
  if (parts[0] === "groups" && parts[1]) {
    const g = await one(db, "SELECT * FROM groups WHERE id=?", parts[1]);
    if (!g) throw fail("Group not found.", 404);
    const membership = user ? await one(db, "SELECT * FROM group_members WHERE group_id=? AND user_id=?", g.id, user.id) : null;
    if (method === "GET") return { group: g, membership, members: g.privacy === "Public" || membership?.status === "accepted" ? await rows(db, `SELECT ${profileFields},gm.role,gm.status FROM group_members gm JOIN users u ON u.id=gm.user_id JOIN profiles p ON p.user_id=u.id WHERE gm.group_id=? AND (gm.status='accepted' OR ?=?) LIMIT 128`, g.id, user?.id || "", g.owner_id) : [] };
    requireUser(user, true);
    if (method === "PUT") {
      if (membership?.status !== "accepted" || !["owner", "moderator"].includes(membership.role)) throw fail("Group manager required.", 403);
      const b = await body(request), avatar = str(b.avatar, "avatar", 200);
      if (avatar && (!/^\/api\/social\/media\/[a-f0-9-]{36}$/.test(avatar) || !await one(db, "SELECT 1 FROM media WHERE id=? AND user_id=? AND kind='image'", avatar.split("/").pop(), user.id))) throw fail("Upload your own crew picture first.");
      await run(db, "UPDATE groups SET avatar=? WHERE id=?", avatar, g.id);
      return { ok: true };
    }
    if (method === "POST") {
      const b = await body(request);
      if (b.action === "join") {
        if (g.privacy === "Invite Only" && membership?.status !== "invited") throw fail("This group requires an invitation.");
        await run(db, "INSERT INTO group_members VALUES(?,?,'member',?) ON CONFLICT(group_id,user_id) DO UPDATE SET status=excluded.status", g.id, user.id, g.privacy === "Public" || membership?.status === "invited" ? "accepted" : "pending");
        return { ok: true };
      }
      if (b.action === "leave") {
        if (g.owner_id === user.id) throw fail("The owner cannot leave their group.");
        await run(db, "DELETE FROM group_members WHERE group_id=? AND user_id=?", g.id, user.id);
        return { ok: true };
      }
      if (membership?.status !== "accepted" || !["owner", "moderator"].includes(membership?.role)) throw fail("Group manager required.", 403);
      const target = await one(db, "SELECT id FROM users WHERE handle=?", str(b.handle, "handle", 24, true));
      if (!target || target.id === g.owner_id) throw fail("Choose another member.");
      if (b.action === "remove") await run(db, "DELETE FROM group_members WHERE group_id=? AND user_id=?", g.id, target.id);
      else if (b.action === "invite") {
        await run(db, "INSERT OR IGNORE INTO group_members VALUES(?,?,'member','invited')", g.id, target.id);
        await notify(db, target.id, `Invitation to ${g.name}`, `/social/groups/${g.id}`);
      } else if (b.action === "approve") await run(db, "UPDATE group_members SET status='accepted' WHERE group_id=? AND user_id=?", g.id, target.id);
      else if (b.action === "moderator" && g.owner_id === user.id) await run(db, "UPDATE group_members SET role='moderator' WHERE group_id=? AND user_id=? AND status='accepted'", g.id, target.id);
      else throw fail("Unknown group action.");
      return { ok: true };
    }
  }
  if (path === "/notifications") {
    requireUser(user);
    if (method === "GET") return { items: await rows(db, "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30 OFFSET ?", user.id, page(u)) };
    if (method === "POST") {
      await run(db, "UPDATE notifications SET is_read=1 WHERE user_id=?", user.id);
      return { ok: true };
    }
  }
  if (path === "/messages") {
    requireUser(user, method === "POST");
    const b = method === "POST" ? await body(request) : Object.fromEntries(u.searchParams);
    let channel = str(b.channel || "global", "channel", 100), recipient = null;
    if (channel.startsWith("dm:")) {
      const target = await one(db, "SELECT id FROM users WHERE handle=?", channel.slice(3));
      if (!target || target.id === user.id || await blocked(db, user.id, target.id)) throw fail("This conversation is unavailable.", 403);
      recipient = target.id;
      channel = "dm:" + [user.id, target.id].sort().join(":");
    } else if (channel.startsWith("group:")) await group(db, channel.slice(6), user, true);
    else if (channel.startsWith("tournament:")) {
      const t = await one(db, "SELECT id FROM tournaments WHERE id=? AND status<>'Draft'", channel.slice(11));
      if (!t) throw fail("Tournament not found.", 404);
    } else if (channel !== "global") throw fail("Unknown channel.");
    if (method === "GET") return { items: (await rows(db, `SELECT m.*,u.handle,p.display_name,p.avatar,p.color,p.font,p.font_url,p.country FROM messages m JOIN users u ON u.id=m.user_id JOIN profiles p ON p.user_id=u.id WHERE m.channel=? AND m.removed=0 AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=? AND target_id=m.user_id) OR(user_id=m.user_id AND target_id=?)) AND NOT EXISTS(SELECT 1 FROM mutes WHERE user_id=? AND target_id=m.user_id) ORDER BY m.created_at DESC LIMIT 50`, channel, user.id, user.id, user.id)).reverse() };
    if (method === "POST") {
      await run(db, "INSERT INTO messages VALUES(?,?,?,?,?,0,?)", id(), user.id, channel, recipient, str(b.content, "message", 1500, true), now());
      if (recipient) await notify(db, recipient, `Message from @${user.handle}`, `/social/messages?to=${user.handle}`);
      return { ok: true };
    }
  }
  if (["/block", "/mute"].includes(path) && method === "POST") {
    requireUser(user);
    const b = await body(request), target = await one(db, "SELECT id FROM users WHERE handle=?", str(b.handle, "handle", 24, true));
    if (!target || target.id === user.id) throw fail("Choose another player.");
    const table = path === "/block" ? "blocks" : "mutes";
    if (b.undo) await run(db, `DELETE FROM ${table} WHERE user_id=? AND target_id=?`, user.id, target.id);
    else await run(db, `INSERT OR IGNORE INTO ${table} VALUES(?,?)`, user.id, target.id);
    return { ok: true };
  }
  if (path === "/reports" && method === "POST") {
    requireUser(user);
    const b = await body(request);
    await run(db, "INSERT INTO reports VALUES(?,?,?,?,?,?,?,?)", id(), user.id, choice(b.target_type, ["player", "post", "message", "clip", "comment", "thread"], "report type"), str(b.target_id, "target", 100, true), choice(b.reason, ["Spam", "Harassment", "Inappropriate content", "Impersonation", "Cheating allegation", "Scam", "Other"], "reason"), str(b.detail, "details", 2e3), "open", now());
    return { ok: true };
  }
  if (path === "/moderation" && method === "GET") {
    staff(user, ["moderator", "editor", "administrator"]);
    return { reports: await rows(db, "SELECT * FROM reports WHERE status='open' ORDER BY created_at LIMIT 100"), logs: await rows(db, "SELECT * FROM moderation_logs ORDER BY created_at DESC LIMIT 100") };
  }
  if (path === "/moderation" && method === "POST") {
    staff(user, ["moderator", "editor", "administrator"]);
    const b = await body(request), action = choice(b.action, ["resolve", "remove-post", "remove-message", "lock", "pin", "mute", "suspend", "ban", "restore", "remove-avatar", "remove-banner", "role", "category"], "moderation action"), target = str(b.target, "target", 100, true);
    if (action === "resolve") await run(db, "UPDATE reports SET status='resolved' WHERE id=?", target);
    else if (action === "remove-post") await run(db, "UPDATE posts SET removed=1 WHERE id IN (WITH RECURSIVE children(id) AS (SELECT id FROM posts WHERE id=? UNION ALL SELECT p.id FROM posts p JOIN children c ON p.parent_id=c.id) SELECT id FROM children) AND ? IS NOT NULL", target, target);
    else if (action === "remove-message") await run(db, "UPDATE messages SET removed=1 WHERE id=?", target);
    else if (action === "lock" || action === "pin") await run(db, `UPDATE posts SET ${action === "lock" ? "locked" : "pinned"}=? WHERE id=?`, b.undo ? 0 : 1, target);
    else if (action === "category") await run(db, "INSERT OR IGNORE INTO forum_categories VALUES(?)", str(target, "category", 80, true));
    else {
      const p = await one(db, "SELECT * FROM users WHERE handle=?", target);
      if (!p) throw fail("Player not found.", 404);
      if (p.id === user.id || p.role === "administrator") throw fail("This account cannot be changed here.", 403);
      if (action === "role") {
        staff(user, ["administrator"]);
        await run(db, "UPDATE users SET role=? WHERE id=?", choice(b.role, ["player", "host", "moderator", "editor", "administrator"], "role"), p.id);
      } else if (action.startsWith("remove-")) await run(db, `UPDATE profiles SET ${action === "remove-avatar" ? "avatar" : "banner"}='' WHERE user_id=?`, p.id);
      else {
        await db.batch([query(db, "UPDATE users SET status=? WHERE id=?", { mute: "muted", suspend: "suspended", ban: "banned", restore: "active" }[action], p.id), query(db, "DELETE FROM sessions WHERE user_id=?", p.id)]);
      }
    }
    await run(db, "INSERT INTO moderation_logs VALUES(?,?,?,?,?,?)", id(), user.id, action, target, str(b.detail, "audit note", 1e3), now());
    return { ok: true };
  }
  if (path === "/search" && method === "GET") {
    const q = str(u.searchParams.get("q"), "search", 80, true).replace(/^@/, "");
    return { players: await rows(db, `SELECT ${profileFields} FROM users u JOIN profiles p ON p.user_id=u.id WHERE (instr(lower(u.handle),lower(?))>0 OR instr(lower(p.display_name),lower(?))>0) AND u.status NOT IN ('banned','suspended') LIMIT 8`, q, q), groups: await rows(db, "SELECT id,name,handle FROM groups WHERE instr(lower(name),lower(?))>0 LIMIT 8", q), tournaments: await rows(db, "SELECT id,slug,title,game FROM tournaments WHERE (instr(lower(title),lower(?))>0 OR instr(lower(game),lower(?))>0) AND status<>'Draft' LIMIT 8", q, q), games: await rows(db, "SELECT * FROM games WHERE instr(lower(title),lower(?))>0 LIMIT 8", q), posts: await rows(db, `SELECT p.id,p.title,p.content,p.kind FROM posts p WHERE p.removed=0 AND (instr(lower(p.content),lower(?))>0 OR instr(lower(p.title),lower(?))>0) AND ${visibleGroup} LIMIT 12`, q, q, user?.id || "") };
  }
  return void 0;
}
__name(communityRoute, "communityRoute");

// social/media.mjs
function mp4Duration(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let movie = false, ftyp = false, tracks = 0, longest = 0;
  function boxes(start, end, visit) {
    let at = start;
    while (at < end) {
      if (at + 8 > end) throw fail("Incomplete MP4 container.");
      let size = v.getUint32(at), head = 8;
      const type = String.fromCharCode(...bytes.slice(at + 4, at + 8));
      if (size === 1) {
        if (at + 16 > end) throw fail("Invalid MP4.");
        const big = v.getBigUint64(at + 8);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw fail("Invalid MP4.");
        size = Number(big);
        head = 16;
      }
      if (size === 0) size = end - at;
      if (size < head || at + size > end) throw fail("Invalid MP4 box size.");
      visit(type, at + head, at + size);
      at += size;
    }
  }
  __name(boxes, "boxes");
  function timeHeader(start, end) {
    const version = v.getUint8(start), scaleAt = start + (version === 1 ? 20 : 12), durationAt = scaleAt + 4;
    if (version > 1 || durationAt + (version ? 8 : 4) > end) throw fail("Invalid MP4 timeline.");
    const scale = v.getUint32(scaleAt), duration = version ? Number(v.getBigUint64(durationAt)) : v.getUint32(durationAt);
    if (!scale || !Number.isFinite(duration)) throw fail("Invalid MP4 duration.");
    return { scale, duration: duration / scale };
  }
  __name(timeHeader, "timeHeader");
  boxes(0, bytes.length, (type, start, end) => {
    if (type === "ftyp") ftyp = true;
    if (type === "moof") throw fail("Export a standard MP4 rather than a fragmented MP4.");
    if (type !== "moov") return;
    movie = true;
    boxes(start, end, (type2, a, b) => {
      if (type2 === "mvhd") longest = Math.max(longest, timeHeader(a, b).duration);
      if (type2 !== "trak") return;
      let scale = 0, duration = 0, samples = null, offset = 0;
      boxes(a, b, (type3, c, d) => {
        if (type3 === "edts") boxes(c, d, (t, e, f) => {
          if (t === "elst") {
            if (e + 8 > f || v.getUint32(e + 4) > 1) throw fail("Export this clip without a complex edit list.");
          }
        });
        if (type3 !== "mdia") return;
        boxes(c, d, (type4, e, f) => {
          if (type4 === "mdhd") {
            const h = timeHeader(e, f);
            scale = h.scale;
            duration = h.duration;
          }
          if (type4 !== "minf") return;
          boxes(e, f, (type5, g, h) => {
            if (type5 !== "stbl") return;
            boxes(g, h, (type6, i, j) => {
              if (type6 === "stts") {
                if (i + 8 > j) throw fail("Invalid MP4 timing.");
                const n = v.getUint32(i + 4);
                if (n === 0 || i + 8 + n * 8 > j) throw fail("Invalid MP4 samples.");
                samples = 0;
                for (let k = 0; k < n; k++) {
                  const count = v.getUint32(i + 8 + k * 8), delta = v.getUint32(i + 12 + k * 8);
                  if (!count || !delta) throw fail("Invalid sample timing.");
                  samples += count * delta;
                  if (!Number.isSafeInteger(samples)) throw fail("Invalid sample timing.");
                }
              }
              if (type6 === "ctts") {
                if (i + 8 > j) throw fail("Invalid composition timeline.");
                const version = v.getUint8(i), n = v.getUint32(i + 4);
                if (version > 1 || i + 8 + n * 8 > j) throw fail("Invalid composition timeline.");
                for (let k = 0; k < n; k++) offset = Math.max(offset, version ? v.getInt32(i + 12 + k * 8) : v.getUint32(i + 12 + k * 8));
              }
            });
          });
        });
      });
      if (!scale || samples === null) throw fail("MP4 must include a complete sample timeline.");
      tracks++;
      longest = Math.max(longest, duration, (samples + offset) / scale);
    });
  });
  if (!ftyp || !movie || !tracks || longest <= 0) throw fail("Upload a valid MP4 video.");
  if (longest > 45) throw fail("Clips must be 45 seconds or shorter.");
  return longest;
}
__name(mp4Duration, "mp4Duration");
function imageType(b) {
  if (["GIF87a", "GIF89a"].includes(String.fromCharCode(...b.slice(0, 6))) && b.length >= 14) return "image/gif";
  if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  throw fail("Use a PNG, JPEG, GIF or WebP image.");
}
__name(imageType, "imageType");
function fontType(bytes) {
  if (bytes.length < 28) throw fail("Upload a valid WOFF2, WOFF, TTF or OTF font.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tag = String.fromCharCode(...bytes.slice(0, 4));
  if (tag === "wOF2" || tag === "wOFF") {
    const min = tag === "wOF2" ? 48 : 44;
    if (bytes.length < min || v.getUint32(8) !== bytes.length || !v.getUint16(12) || v.getUint32(16) > 16 * 1024 * 1024) throw fail("Invalid font container.");
    return tag === "wOF2" ? "font/woff2" : "font/woff";
  }
  if (tag === "OTTO" || v.getUint32(0) === 65536) {
    const count = v.getUint16(4);
    if (!count || count > 256 || 12 + count * 16 > bytes.length) throw fail("Invalid font tables.");
    for (let i = 0; i < count; i++) {
      const at = 12 + i * 16;
      if (v.getUint32(at + 8) + v.getUint32(at + 12) > bytes.length) throw fail("Incomplete font table.");
    }
    return tag === "OTTO" ? "font/otf" : "font/ttf";
  }
  throw fail("Upload a WOFF2, WOFF, TTF or OTF font.");
}
__name(fontType, "fontType");
async function mediaRoute(request, env, path, user) {
  const db = env.SOCIAL_DB;
  if (path === "/media" && request.method === "POST") {
    requireUser(user, true);
    if (!env.MEDIA) throw fail("Uploads are not available yet. Please try again after storage is connected.", 503);
    await rate(db, "upload:" + user.id, 8, 3600);
    const kind = ["clip", "font"].includes(new URL(request.url).searchParams.get("kind")) ? new URL(request.url).searchParams.get("kind") : "image", bytes = await read(request, kind === "clip" ? 20 * 1024 * 1024 : kind === "font" ? 2 * 1024 * 1024 : 4 * 1024 * 1024), mid = id();
    let mime, duration = null;
    if (kind === "clip") {
      duration = mp4Duration(bytes);
      mime = "video/mp4";
    } else mime = kind === "font" ? fontType(bytes) : imageType(bytes);
    await env.MEDIA.put(mid, bytes, { httpMetadata: { contentType: mime } });
    await run(db, "INSERT INTO media VALUES(?,?,?,?,?,?)", mid, user.id, kind, mime, new Uint8Array(0), now());
    return { url: "/api/social/media/" + mid, duration };
  }
  if (path.startsWith("/media/") && request.method === "GET") {
    if (!env.MEDIA) throw fail("Media storage is unavailable.", 503);
    const mid = path.split("/")[2], record = await one(db, "SELECT * FROM media WHERE id=?", mid);
    if (!record) throw fail("Media not found.", 404);
    const link = "/api/social/media/" + mid;
    const visible = record.user_id === user?.id || await one(db, "SELECT 1 FROM profiles p JOIN users u ON u.id=p.user_id WHERE (p.avatar=? OR p.banner=? OR p.font_url=?) AND u.status NOT IN ('banned','suspended')", link, link, link) || await one(db, "SELECT 1 FROM profile_extras e JOIN users u ON u.id=e.user_id, json_each(e.shots) shot WHERE u.status NOT IN ('banned','suspended') AND json_extract(shot.value,'$.source')='upload' AND json_extract(shot.value,'$.id')=?", mid) || await one(db, "SELECT 1 FROM groups WHERE avatar=?", link) || await one(db, "SELECT 1 FROM posts p WHERE p.media=? AND p.removed=0 AND (p.group_id IS NULL OR EXISTS(SELECT 1 FROM groups g WHERE g.id=p.group_id AND (g.privacy='Public' OR EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=g.id AND gm.user_id=? AND gm.status='accepted'))))", link, user?.id || "");
    if (!visible) throw fail("Media not found.", 404);
    const object = await env.MEDIA.get(mid);
    if (!object) throw fail("Media not found.", 404);
    return new Response(object.body, { headers: { "Content-Type": record.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=60", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  }
  return void 0;
}
__name(mediaRoute, "mediaRoute");

// social/api.mjs
async function socialAPI(request, env, admin = null) {
  const u = new URL(request.url), origin = request.headers.get("Origin"), allowed = new Set((env.ALLOWED_ORIGINS || "https://xbtesports.nyc,https://www.xbtesports.nyc").split(","));
  allowed.add(u.origin);
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin" };
  if (origin && allowed.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
  }
  try {
    if (origin && !allowed.has(origin)) throw fail("This origin is not allowed.", 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (!env.SOCIAL_DB) throw fail("Community storage is not connected.", 503);
    const path = u.pathname.slice("/api/social".length) || "/";
    if (path === "/health") return Response.json({ ready: true, uploads: !!env.MEDIA }, { headers });
    const user = admin || await actor(request, env.SOCIAL_DB);
    if (!["GET", "HEAD"].includes(request.method)) await rate(env.SOCIAL_DB, "write:" + (user?.id || await hash(request.headers.get("CF-Connecting-IP") || "local")), 40, 60);
    for (const route of [integrationsRoute, oauthRoute, networkRoute, authRoute, tournamentRoute, communityRoute, mediaRoute]) {
      const data = await route(request, env, path, user);
      if (data !== void 0) {
        if (data instanceof Response) {
          for (const [k, v] of Object.entries(headers)) if (k !== "Content-Type") data.headers.set(k, v);
          return data;
        }
        return Response.json(data, { headers });
      }
    }
    throw fail("Not found.", 404);
  } catch (e) {
    if (!e.status) console.error("Social API error", e.message);
    return Response.json({ error: e.status ? e.message : "The service is unavailable. Please try again." }, { status: e.status || 503, headers });
  }
}
__name(socialAPI, "socialAPI");

// social/worker.mjs
var worker_default = { async fetch(request, env) {
  const u = new URL(request.url);
  if (u.pathname.startsWith("/api/social/")) return socialAPI(request, env);
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  let target = u.pathname;
  if (target === "/" || target.startsWith("/social") || target.startsWith("/embed/") || target.startsWith("/admin/")) {
    if (!/\.(?:css|js|mjs|png|svg|jpg|ttf|woff|woff2|otf|txt)$/.test(target)) target = "/social/";
  }
  const response = await env.ASSETS.fetch(new Request(new URL(target, u.origin), request));
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secured.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https:; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' https://xbtesports-calendar-public.smithrock87.workers.dev; frame-src 'self' https://xbtesports-social.smithrock87.workers.dev https://battlefy.com https://www.youtube.com https://player.twitch.tv; base-uri 'self'; form-action 'self'");
  return secured;
} };

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-toTUAw/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-toTUAw/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
