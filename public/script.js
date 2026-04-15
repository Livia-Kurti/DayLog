// script.js — Handles Home, Generator, and MyList pages

// --- CONFIGURATION ---
const API_BASE = "https://api.jikan.moe/v4";
// *** IMPORTANT: This must match your Node server address ***
// const API_NODE = "https://anime-starter2-0.vercel.app/"; 

// --- PRISMA STATUS MAPPING ---
// These match the ENUM values in your schema.prisma
const ANIME_STATUSES = {
    WANT_TO_WATCH: "WANT_TO_WATCH",
    NOT_INTERESTED: "NOT_INTERESTED",
    WATCHING: "WATCHING",
    COMPLETED: "COMPLETED", 
    PAUSED: "PAUSED",
    DROPPED: "DROPPED"
};

const STATUS_OPTIONS_UI = [
    "Want to Watch", "Watching", "Completed", "Paused", "Dropped", "Not Interested"
];

// Helper: Convert "Want to Watch" -> "WANT_TO_WATCH"
function statusToEnum(uiStatus) {
    switch (uiStatus) {
        case "Want to Watch": return ANIME_STATUSES.WANT_TO_WATCH;
        case "Watching": return ANIME_STATUSES.WATCHING;
        case "Completed": return ANIME_STATUSES.COMPLETED;
        case "Paused": return ANIME_STATUSES.PAUSED;
        case "Dropped": return ANIME_STATUSES.DROPPED;
        case "Not Interested": return ANIME_STATUSES.NOT_INTERESTED;
        default: return ANIME_STATUSES.WANT_TO_WATCH;
    }
}

// Helper: Convert "WANT_TO_WATCH" -> "Want to Watch"
function enumToStatus(enumStatus) {
    switch (enumStatus) {
        case ANIME_STATUSES.WANT_TO_WATCH: return "Want to Watch";
        case ANIME_STATUSES.WATCHING: return "Watching";
        case ANIME_STATUSES.COMPLETED: return "Completed";
        case ANIME_STATUSES.PAUSED: return "Paused";
        case ANIME_STATUSES.DROPPED: return "Dropped";
        case ANIME_STATUSES.NOT_INTERESTED: return "Not Interested";
        default: return "Unknown";
    }
}


// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    const bodyId = document.body.id;
    if (bodyId === "home") initHome();
    if (bodyId === "generator") initGenerator();
    if (bodyId === "mylist") initMyList(); 
});


/* -------------------- CRUD CLIENT FUNCTIONS -------------------- */

// READ: Fetch the list from your Node backend
async function fetchMyList(filterEnumStatus=""){
    try {
        const url = new URL(`${API_NODE}/api/anime/mylist`); 
        if(filterEnumStatus) url.searchParams.append("status", filterEnumStatus);
        
        const res = await fetch(url);
        if(!res.ok) throw new Error("Server error");
        return await res.json();
    } catch (err) {
        console.warn("Could not fetch user list. Is the server running?", err);
        return [];
    }
}

// READ IDS: Used to filter out anime you already have on your list
async function fetchMyListIds(){
    const list = await fetchMyList();
    // Safely map to an array of Jikan IDs
    return list.map(a => a.jikanId); 
}

