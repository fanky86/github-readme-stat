// pages/api/pin.js
const THEMES = {
  radical: {
    bg: "#0b1020",
    fg: "#ffffff",
    accent: "#ff0078"
  },
  dark: {
    bg: "#0f1724",
    fg: "#e6eef8",
    accent: "#38bdf8"
  },
  light: {
    bg: "#ffffff",
    fg: "#0f1724",
    accent: "#2563eb"
  },
  github_dark: {
    bg: "#0d1117",
    fg: "#c9d1d9",
    accent: "#238636"
  },
  github_light: {
    bg: "#ffffff",
    fg: "#24292e",
    accent: "#0969da"
  },
  dracula: {
    bg: "#282a36",
    fg: "#f8f8f2",
    accent: "#ff79c6"
  }
};

// Helper untuk escape text SVG
function esc(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// SVG untuk error
function makeErrorSVG(message, themeObj = THEMES.dark) {
  const text = esc(message);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="140" role="img" aria-label="${text}">
  <style>
    .bg { fill: ${themeObj.bg}; }
    .title { font: 700 16px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.accent}; }
    .msg { font: 400 13px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; }
    .link { font: 400 11px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.accent}; text-decoration: underline; }
  </style>
  <rect width="100%" height="100%" rx="10" class="bg" />
  <text x="20" y="40" class="title">⚠️ Error</text>
  <text x="20" y="70" class="msg">${text}</text>
  <text x="20" y="100" class="link">github.com/${text.includes('username') ? 'fanky86/Premium' : '...'}</text>
</svg>`;
}

// SVG untuk rate limit
function makeRateLimitSVG(themeObj = THEMES.dark) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="140" role="img" aria-label="Rate Limit">
  <style>
    .bg { fill: ${themeObj.bg}; }
    .title { font: 700 16px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.accent}; }
    .msg { font: 400 13px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; }
    .tip { font: 400 11px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; opacity: 0.7; }
  </style>
  <rect width="100%" height="100%" rx="10" class="bg" />
  <text x="20" y="40" class="title">⏳ Rate Limit Exceeded</text>
  <text x="20" y="70" class="msg">GitHub API rate limit reached</text>
  <text x="20" y="90" class="msg">Add GITHUB_TOKEN for higher limits</text>
  <text x="20" y="120" class="tip">Will auto-refresh in 1 hour</text>
</svg>`;
}

