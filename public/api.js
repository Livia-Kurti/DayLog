/* ══════════════════════════════════════════════════════════════════
   api.js  —  DayLog  |  MongoDB + Auth API layer
   ══════════════════════════════════════════════════════════════════

   HOW TO CONNECT THIS TO A REAL BACKEND
   ──────────────────────────────────────
   This file is the only place that talks to your server / database.
   Every function below makes a fetch() call to a REST endpoint.

   Recommended stack:
     • Backend  : Node.js + Express  (or Next.js API routes)
     • Database : MongoDB Atlas      (free tier works fine)
     • Auth     : bcrypt for passwords, JWT or express-session for sessions
     • ODM      : Mongoose           (makes MongoDB easier)

   Typical folder structure on the server side:
     server/
       index.js          ← Express app
       routes/
         auth.js         ← POST /api/auth/login, /signup, /logout
         entries.js      ← GET/POST /api/entries
       models/
         User.js         ← Mongoose User schema
         Entry.js        ← Mongoose Entry schema

   MongoDB Entry document shape:
     {
       _id:       ObjectId,
       userId:    ObjectId | null,   // null = anonymous
       date:      String,            // "Mon" / "Tue" etc.
       mood:      Number,            // 1-5
       sleep:     Number,            // hours
       breakfast: String,            // "Full meal" | "Light bite" | "Just a drink" | "Skipped"
       createdAt: Date
     }

   MongoDB User document shape:
     {
       _id:          ObjectId,
       username:     String  (unique),
       email:        String  (optional),
       passwordHash: String,          // bcrypt hash — NEVER store plain text
       createdAt:    Date
     }

   ─────────────────────────────────────────────────────────────────
   To switch from DEMO MODE to LIVE MODE:
     1. Set USE_MOCK_DATA = false
     2. Set API_BASE to your server URL  (e.g. "https://api.yourdomain.com")
     3. Deploy your Express server and connect it to MongoDB Atlas
   ─────────────────────────────────────────────────────────────────
*/

// ── Config ──────────────────────────────────────────────────────
const USE_MOCK_DATA = false;             // Changed from true to false!
const API_BASE      = " "; // ← your Express server URL

// ── Mock in-memory store (used when USE_MOCK_DATA = true) ────────
const MOCK_USERS = {
  maya: { id: "user_maya", username: "maya", passwordHash: "sun123" },
  leo:  { id: "user_leo",  username: "leo",  passwordHash: "rain456" },
};
const MOCK_ENTRIES = {
  anon: [
    { id:"a1",  userId:null,        date:"Mon", mood:4, sleep:7, breakfast:"Light bite"   },
    { id:"a2",  userId:null,        date:"Mon", mood:3, sleep:5, breakfast:"Skipped"      },
    { id:"a3",  userId:null,        date:"Tue", mood:5, sleep:8, breakfast:"Full meal"    },
    { id:"a4",  userId:null,        date:"Tue", mood:2, sleep:4, breakfast:"Just a drink" },
    { id:"a5",  userId:null,        date:"Wed", mood:4, sleep:7, breakfast:"Light bite"   },
    { id:"a6",  userId:null,        date:"Wed", mood:3, sleep:6, breakfast:"Light bite"   },
    { id:"a7",  userId:null,        date:"Thu", mood:5, sleep:8, breakfast:"Full meal"    },
    { id:"a8",  userId:null,        date:"Fri", mood:4, sleep:7, breakfast:"Full meal"    },
    { id:"a9",  userId:null,        date:"Sat", mood:5, sleep:9, breakfast:"Full meal"    },
    { id:"a10", userId:null,        date:"Sun", mood:3, sleep:6, breakfast:"Light bite"   },
  ],
  user_maya: [
    { id:"m1",  userId:"user_maya", date:"Mon", mood:4, sleep:7, breakfast:"Light bite"   },
    { id:"m2",  userId:"user_maya", date:"Tue", mood:3, sleep:5, breakfast:"Skipped"      },
    { id:"m3",  userId:"user_maya", date:"Wed", mood:5, sleep:8, breakfast:"Full meal"    },
    { id:"m4",  userId:"user_maya", date:"Thu", mood:4, sleep:7, breakfast:"Light bite"   },
    { id:"m5",  userId:"user_maya", date:"Fri", mood:3, sleep:6, breakfast:"Skipped"      },
    { id:"m6",  userId:"user_maya", date:"Sat", mood:5, sleep:9, breakfast:"Full meal"    },
    { id:"m7",  userId:"user_maya", date:"Sun", mood:4, sleep:8, breakfast:"Full meal"    },
  ],
  user_leo: [
    { id:"l1",  userId:"user_leo",  date:"Mon", mood:2, sleep:4, breakfast:"Just a drink" },
    { id:"l2",  userId:"user_leo",  date:"Tue", mood:3, sleep:5, breakfast:"Light bite"   },
    { id:"l3",  userId:"user_leo",  date:"Wed", mood:4, sleep:7, breakfast:"Full meal"    },
    { id:"l4",  userId:"user_leo",  date:"Thu", mood:4, sleep:6, breakfast:"Light bite"   },
    { id:"l5",  userId:"user_leo",  date:"Fri", mood:5, sleep:8, breakfast:"Full meal"    },
    { id:"l6",  userId:"user_leo",  date:"Sat", mood:5, sleep:8, breakfast:"Full meal"    },
    { id:"l7",  userId:"user_leo",  date:"Sun", mood:3, sleep:7, breakfast:"Light bite"   },
  ],
};

