// pages/api/pin.js
// API: /api/pin?username=...&repo=...&theme=...&hide_border=...&show_owner=...&cache_seconds=...
// Menggunakan fetch global (Next.js / Vercel sudah menyediakan)

const THEMES = {
  radical: { bg: "#0b1020", fg: "#ffffff", accent: "#ff0078" },
  dark: { bg: "#0f1724", fg: "#e6eef8", accent: "#38bdf8" },
  light: { bg: "#ffffff", fg: "#0f1724", accent: "#2563eb" },
  github_dark: { bg: "#0d1117", fg: "#c9d1d9", accent: "#238636" },
  github_light: { bg: "#ffffff", fg: "#24292e", accent: "#0969da" },
  dracula: { bg: "#282a36", fg: "#f8f8f2", accent: "#ff79c6" }
};

// Helper untuk escape text SVG
function esc(s) {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// SVG error helper
function makeErrorSVG(message, themeObj = THEMES.dark) {
  const text = esc(message);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="140" role="img" aria-label="${text}">
  <style>
    .bg { fill: ${themeObj.bg}; }
    .title { font: 700 16px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.accent}; }
    .msg { font: 400 13px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; }
  </style>
  <rect width="100%" height="100%" rx="10" class="bg"/>
  <text x="20" y="44" class="title">⚠️ Error</text>
  <text x="20" y="74" class="msg">${text}</text>
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

    if (!username || !repo) {
      res.status(400).setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.send(makeErrorSVG("Missing parameters: username & repo required"));
      return;
    }

    const themeObj = THEMES[theme] || THEMES.radical;
    const hideBorderBool = hide_border === "true" || hide_border === "1";
    const showOwnerBool = show_owner !== "false";
    const cacheTime = parseInt(cache_seconds, 10) || 1800;

    // Setup headers untuk GitHub API
    const headers = {
      "User-Agent": "github-readme-pin/1.0",
      "Accept": "application/vnd.github.v3+json"
    };

    if (process.env.GITHUB_TOKEN) {
      // GitHub menerima "Bearer" or "token", Bearer is fine for fine-grained tokens
      headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const owner = encodeURIComponent(username);
    const repoName = encodeURIComponent(repo);
    const apiUrl = `https://api.github.com/repos/${owner}/${repoName}`;

    const repoResp = await fetch(apiUrl, { headers });

    if (repoResp.status === 403) {
      res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.setHeader("Cache-Control", `public, max-age=${Math.min(cacheTime, 3600)}, stale-while-revalidate=3600`);
      res.status(200).send(makeErrorSVG("GitHub API rate limit or permissions error. Try adding GITHUB_TOKEN.", themeObj));
      return;
    }

    if (repoResp.status === 404) {
      res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.setHeader("Cache-Control", `public, max-age=300`);
      res.status(200).send(makeErrorSVG(`Repository not found: ${username}/${repo}`, themeObj));
      return;
    }

    if (!repoResp.ok) {
      const text = await repoResp.text().catch(() => "Unknown error");
      console.error("GitHub API unexpected response:", repoResp.status, text);
      res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.setHeader("Cache-Control", `public, max-age=300`);
      res.status(200).send(makeErrorSVG(`GitHub API error: ${repoResp.status}`, themeObj));
      return;
    }

    const repoData = await repoResp.json();

    // Extract data
    const fullName = showOwnerBool ? (repoData.full_name || `${username}/${repo}`) : (repoData.name || repo);
    const description = repoData.description || "No description provided";
    const stars = repoData.stargazers_count ?? 0;
    const forks = repoData.forks_count ?? 0;
    const language = repoData.language || "Unknown";
    const updatedAt = repoData.updated_at ?
      new Date(repoData.updated_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      }) :
      "Unknown";

    const topics = repoData.topics || [];
    const licenseName = repoData.license?.spdx_id || repoData.license?.name || null;
    const isPrivate = !!repoData.private;

    // Format angka
    function formatNumber(num) {
      if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      return String(num);
    }

    // Build SVG (pastikan tidak ada duplikat atribut class di elemen mana pun)
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="170" viewBox="0 0 500 170" role="img" aria-label="${esc(fullName)}">
  <style>
    .bg { fill: ${themeObj.bg}; }
    .title { font: 600 17px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; }
    .desc { font: 400 13px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; opacity: 0.85; }
    .label { font: 600 12px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; }
    .value { font: 500 13px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.accent}; }
    .muted { font: 400 11px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; opacity: 0.7; }
    .badge { font: 600 11px 'Segoe UI', 'Inter', Arial, sans-serif; fill: ${themeObj.bg}; }
    .private-dot { fill: ${isPrivate ? '#ff6b6b' : '#50fa7b'}; }
  </style>

  <!-- container background + border (single class attribute only) -->
  <rect x="1" y="1" width="498" height="168" rx="12" class="bg" 
        style="stroke: ${hideBorderBool ? themeObj.bg : themeObj.accent}; stroke-width: ${hideBorderBool ? 0 : 2};"/>

  <!-- Header -->
  <g transform="translate(20, 30)">
    <circle cx="0" cy="-8" r="6" class="private-dot" />
    <text x="14" y="-2" class="title">${esc(fullName)}</text>
    <text x="${Math.max(fullName.length * 8 + 40, 160)}" y="-2" class="muted">${isPrivate ? 'Private' : 'Public'}</text>
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
      ">
      ${esc(description)}
    </div>
  </foreignObject>

  <!-- Stats row -->
  <g transform="translate(20, 105)">
    <circle cx="8" cy="8" r="4" style="fill: ${themeObj.accent};" />
    <text x="20" y="12" class="label">Language:</text>
    <text x="80" y="12" class="value">${esc(language)}</text>

    <text x="160" y="12" class="label">⭐ Stars:</text>
    <text x="215" y="12" class="value">${formatNumber(stars)}</text>

    <text x="280" y="12" class="label">🍴 Forks:</text>
    <text x="330" y="12" class="value">${formatNumber(forks)}</text>
  </g>

  <!-- Topics & Updated -->
  <g transform="translate(20, 130)">
    <text x="0" y="0" class="label">🏷️ Topics:</text>
    <text x="70" y="0" class="muted">${esc(topics.slice(0, 3).join(', '))}${topics.length > 3 ? '...' : ''}</text>

    <text x="250" y="0" class="label">📅 Updated:</text>
    <text x="310" y="0" class="muted">${esc(updatedAt)}</text>
  </g>

  <!-- License -->
  ${licenseName ? `
  <g transform="translate(20, 150)">
    <text x="0" y="0" class="label">📜 License:</text>
    <text x="70" y="0" class="muted">${esc(licenseName)}</text>
  </g>
  ` : ''}

  <!-- Link hint -->
  <text x="400" y="165" class="muted" font-size="10">Click to visit →</text>
</svg>`;

    // Headers response + caching
    res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
    res.setHeader("Cache-Control", `public, max-age=${cacheTime}, stale-while-revalidate=3600`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(svg);
  } catch (err) {
    console.error("Error in /api/pin:", err);
    res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(500).send(makeErrorSVG("Internal server error"));
  }
}