export default async function handler(req, res) {
  try {
    const { 
      username, 
      repo, 
      theme = "radical", 
      hide_border = "false",
      show_owner = "true",
      cache_seconds = "1800"
    } = req.query;

    // Validasi parameter
    if (!username || !repo) {
      res.status(400).setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.send(makeErrorSVG("Missing parameters: username & repo required"));
      return;
    }

    const themeObj = THEMES[theme] || THEMES.radical;
    const hideBorderBool = hide_border === "true" || hide_border === "1";
    const showOwnerBool = show_owner !== "false";

    // Setup headers untuk GitHub API
    const headers = {
      "User-Agent": "github-readme-pin/1.0",
      "Accept": "application/vnd.github.v3+json"
    };
    
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    // Encode parameter
    const owner = encodeURIComponent(username);
    const repoName = encodeURIComponent(repo);
    const apiUrl = `https://api.github.com/repos/${owner}/${repoName}`;

    // Fetch data dari GitHub API
    const repoResp = await fetch(apiUrl, { headers });

    // Handle rate limiting
    if (repoResp.status === 403 || repoResp.headers.get('x-ratelimit-remaining') === '0') {
      const resetTime = repoResp.headers.get('x-ratelimit-reset');
      const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000).toLocaleTimeString() : 'unknown';
      
      res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.setHeader("Cache-Control", `public, max-age=${cache_seconds}, stale-while-revalidate=3600`);
      res.status(200).send(makeRateLimitSVG(themeObj));
      return;
    }

    // Handle 404 - Repository not found
    if (repoResp.status === 404) {
      res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.setHeader("Cache-Control", `public, max-age=300`);
      res.status(200).send(makeErrorSVG(`Repository not found: ${username}/${repo}`, themeObj));
      return;
    }

    // Handle error lainnya
    if (!repoResp.ok) {
      const errorText = await repoResp.text().catch(() => "Unknown error");
      console.error("GitHub API error:", repoResp.status, errorText);
      
      res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.setHeader("Cache-Control", `public, max-age=300`);
      res.status(200).send(makeErrorSVG(`GitHub API error: ${repoResp.status}`, themeObj));
      return;
    }

    // Parse data JSON
    const repoData = await repoResp.json();

    // Ekstrak data yang diperlukan
    const fullName = showOwnerBool ? repoData.full_name || `${username}/${repo}` : repoData.name || repo;
    const description = repoData.description || "No description provided";
    const stars = repoData.stargazers_count ?? 0;
    const forks = repoData.forks_count ?? 0;
    const language = repoData.language || "Unknown";
    const updatedAt = repoData.updated_at ? 
      new Date(repoData.updated_at).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      }) : 
      "Unknown";
    
    const topics = repoData.topics || [];
    const licenseName = repoData.license?.spdx_id || repoData.license?.name || null;
    const isPrivate = repoData.private || false;

    // Format angka dengan K/M
    function formatNumber(num) {
      if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      }
      return num.toString();
    }

    // Build SVG
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="170" viewBox="0 0 500 170" role="img" aria-label="${esc(fullName)}">
  <style>
    .bg { fill: ${themeObj.bg}; }
    .border { stroke: ${hideBorderBool ? themeObj.bg : themeObj.accent}; stroke-width: ${hideBorderBool ? 0 : 2}; }
    .title { font: 600 17px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; }
    .desc { font: 400 13px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; opacity: 0.85; }
    .label { font: 600 12px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; }
    .value { font: 500 13px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.accent}; }
    .muted { font: 400 11px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; opacity: 0.7; }
    .badge { font: 600 11px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.bg}; }
    .private-badge { fill: ${isPrivate ? '#ff6b6b' : '#50fa7b'}; }
  </style>

  <!-- Background dengan border -->
  <rect x="1" y="1" width="498" height="168" rx="12" class="bg" class="border"/>
  
  <!-- Header dengan nama repo -->
  <g transform="translate(20, 30)">
    <!-- Private/Public badge -->
    <circle cx="0" cy="-8" r="6" class="private-badge"/>
    <text x="10" y="0" class="title">${esc(fullName)}</text>
    <text x="${fullName.length * 9 + 25}" y="0" class="muted">${isPrivate ? 'Private' : 'Public'}</text>
  </g>

  <!-- Description -->
  <foreignObject x="20" y="45" width="460" height="50">
    <div xmlns="http://www.w3.org/1999/xhtml" style="
      font-family: 'Segoe UI', Inter, Arial, sans-serif;
      font-size: 13px;
      color: ${themeObj.fg};
      opacity: 0.85;
      line-height: 1.4;
      word-wrap: break-word;
    ">${esc(description)}</div>
  </foreignObject>

  <!-- Stats bar -->
  <g transform="translate(20, 105)">
    <!-- Language -->
    <circle cx="8" cy="8" r="4" fill="${themeObj.accent}"/>
    <text x="20" y="12" class="label">Language:</text>
    <text x="80" y="12" class="value">${esc(language)}</text>
    
    <!-- Stars -->
    <text x="180" y="12" class="label">⭐ Stars:</text>
    <text x="225" y="12" class="value">${formatNumber(stars)}</text>
    
    <!-- Forks -->
    <text x="280" y="12" class="label">🍴 Forks:</text>
    <text x="320" y="12" class="value">${formatNumber(forks)}</text>
  </g>

  <!-- Second row: Topics & Updated -->
  <g transform="translate(20, 130)">
    <!-- Topics -->
    <text x="0" y="0" class="label">🏷️ Topics:</text>
    <text x="55" y="0" class="muted">${topics.slice(0, 3).map(t => esc(t)).join(', ')}${topics.length > 3 ? '...' : ''}</text>
    
    <!-- Updated -->
    <text x="250" y="0" class="label">📅 Updated:</text>
    <text x="310" y="0" class="muted">${esc(updatedAt)}</text>
  </g>

  <!-- License -->
  ${licenseName ? `
  <g transform="translate(20, 150)">
    <text x="0" y="0" class="label">📜 License:</text>
    <text x="60" y="0" class="muted">${esc(licenseName)}</text>
  </g>
  ` : ''}

  <!-- Link hint -->
  <text x="400" y="165" class="muted" font-size="10">Click to visit →</text>
</svg>`;

    // Set response headers untuk caching
    const cacheTime = parseInt(cache_seconds) || 1800;
    res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
    res.setHeader("Cache-Control", `public, max-age=${cacheTime}, stale-while-revalidate=3600`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    // Send SVG
    res.status(200).send(svg);

  } catch (err) {
    console.error("Error in /api/pin:", err);
    res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(500).send(makeErrorSVG("Internal server error"));
  }
}