// Simulated session (stays in memory — replace with JWT/cookie in production)
let _mockSession = null;

// ════════════════════════════════════════════════════════════════
//  AUTH  —  login / signup / logout / current user
// ════════════════════════════════════════════════════════════════

/**
 * Log in with username + password.
 * Returns: { ok: true, user: { id, username } }  on success
 * { ok: false, error: "message" }         on failure
 *
 * REAL BACKEND — POST /api/auth/login
 * body:    { username, password }
 * server:  find user, bcrypt.compare(password, user.passwordHash)
 * if ok → create session / sign JWT → return user object
 */
async function apiLogin(username, password) {
  if (USE_MOCK_DATA) {
    // ── MOCK ──
    await _delay(300);
    const user = MOCK_USERS[username.toLowerCase()];
    if (!user || user.passwordHash !== password) {
      return { ok: false, error: "Incorrect username or password." };
    }
    _mockSession = { id: user.id, username: user.username };
    return { ok: true, user: _mockSession };
  }

  // ── LIVE ──
  try {
    const res  = await fetch(`${API_BASE}/api/auth/login`, {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",               // send/receive cookies
      body:        JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Login failed." };
    return { ok: true, user: data.user };
  } catch (e) {
    return { ok: false, error: "Could not reach server." };
  }
}

/**
 * Sign up with username, email (optional), password.
 * Returns: { ok: true }  or  { ok: false, error: "message" }
 *
 * REAL BACKEND — POST /api/auth/signup
 * body:    { username, email, password }
 * server:  check username not taken,
 * bcrypt.hash(password, 10),
 * save new User document → return success
 */
async function apiSignup(username, email, password) {
  if (USE_MOCK_DATA) {
    // ── MOCK ──
    await _delay(400);
    if (MOCK_USERS[username.toLowerCase()]) {
      return { ok: false, error: "That username is already taken." };
    }
    if (username.length < 3) {
      return { ok: false, error: "Username must be at least 3 characters." };
    }
    // Add to mock store
    MOCK_USERS[username.toLowerCase()] = {
      id:           `user_${username.toLowerCase()}`,
      username:     username.toLowerCase(),
      passwordHash: password,
    };
    MOCK_ENTRIES[`user_${username.toLowerCase()}`] = [];
    return { ok: true };
  }

  // ── LIVE ──
  try {
    const res  = await fetch(`${API_BASE}/api/auth/signup`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Signup failed." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Could not reach server." };
  }
}

/**
 * Log out current user.
 *
 * REAL BACKEND — POST /api/auth/logout
 * server: destroy session or invalidate JWT
 */
async function apiLogout() {
  if (USE_MOCK_DATA) {
    await _delay(100);
    _mockSession = null;
    return { ok: true };
  }

  // ── LIVE ──
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
  } catch (_) {}
  return { ok: true };
}

/**
 * Get the currently logged-in user (on page load).
 * Returns: { user: { id, username } } or { user: null }
 *
 * REAL BACKEND — GET /api/auth/me
 * server: read session cookie / JWT → return user or 401
 */
async function apiGetCurrentUser() {
  if (USE_MOCK_DATA) {
    return { user: _mockSession };
  }

  // ── LIVE ──
  try {
    const res  = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
    if (!res.ok) return { user: null };
    const data = await res.json();
    return { user: data.user || null };
  } catch (_) {
    return { user: null };
  }
}

// ════════════════════════════════════════════════════════════════
//  ENTRIES  —  fetch and save daily logs
// ════════════════════════════════════════════════════════════════

/**
 * Get all community (anonymous) entries for the current week.
 * Returns: Array of entry objects
 *
 * REAL BACKEND — GET /api/entries/community
 * server: db.Entry.find({ createdAt: { $gte: weekStart } })
 * project out userId for anonymity
 */
async function apiGetCommunityEntries() {
  if (USE_MOCK_DATA) {
    await _delay(200);
    // Merge all entries, strip userId
    const all = Object.values(MOCK_ENTRIES)
      .flat()
      .map(({ userId, ...rest }) => rest);   // remove userId → anonymous
    return { ok: true, entries: all };
  }

  // ── LIVE ──
  try {
    const res  = await fetch(`${API_BASE}/api/entries/community`);
    const data = await res.json();
    return { ok: true, entries: data.entries || [] };
  } catch (e) {
    return { ok: false, entries: [] };
  }
}

/**
 * Get entries for the logged-in user.
 * Returns: Array of entry objects
 *
 * REAL BACKEND — GET /api/entries/mine
 * server: read userId from session → db.Entry.find({ userId })
 */
async function apiGetMyEntries(userId) {
  if (USE_MOCK_DATA) {
    await _delay(200);
    const key     = userId;
    const entries = MOCK_ENTRIES[key] || [];
    return { ok: true, entries };
  }

  // ── LIVE ──
  try {
    const res  = await fetch(`${API_BASE}/api/entries/mine`, { credentials: "include" });
    const data = await res.json();
    return { ok: true, entries: data.entries || [] };
  } catch (e) {
    return { ok: false, entries: [] };
  }
}

/**
 * Save a new daily log entry.
 * @param {Object} entry  { mood, sleep, breakfast, date }
 * @param {string|null} userId  null = anonymous
 *
 * REAL BACKEND — POST /api/entries
 * body:   { mood, sleep, breakfast, date }
 * server: read userId from session (or null),
 * save Entry document → return saved entry
 */
async function apiSaveEntry(entry, userId) {
  if (USE_MOCK_DATA) {
    await _delay(300);
    const key     = userId || "anon";
    const newEntry = { ...entry, id: `e_${Date.now()}`, userId: userId || null };
    if (!MOCK_ENTRIES[key]) MOCK_ENTRIES[key] = [];
    MOCK_ENTRIES[key].push(newEntry);
    return { ok: true, entry: newEntry };
  }

  // ── LIVE ──
  try {
    const res  = await fetch(`${API_BASE}/api/entries`, {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify(entry),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not save." };
    return { ok: true, entry: data.entry };
  } catch (e) {
    return { ok: false, error: "Could not reach server." };
  }
}

// ── Helper: fake network delay for mock mode ──
function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