// CREATE / UPDATE: This is triggered by the Tile Dropdown
async function addToMyList(anime, statusUI){
    const status = statusToEnum(statusUI); 
    
    // Prepare the data payload for the server
    const payload = {
        jikanId: anime.mal_id, 
        title: anime.title,
        image: anime.image,
        status: status,
    };
    
    try {
        await fetch(`${API_NODE}/api/anime`, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        // If we are on the My List page, refresh the view immediately
        if(document.body.id === "mylist") {
            renderMyList(); 
        } else {
            // Optional: Give visual feedback or re-fetch to hide the tile
            console.log("Anime added to list!");
             // re-init to update the filtering (hide the added anime)
            if(document.body.id === "home") initHome();
            if(document.body.id === "generator") initGenerator();
        }
    } catch (err) {
        alert("Failed to save anime. Is the server running?");
    }
}

// UPDATE (Specifically for MyList page changes)
async function updateMyList(listEntryId, statusUI){
    const status = statusToEnum(statusUI);
    await fetch(`${API_NODE}/api/anime/${listEntryId}`, {
        method: "PUT",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({status})
    });
    // Refresh list based on current filter
    const filterSelect = document.getElementById("statusFilter");
    renderMyList(filterSelect ? statusToEnum(filterSelect.value) : "");
}

// DELETE
async function deleteFromMyList(listEntryId){
    await fetch(`${API_NODE}/api/anime/${listEntryId}`, {
        method: "DELETE",
    });
    renderMyList();
}


/* -------------------- HOME PAGE -------------------- */
async function initHome(){
    const ticker = document.getElementById("ticker");
    const saved = await fetchMyListIds(); // Fetch IDs to exclude
    
    const fetchers = [
        () => fetch(`${API_BASE}/seasons/now`).then(r => r.json()),
        () => fetch(`${API_BASE}/anime`).then(r => r.json())
    ];

    let data = null;
    for (let fn of fetchers){
        try {
            const res = await fn();
            if (res && (res.data ?? res).length) { data = res.data ?? res; break; }
        } catch (err) { /* try next */ }
    }

    if (!data || !data.length){
        ticker.innerHTML = `<div style="padding:30px;color:#777">Unable to load ticker content.</div>`;
        return;
    }

    // Filter out anime that are already in the saved list
    const items = data.filter(a => !saved.includes(a.mal_id)).slice(0,12).map(mapToCardData);
    
    // Render Tiles
    const tilesHtml = items.map(renderTile).join("");
    ticker.innerHTML = tilesHtml + tilesHtml;
    setupTickerPause();
}

/* -------------------- GENERATOR PAGE -------------------- */
function initGenerator(){
    const genreSelect = document.getElementById("genreSelect");
    const regenerateBtn = document.getElementById("regenerateBtn");
    const status = document.getElementById("statusMessage");
    const grid = document.getElementById("grid");

    loadGenresInto(genreSelect).then(() => {
        fetchAndRender({ rating: "G" });
    });

    regenerateBtn.addEventListener("click", () => {
        const selected = genreSelect.value;
        const params = { rating: "G", genreId: selected || null };
        fetchAndRender(params);
    });

    async function fetchAndRender({ rating = "G", genreId = null } = {}){
        status.textContent = "Loading recommendations...";
        grid.innerHTML = "";
        const saved = await fetchMyListIds(); // Fetch IDs to exclude
        
        try {
            const q = new URLSearchParams();
            if (rating) q.set("rating", rating);
            q.set("order_by", "popularity");
            q.set("limit", "24");
            if (genreId) q.set("genres", genreId); 
            const url = `${API_BASE}/anime?${q.toString()}`;
            const res = await fetch(url);
            
            if (!res.ok) {
                status.innerHTML = `Oops! API error: ${res.status}`;
                return;
            }
            const parsed = await res.json();
            let list = parsed.data || [];
            
            // Filter out saved anime
            list = list.filter(a => !saved.includes(a.mal_id));
            
            if (!list.length){
                status.textContent = "No new recommendations found.";
                return;
            }
            status.textContent = "";
            
            grid.innerHTML = list.map(mapToCardData).map(renderGridCard).join("");
        } catch (err){
            console.error(err);
            status.innerHTML = `Oops! Network or API error.`;
        }
    }
}

/* -------------------- LOAD GENRES -------------------- */
async function loadGenresInto(selectEl){
    try {
        const res = await fetch(`${API_BASE}/genres/anime`);
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data || [];
        
        // Excluded Genres
        const excludedGenres = ["Ecchi", "Boys Love", "Adult", "Hentai", "Adult Cast","Avant Garde", "Yuri", "Girls Love", "Yaoi", "Erotica", "Horror", "CGDCT", "Magical Sex Shift", "Crossdressing", "Gore", "Harem","Idols (Female)", "Idols (Male)", "Love Polygon", "Music", "Reverse Harem", "Organized Crime", "Racing", "Military", "Combat Sports", "Iyashikei", "Survival", "Anthropomorphic", "Delinquents", "High Stakes Game", "Otaku Culture", "Parody", "Pets", "Samurai", "Josei", "Villainess", "Seinen", "Psychological", "Gag Humor", "Visual Arts", "Video Game", "Vampire", "Martial Arts", "Love Status Quo", "Reincarnation" ];
        
        data
            .filter(g => !excludedGenres.includes(g.name))
            .forEach(g => {
                const opt = document.createElement("option");
                opt.value = g.mal_id;
                opt.textContent = g.name;
                selectEl.appendChild(opt);
            });
    } catch (err){
        console.warn("Failed to load genres", err);
    }
}


/* -------------------- MYLIST PAGE RENDERING -------------------- */
async function initMyList(){
    const filterSelect = document.getElementById("statusFilter");
    
    if(filterSelect) {
        // Initialize the filter dropdown
        filterSelect.innerHTML = `<option value="">All Statuses</option>` + STATUS_OPTIONS_UI.map(s => 
            `<option value="${s}">${s}</option>`
        ).join("");
        
        // Add event listener to filter list when changed
        filterSelect.addEventListener("change", () => {
            const selectedUI = filterSelect.value;
            const enumStatus = selectedUI ? statusToEnum(selectedUI) : "";
            renderMyList(enumStatus);
        });
    }
    
    renderMyList();
}

async function renderMyList(filterEnumStatus=""){
    const listGrid = document.getElementById("mylistGrid");
    const list = await fetchMyList(filterEnumStatus); 
    
    if (!listGrid) return;
    
    if(list.length === 0) {
        listGrid.innerHTML = `<p style="text-align:center; width:100%; color:#888;">No anime found in this list.</p>`;
        return;
    }
    
    listGrid.innerHTML = list.map(a => {
        const currentStatusUI = enumToStatus(a.status);
        
        // Generate options for the dropdown, marking the current one as 'selected'
        const statusOptionsHtml = STATUS_OPTIONS_UI.map(s => {
            const isSelected = s === currentStatusUI ? 'selected' : '';
            return `<option value="${s}" ${isSelected}>${s}</option>`;
        }).join("");
        
        return `
            <div class="card" data-id="${a.id}">
              <img src="${a.image}" alt="${a.title}" loading="lazy" onerror="this.style.opacity=.12">
              <div class="overlay">
                <div class="title">${a.title}</div>
                
                <div class="actions">
                    <select class="status-select" onchange="closeDropdown(this); updateMyList('${a.id}', this.value)">
                      ${statusOptionsHtml}
                    </select>
                    <button class="remove-btn" onclick="deleteFromMyList('${a.id}')" style="margin-top:8px;">Remove</button>
                </div>
                
              </div>
            </div>
        `;
    }).join("");
}

/* -------------------- UTILITY FUNCTIONS -------------------- */

// --- UTILITY: Safe Data Encoding ---
// Adds a helper to prevent 'apostrophes' from breaking the buttons
function safeJson(data) {
    const str = JSON.stringify(data);
    // Replaces single quotes with a safe HTML code
    return str.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
}

// --- Render Tile (Home Page) ---
function renderTile(anime){
    const img = anime.image || "";
    const summary = (anime.synopsis || "").slice(0,160);
    const genresHtml = (anime.genres || []).slice(0,4).map(g => `<span class="genre-pill">${escapeHtml(g)}</span>`).join("");
    
    // Create the Dropdown HTML
    const dropdownOptions = [
      `<option value="" disabled selected>+ Add to List</option>`,
      `<option value="Want to Watch">Want to Watch</option>`,
      `<option value="Watching">Watching</option>`,
      `<option value="Completed">Completed</option>`,
      `<option value="Paused">Paused</option>`,
      `<option value="Dropped">Dropped</option>`,
      `<option value="Not Interested">Not Interested</option>`,
    ].join('');

    return `
        <div class="card" data-id="${anime.id}">
            <img src="${escapeAttr(img)}" alt="${escapeAttr(anime.title)}" loading="lazy" onerror="this.style.opacity=.12">
            <div class="overlay">
                <div class="title">${escapeHtml(anime.title)}</div>
                <div class="meta">${escapeHtml(summary)}</div>
                <div class="genres">${genresHtml}</div>
                <div class="actions">
                    <select class="status-select" onchange='closeDropdown(this); addToMyList(${safeJson(anime)}, this.value)'>
                        ${dropdownOptions}
                    </select>
                </div>
            </div>
        </div>
    `;
}

// --- Render Grid Card (Generator Page) ---
function renderGridCard(anime){
    const img = anime.image || "";
    const summary = (anime.synopsis || "").slice(0,140);
    const genresHtml = (anime.genres || []).slice(0,3).map(g => `<span class="genre-pill">${escapeHtml(g)}</span>`).join("");
    
    const dropdownOptions = [
      `<option value="" disabled selected>+ Add to List</option>`,
      `<option value="Want to Watch">Want to Watch</option>`,
      `<option value="Watching">Watching</option>`,
      `<option value="Completed">Completed</option>`,
      `<option value="Paused">Paused</option>`,
      `<option value="Dropped">Dropped</option>`,
      `<option value="Not Interested">Not Interested</option>`,
    ].join('');

    return `
        <div class="card">
            <img src="${escapeAttr(img)}" alt="${escapeAttr(anime.title)}" loading="lazy" onerror="this.style.opacity=.12">
            <div class="overlay">
                <div class="title">${escapeHtml(anime.title)}</div>
                <div class="meta">${escapeHtml(summary)}</div>
                <div class="genres">${genresHtml}</div>
                <div class="actions">
                    <select class="status-select" onchange='closeDropdown(this); addToMyList(${safeJson(anime)}, this.value)'>
                        ${dropdownOptions}
                    </select>
                </div>
            </div>
        </div>
    `;
}

// Data Mapping
function mapToCardData(item){
    const anime = item.anime ? item.anime : item;
    return {
        id: anime.mal_id || anime?.entry?.mal_id || Math.random().toString(36).slice(2),
        mal_id: anime.mal_id || anime?.entry?.mal_id || 0,
        title: anime.title || anime.name || "Untitled",
        image: (anime.images && anime.images.jpg && anime.images.jpg.image_url) || anime.image_url || anime.images?.jpg?.large_image_url || anime.entry?.images?.jpg?.image_url || anime.trailer?.images?.large || "",
        synopsis: anime.synopsis || anime.entry?.synopsis || (anime.title ? "" : ""),
        genres: (anime.genres && anime.genres.map(g => g.name)) || (anime.entry?.genres && anime.entry.genres.map(g=>g.name)) || []
    };
}

// Utility to close dropdown after selection
function closeDropdown(el){
    el.blur();
}

function setupTickerPause(){
    const ticker = document.getElementById("ticker");
    ticker.addEventListener("mouseover", () => ticker.style.animationPlayState = "paused");
    ticker.addEventListener("mouseleave", () => ticker.style.animationPlayState = "running");
    ticker.querySelectorAll && ticker.querySelectorAll(".card").forEach(c => {
        c.addEventListener("mouseenter", () => ticker.style.animationPlayState = "paused");
        c.addEventListener("mouseleave", () => ticker.style.animationPlayState = "running");
    });
}

function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, s => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[s]);
}
function escapeAttr(s){ return escapeHtml(s) }

