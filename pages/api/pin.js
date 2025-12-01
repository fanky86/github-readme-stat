// pages/api/pin.js
// Menggunakan fetch global (Next.js / Vercel sudah menyediakan)
// Hapus import node-fetch jika ada.

const THEMES = {
  radical: {
    bg: "#0b1020",
    fg: "#ffffff",
    accent: "#ff0078"
  },
  default: {
    bg: "#0f1724",
    fg: "#e6eef8",
    accent: "#38bdf8"
  },
  light: {
    bg: "#ffffff",
    fg: "#0f1724",
    accent: "#2563eb"
  }
};

// helper: escape text for SVG
function esc(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function makeErrorSVG(message, themeObj = THEMES.default) {
  const text = esc(message);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="120" role="img" aria-label="${text}">
  <style>
    .bg { fill: ${themeObj.bg}; }
    .msg { font: 700 14px 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; }
  </style>
  <rect width="100%" height="100%" rx="10" class="bg" />
  <text x="20" y="64" class="msg">${text}</text>
</svg>`;
}

export default async function handler(req, res) {
  try {
    const { username, repo, theme = "radical", hide_border = "false" } = req.query;

    if (!username || !repo) {
      res.status(400).setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.send(makeErrorSVG("Missing username or repo query param. Example: ?username=fanky86&repo=Premium"));
      return;
    }

    const themeObj = THEMES[theme] || THEMES.default;

    // headers untuk request GitHub API
    const headers = {
      "User-Agent": "my-github-pin"
    };
    if (process.env.GITHUB_TOKEN) {
      // modern tokens start with "ghp_" or "gho_" etc. GitHub also prefers "token" or "Bearer"
      headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const owner = encodeURIComponent(username);
    const repoName = encodeURIComponent(repo);
    const apiUrl = `https://api.github.com/repos/${owner}/${repoName}`;

    const repoResp = await fetch(apiUrl, { headers });

    // khusus: rate limit / permission
    if (repoResp.status === 403) {
      // bisa jadi rate-limit atau token tidak punya permission
      res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.status(200).send(makeErrorSVG("GitHub API rate limit or permission error. Try adding GITHUB_TOKEN.", themeObj));
      return;
    }

    if (repoResp.status === 404) {
      res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.status(200).send(makeErrorSVG("Repository tidak ditemukan", themeObj));
      return;
    }

    if (!repoResp.ok) {
      // general error
      const text = await repoResp.text().catch(() => "Unknown error");
      res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
      res.status(200).send(makeErrorSVG(`GitHub API error: ${repoResp.status}`, themeObj));
      console.error("GitHub API error:", repoResp.status, text);
      return;
    }

    const repoJson = await repoResp.json();

    // pull values
    const name = repoJson.full_name || `${username}/${repo}`;
    const description = repoJson.description || "";
    const stars = repoJson.stargazers_count ?? 0;
    const forks = repoJson.forks_count ?? 0;
    const language = repoJson.language || "—";
    const updated = repoJson.updated_at ? new Date(repoJson.updated_at).toLocaleDateString() : "";

    // build SVG
    const hideBorderBool = hide_border === "true" || hide_border === "1";

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="140" viewBox="0 0 520 140" role="img" aria-label="${esc(name)}">
  <style>
    .bg { fill: ${themeObj.bg}; }
    .title { font: 700 16px 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; }
    .desc { font: 400 12px 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; opacity: 0.9; }
    .meta { font: 600 12px 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; }
    .pill { font: 600 11px 'Inter', Arial, sans-serif; fill: ${themeObj.bg}; }
    .accent { fill: ${themeObj.accent}; }
    .small { font: 400 11px 'Inter', Arial, sans-serif; fill: ${themeObj.fg}; opacity: 0.85; }
    .muted { fill: ${themeObj.fg}; opacity: 0.6; font: 400 11px 'Inter', Arial, sans-serif; }
  </style>

  <rect x="0.5" y="0.5" width="519" height="139" rx="10" class="bg" stroke="${hideBorderBool ? themeObj.bg : themeObj.accent}" stroke-width="${hideBorderBool ? 0 : 1}"/>
  
  <g transform="translate(20, 24)">
    <text x="0" y="0" class="title">${esc(name)}</text>
    <foreignObject x="0" y="10" width="480" height="48">
      <div xmlns="http://www.w3.org/1999/xhtml">
        <p style="font-family: Inter, Arial, sans-serif; font-size:12px; margin:8px 0 0 0; color:${themeObj.fg}; opacity:0.9;">${esc(description)}</p>
      </div>
    </foreignObject>

    <g transform="translate(0, 72)">
      <rect x="0" y="-4" width="84" height="28" rx="14" fill="${themeObj.accent}"/>
      <text x="16" y="16" class="pill">Language</text>
      <text x="96" y="16" class="meta">${esc(language)}</text>

      <text x="200" y="16" class="small">★ ${stars}  •  Forks ${forks}  •  Updated ${esc(updated)}</text>
    </g>
  </g>
</svg>`;

    // caching headers (short), helps reduce API calls
    res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
    // Cache 5 minutes; Vercel respects s-maxage
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).send(svg);
  } catch (err) {
    console.error("Unhandled error in /api/pin:", err);
    res.setHeader("Content-Type", "image/svg+xml;charset=utf-8");
    res.status(500).send(makeErrorSVG("Error generating card"));
  }
}
