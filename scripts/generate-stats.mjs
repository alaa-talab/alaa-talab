// Generates stats.svg and top-langs.svg as static assets committed to the
// `output` branch, instead of depending on the shared, frequently-overloaded
// github-readme-stats.vercel.app instance. Runs in CI (see
// .github/workflows/snake.yml) with GITHUB_TOKEN for a higher rate limit;
// works with any public GitHub token when run locally for testing.
import fs from "node:fs/promises";

const USERNAME = process.env.STATS_USERNAME || "alaa-talab";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const OUT_DIR = process.env.STATS_OUT_DIR || "dist";

const COLORS = {
  bg: "#05070D",
  border: "#d8a84e33",
  title: "#D8A84E",
  text: "#F5F1E8",
  muted: "#B9B2A3",
};

// Common linguist colors (github.com/github-linguist/linguist).
const LANG_COLORS = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  PHP: "#4F5D95",
  HTML: "#e34c26",
  CSS: "#563d7c",
  "Vue": "#41b883",
  Dart: "#00B4AB",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Shell: "#89e051",
  Dockerfile: "#384d54",
  EJS: "#a91e50",
  SCSS: "#c6538c",
  Blade: "#f7523f",
  "Jupyter Notebook": "#DA5B0B",
  Go: "#00ADD8",
  Ruby: "#701516",
};

async function ghFetch(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "alaa-talab-profile-stats",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchAllPublicRepos(username) {
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await ghFetch(`/users/${username}/repos?type=public&per_page=100&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

function escapeXml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function statsCard({ publicRepos, totalStars, followers, joinedYear }) {
  const rows = [
    ["Public Repositories", publicRepos],
    ["Total Stars Earned", totalStars],
    ["Followers", followers],
    ["Building since", joinedYear],
  ];
  const width = 420;
  const rowHeight = 32;
  const top = 62;
  const height = top + rows.length * rowHeight + 20;

  const rowsSvg = rows
    .map(([label, value], i) => {
      const y = top + i * rowHeight;
      return `
    <text x="28" y="${y}" fill="${COLORS.muted}" font-size="14">${escapeXml(label)}</text>
    <text x="${width - 28}" y="${y}" fill="${COLORS.title}" font-size="14" font-weight="700" text-anchor="end">${escapeXml(value)}</text>`;
    })
    .join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(USERNAME)}'s GitHub stats">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${COLORS.bg}" stroke="${COLORS.border}" />
  <text x="28" y="34" fill="${COLORS.title}" font-size="18" font-weight="700" font-family="'Segoe UI', Ubuntu, Sans-Serif">${escapeXml(USERNAME)}'s GitHub Stats</text>
  <g font-family="'Segoe UI', Ubuntu, Sans-Serif">${rowsSvg}</g>
</svg>`;
}

function topLangsCard(langBytes) {
  const total = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(langBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  const width = 340;
  const rowHeight = 40;
  const top0 = 56;
  const height = top0 + top.length * rowHeight + 12;
  const barWidth = width - 56;

  const rowsSvg = top
    .map(([lang, bytes], i) => {
      const pct = (bytes / total) * 100;
      const y = top0 + i * rowHeight;
      const color = LANG_COLORS[lang] || "#D8A84E";
      return `
    <text x="28" y="${y}" fill="${COLORS.text}" font-size="13" font-weight="600">${escapeXml(lang)}</text>
    <text x="${width - 28}" y="${y}" fill="${COLORS.muted}" font-size="12" text-anchor="end">${pct.toFixed(1)}%</text>
    <rect x="28" y="${y + 8}" width="${barWidth}" height="6" rx="3" fill="#ffffff14" />
    <rect x="28" y="${y + 8}" width="${(barWidth * pct) / 100}" height="6" rx="3" fill="${color}" />`;
    })
    .join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(USERNAME)}'s most used languages">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${COLORS.bg}" stroke="${COLORS.border}" />
  <text x="28" y="30" fill="${COLORS.title}" font-size="18" font-weight="700" font-family="'Segoe UI', Ubuntu, Sans-Serif">Most Used Languages</text>
  <g font-family="'Segoe UI', Ubuntu, Sans-Serif">${rowsSvg}</g>
</svg>`;
}

async function main() {
  const user = await ghFetch(`/users/${USERNAME}`);
  const repos = await fetchAllPublicRepos(USERNAME);
  const nonForks = repos.filter((r) => !r.fork);

  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);

  const langBytes = {};
  for (const repo of nonForks) {
    try {
      const langs = await ghFetch(`/repos/${USERNAME}/${repo.name}/languages`);
      for (const [lang, bytes] of Object.entries(langs)) {
        langBytes[lang] = (langBytes[lang] || 0) + bytes;
      }
    } catch (err) {
      console.warn(`skip languages for ${repo.name}:`, err.message);
    }
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(
    `${OUT_DIR}/stats.svg`,
    statsCard({
      publicRepos: user.public_repos,
      totalStars,
      followers: user.followers,
      joinedYear: new Date(user.created_at).getFullYear(),
    })
  );
  await fs.writeFile(`${OUT_DIR}/top-langs.svg`, topLangsCard(langBytes));

  console.log(`Wrote ${OUT_DIR}/stats.svg and ${OUT_DIR}/top-langs.svg`);
  console.log(`Public repos: ${user.public_repos}, total stars: ${totalStars}, followers: ${user.followers}`);
  console.log("Languages:", Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([l]) => l).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