// CREATE / UPDATE: This is triggered by the Tile Dropdown
async function addToMyList(anime, statusUI){
  const status = statusToEnum(statusUI); 
  
  const payload = {
      jikanId: anime.mal_id, 
      title: anime.title,
      image: anime.image,
      status: status,
  };
  
  try {
      const res = await fetch(`${API_NODE}/api/anime`, {
          method: "POST",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to save");
      
      // If we are on the My List page, refresh the view immediately
      if(document.body.id === "mylist") {
          renderMyList(); 
          showToast("Status updated!"); // Show success on MyList too
      } else {
          // SUCCESS! Show the popup
          showToast(`Added "${anime.title}" to ${statusUI}`);
          
          // Re-init to update the filtering (hide the added anime from the grid)
          if(document.body.id === "home") initHome();
          if(document.body.id === "generator") initGenerator();
      }
  } catch (err) {
      console.error(err);
      showToast("Error: Could not save anime."); // Show error message
  }
}

// ... existing code ...

// --- NEW UTILITY: SHOW TOAST ---
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return; // Guard clause in case HTML is missing the div

  toast.textContent = message;
  toast.className = "show"; // Add the CSS class to make it visible

  // After 3 seconds, remove the class to hide it again
  setTimeout(function(){ 
      toast.className = toast.className.replace("show", ""); 
  }, 3000);
}


//sidebar function's
function openNav(){document.getElementById("mySidenav").style.width="250px";}
function closeNav(){document.getElementById("mySidenav").style.width="0";}