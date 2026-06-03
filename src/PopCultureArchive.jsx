//merged version - 3 june

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

const DECADES = ["1980s", "1990s", "2000s", "2010s", "2020s"];
const DECADE_RANGE = {
  "1980s": [1980, 1989],
  "1990s": [1990, 1999],
  "2000s": [2000, 2009],
  "2010s": [2010, 2019],
  "2020s": [2020, 2026],
};

const COLORS = [
  "#4a9edd",
  "#e85d8e",
  "#3dbfa8",
  "#e8943a",
  "#7c6fcd",
  "#f4c430",
  "#5dc47a",
  "#f06a5f",
  "#58c7e6",
  "#b16be8",
];

const RESULT_LIMIT = 10;
const GENRE_SHARE_LIMIT = 5;
const MIN_TOP_MOVIE_VOTES = 100;
const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || "71790251f947beef32f979fe5ba1c0fe";
const TMDB_MOVIE_START_YEAR = 1980;
const TMDB_MOVIE_END_YEAR = 2026;
const TMDB_MOVIE_PAGES_PER_YEAR = 1;
const YEAR_OPTIONS = Array.from({ length: TMDB_MOVIE_END_YEAR - TMDB_MOVIE_START_YEAR + 1 }, (_, index) => TMDB_MOVIE_START_YEAR + index);
const BILLBOARD_DATASET_URLS = Object.values(import.meta.glob("../dataset/billboard/*.csv", {
  eager: true,
  query: "?url",
  import: "default",
})).sort();

function isChristmasSong(song) {
  const christmasKeywords = [
    "christmas", "jingle", "sleigh", "santa", "holly", "mistletoe", 
    "winter wonderland", "deck the halls", "silent night", "feliz navidad",
    "it's the most beautiful time of the year", "it's the most wonderful time of the year", "let it snow"
  ];
  const titleLower = song.title.toLowerCase();
  if (christmasKeywords.some(keyword => titleLower.includes(keyword))) return true;
  // Also check genre specifically for 'holiday' or 'christmas'
  if (song.genre && (song.genre.toLowerCase().includes("holiday") || song.genre.toLowerCase().includes("christmas"))) return true;
  return false;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function parseCsv(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }
  const csv = await response.text();
  return Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
  }).data;
}

async function fetchTmdbJson(path, params = {}) {
  const url = new URL(`${TMDB_API_BASE}${path}`);
  url.search = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: "en-US",
    ...params,
  });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load TMDB data from ${path}`);
  }
  return response.json();
}

async function fetchTmdbMoviePage(year, page) {
  const data = await fetchTmdbJson("/discover/movie", {
    include_adult: "false",
    include_video: "false",
    page: String(page),
    primary_release_year: String(year),
    sort_by: "popularity.desc",
  });
  return { year, data };
}

async function fetchTmdbMovieTotal() {
  const data = await fetchTmdbJson("/discover/movie", {
    include_adult: "false",
    include_video: "false",
    page: "1",
    sort_by: "popularity.desc",
  });
  return data.total_results || 0;
}

function normalizeMovie(movie, genreMap) {
  const year = Number.parseInt(movie.release_date?.slice(0, 4), 10);
  if (!Number.isFinite(year) || !movie.title) return null;
  const genres = (movie.genre_ids || [])
    .map((genreId) => genreMap.get(genreId))
    .filter(Boolean);
  return {
    title: movie.title,
    year,
    genres,
    genre: genres[0] || "Unknown",
    rating: toNumber(movie.vote_average),
    votes: Math.round(toNumber(movie.vote_count)),
    popularity: toNumber(movie.popularity),
    director: "",
    posterPath: movie.poster_path || "",
  };
}

async function fetchTmdbMovies() {
  const movieRequests = [];
  for (let year = TMDB_MOVIE_START_YEAR; year <= TMDB_MOVIE_END_YEAR; year += 1) {
    for (let page = 1; page <= TMDB_MOVIE_PAGES_PER_YEAR; page += 1) {
      movieRequests.push(fetchTmdbMoviePage(year, page));
    }
  }
  const [allMovieTotal, genreData, ...moviePages] = await Promise.all([
    fetchTmdbMovieTotal(),
    fetchTmdbJson("/genre/movie/list"),
    ...movieRequests,
  ]);
  const genreMap = new Map((genreData.genres || []).map((genre) => [genre.id, genre.name]));
  const moviesById = new Map();
  const yearTotals = {};
  moviePages.forEach(({ year, data }) => {
    if (data.page === 1) {
      yearTotals[year] = data.total_results || 0;
    }
    (data.results || []).forEach((movie) => {
      if (movie.id) moviesById.set(movie.id, movie);
    });
  });
  return {
    movies: [...moviesById.values()].map((movie) => normalizeMovie(movie, genreMap)).filter(Boolean),
    allMovieTotal,
    yearTotals,
  };
}

function normalizeSong(row) {
  const year = toNumber(row.Year);
  if (!year || !row.Song) return null;
  return {
    title: row.Song,
    artist: row.Artist || "Unknown artist",
    year,
    weeks: Math.round(toNumber(row["Weeks in Charts"])),
    genre: row.broad_genre || row.lastfm_top_tag || "Billboard Hot 100",
    appearances: Math.max(1, Math.round(toNumber(row["Weeks in Charts"], 1))),
  };
}

function buildMovieGenreYears(movies) {
  const counts = new Map();
  movies.forEach((movie) => {
    const genres = movie.genres.length ? movie.genres : ["Unknown"];
    genres.forEach((genre) => {
      const key = `${genre}|${movie.year}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return [...counts.entries()].map(([key, count]) => {
    const [genre, year] = key.split("|");
    return { genre, year: Number(year), count };
  });
}

function isRatedMovie(movie) {
  return Number.isFinite(movie.rating) && movie.rating > 0;
}

function isQualifiedTopMovie(movie) {
  return isRatedMovie(movie) && movie.votes >= MIN_TOP_MOVIE_VOTES;
}

function smoothSharePoints(points) {
  return points.map((point, index) => {
    const windowPoints = points.slice(Math.max(0, index - 1), Math.min(points.length, index + 2));
    const share = windowPoints.reduce((sum, item) => sum + item.share, 0) / windowPoints.length;
    return { ...point, share };
  });
}

function InsightText({ children }) {
  if (!children) return null;
  return (
    <div style={{ color: "#c6c6d8", fontSize: 13, lineHeight: 1.45, margin: "-6px 0 16px" }}>
      {children}
    </div>
  );
}

// chart top 10 songs+
function SongPerformanceChart({ songs, yearStart, yearEnd }) {
  const [tooltip, setTooltip] = useState(null);
  
  const topSongs = useMemo(() => {
    return songs
      .map(s => ({ 
        ...s, 
        weeksInYear: Object.entries(s.yearlyWeeks || {}).filter(([y]) => Number(y) >= yearStart && Number(y) <= yearEnd).reduce((acc, [, w]) => acc + w, 0) 
      }))
      .filter(s => s.weeksInYear > 0)
      .sort((a, b) => b.weeksInYear - a.weeksInYear)
      .slice(0, 10);
  }, [songs, yearStart, yearEnd]);

  const width = 700;
  const rowHeight = 26;
  const height = Math.max(topSongs.length * rowHeight + 20, 30);
  const margin = { top: 5, right: 40, bottom: 10, left: 180 };
  const innerWidth = width - margin.left - margin.right;
  const maxWeeks = Math.max(...topSongs.map(s => s.weeksInYear), 1);

  const x = (weeks) => (weeks / maxWeeks) * innerWidth;
  const y = (index) => margin.top + index * rowHeight;

  return (
    <div style={{ position: "relative", maxWidth: "720px", margin: "0 auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        {topSongs.map((song, index) => (
          <g key={song.title}>
            <text x={0} y={y(index) + 11} textAnchor="start" fill="#c6c6d8" fontSize="15">
              <title>{song.title}</title>
              {song.title.length > 22 ? song.title.slice(0, 17) + "…" : song.title}
            </text>
            <rect x={margin.left} y={y(index) + 3} width={x(song.weeksInYear)} height={rowHeight - 15} fill={COLORS[index % COLORS.length]} 
                onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, title: song.title, weeks: song.weeksInYear })}
                onMouseLeave={() => setTooltip(null)} />
            <text x={margin.left + x(song.weeksInYear) + 2} y={y(index) + 12} fill="#fff" fontSize="15">
              {song.weeksInYear}
            </text>
          </g>
        ))}
      </svg>
      {tooltip && (
        <div style={{ position: "fixed", left: tooltip.x + 10, top: tooltip.y + 10, background: "#17172b", padding: "5px", color: "#fff", fontSize: 12, border: "1px solid #2a2a4a", pointerEvents: "none" }}>
          {tooltip.title}: {tooltip.weeks} weeks
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, fontSize = 26 }) {
  return (
    <div style={{
      background: "#17172b",
      border: "1px solid #2a2a4a",
      borderRadius: 8,
      padding: "16px 18px",
      minWidth: 150,
      boxSizing: "border-box",
    }}>
      <div style={{ fontSize: 12, color: "#9a9ab4", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: fontSize, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#4ade80", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function TimelineBar({ decade, count, max, mode }) {
  const h = count === 0 ? 0 : Math.max(6, (count / max) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0, height: "100%" }}>
      <div style={{ flex: "0 0 24px", fontSize: 11, color: "#9a9ab4", whiteSpace: "nowrap" }}>{count.toLocaleString()}</div>
      <div style={{ flex: "1 1 auto", minHeight: 0, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div style={{
          width: "clamp(18px, 56%, 38px)",
          height: `${h}%`,
          borderRadius: h > 0 ? "5px 5px 0 0" : 0,
          background: mode === "movies" ? "#4a9edd" : "#e85d8e",
          transition: "height 0.4s ease",
        }} />
      </div>
      <div style={{ flex: "0 0 16px", fontSize: 10, color: "#b8b8ca", textAlign: "center", whiteSpace: "nowrap", lineHeight: "16px" }}>{decade}</div>
    </div>
  );
}

function GenreStackedAreaChart({ series, xLabel }) {
  const [activeGenres, setActiveGenres] = useState(new Set());
  const [hoveredGenre, setHoveredGenre] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const width = 720;
  const height = 320;
  const margin = { top: 18, right: 28, bottom: 56, left: 70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Dynamically derive years from the series data itself
  const years = useMemo(() => {
    const allYears = new Set();
    series.forEach(s => s.points.forEach(p => allYears.add(p.year)));
    return [...allYears].sort((a, b) => a - b);
  }, [series]);

  const minYear = years.length > 0 ? years[0] : 1980;
  const maxYear = years.length > 0 ? years[years.length - 1] : 2026;
  const yearSpan = Math.max(maxYear - minYear, 1);
  
  const rawMax = Math.max(...years.map(y => series.reduce((sum, s) => sum + (s.points.find(p => p.year === y)?.count || 0), 0)), 1);
  const x = (year) => margin.left + ((year - minYear) / yearSpan) * innerWidth;
  const y = (count) => margin.top + innerHeight - (count / rawMax) * innerHeight;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => Math.round(pct * rawMax));
  
  const cumulative = new Map(years.map((year) => [year, 0]));

  const toggleGenre = (genre) => {
    const next = new Set(activeGenres);
    if (next.has(genre)) next.delete(genre);
    else next.add(genre);
    setActiveGenres(next);
  };

  const isDimmed = (genre) => {
    if (hoveredGenre) return hoveredGenre !== genre;
    return activeGenres.size > 0 && !activeGenres.has(genre);
  };

  // Dynamically calculate interval to prevent overlap
  const tickDensity = Math.max(1, Math.floor(yearSpan / 10));
  const xTicks = [];
  for (let y = minYear; y <= maxYear; y += tickInterval) {
    // Only add a tick if there's enough space
    if (xTicks.length === 0 || (x(y) - x(xTicks[xTicks.length - 1])) > 40) {
      xTicks.push(y);
    }
  }

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: "100%", height: "auto", display: "block" }}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={margin.left} y1={y(tick)} x2={margin.left + innerWidth} y2={y(tick)} stroke="#20203a" />
            <text x={margin.left - 10} y={y(tick) + 4} textAnchor="end" fill="#8b8ba3" fontSize="11">{tick.toLocaleString()}</text>
          </g>
        ))}
        {series.map((item, index) => {
          const isDimmed = hoveredGenre 
            ? hoveredGenre !== item.name 
            : (activeGenres.size > 0 && !activeGenres.has(item.name));
          
          const upper = item.points.map((point) => {
            const base = cumulative.get(point.year) || 0;
            const top = base + point.count;
            cumulative.set(point.year, top);
            return `${x(point.year)},${y(top)}`;
          });
          const lower = [...item.points].reverse().map((point) => {
            const top = cumulative.get(point.year) || 0;
            const base = top - point.count;
            return `${x(point.year)},${y(base)}`;
          });
          return (
            <polygon key={item.name} points={[...upper, ...lower].join(" ")} 
              fill={COLORS[index % COLORS.length]}
              opacity={isDimmed ? 0.15 : 0.8}
              style={{ transition: "opacity 0.2s, fill 0.2s", cursor: "pointer" }}
              onMouseEnter={() => setHoveredGenre(item.name)}
              onMouseLeave={() => setHoveredGenre(null)}
              onClick={() => toggleGenre(item.name)} />
          );
        })}
        {[minYear, Math.round((minYear + maxYear) / 2), maxYear].map((year) => (
          <text key={year} x={x(year)} y={height - 26} textAnchor="middle" fill="#8b8ba3" fontSize="12">{year}</text>
        ))}
      </svg>
      {tooltip && (
        <div style={{ position: "fixed", left: tooltip.x + 10, top: tooltip.y + 10, background: "#17172b", padding: "5px", color: "#fff", fontSize: 12, border: "1px solid #2a2a4a", pointerEvents: "none", zIndex: 10 }}>
          {tooltip.name}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        {series.map((item, index) => (
          <button key={item.name} 
            onClick={() => toggleGenre(item.name)}
            onMouseEnter={() => setHoveredGenre(item.name)}
            onMouseLeave={() => setHoveredGenre(null)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, 
              color: (activeGenres.size === 0 || activeGenres.has(item.name)) ? "#c6c6d8" : "#666", 
              background: "none", border: "none", cursor: "pointer", transition: "color 0.2s" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: (activeGenres.size === 0 || activeGenres.has(item.name)) ? COLORS[index % COLORS.length] : "#343452" }} />
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function GenreShareAreaChart({ series, years, activeGenre, onGenreSelect }) {
  const [hoveredGenre, setHoveredGenre] = useState("");
  const width = 720;
  const height = 320;
  const margin = { top: 18, right: 28, bottom: 56, left: 70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const yearSpan = Math.max(maxYear - minYear, 1);
  const ticks = [0, 25, 50, 75, 100];
  const x = (year) => margin.left + ((year - minYear) / yearSpan) * innerWidth;
  const y = (share) => margin.top + innerHeight - (share / 100) * innerHeight;
  const cumulative = new Map(years.map((year) => [year, 0]));
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: "100%", height: "auto", display: "block" }}>
        {ticks.map((tick) => {
          const tickY = y(tick);
          return (
            <g key={tick}>
              <line x1={margin.left} y1={tickY} x2={margin.left + innerWidth} y2={tickY} stroke={tick === 0 ? "#343452" : "#20203a"} />
              <text x={margin.left - 10} y={tickY + 4} textAnchor="end" fill="#8b8ba3" fontSize="11">{tick}%</text>
            </g>
          );
        })}
        {[minYear, Math.round((minYear + maxYear) / 2), maxYear].map((year) => (
          <text key={year} x={x(year)} y={height - 26} textAnchor="middle" fill="#8b8ba3" fontSize="11">{year}</text>
        ))}
        {series.map((item, index) => {
          const upper = item.points.map((point) => {
            const base = cumulative.get(point.year) || 0;
            const top = Math.min(100, base + point.share);
            cumulative.set(point.year, top);
            return `${x(point.year)},${y(top)}`;
          });
          const lower = [...item.points].reverse().map((point) => {
            const top = cumulative.get(point.year) || 0;
            const base = Math.max(0, top - point.share);
            return `${x(point.year)},${y(base)}`;
          });
          const isDimmed = hoveredGenre && hoveredGenre !== item.name;
          const isSelected = activeGenre === item.name;
          return (
            <polygon
              key={item.name}
              points={[...upper, ...lower].join(" ")}
              fill={COLORS[index % COLORS.length]}
              opacity={isDimmed ? 0.28 : 0.82}
              stroke={isSelected ? "#fff" : "#0d0d1a"}
              strokeWidth={isSelected ? "2.4" : "1"}
              style={{ cursor: "pointer", transition: "opacity 0.18s ease" }}
              onMouseEnter={() => setHoveredGenre(item.name)}
              onMouseLeave={() => setHoveredGenre("")}
              onClick={() => onGenreSelect(activeGenre === item.name ? "all" : item.name)}
            >
              <title>{`${item.name}: click to ${activeGenre === item.name ? "clear" : "filter"}`}</title>
            </polygon>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        {series.map((item, index) => (
          <button
            key={item.name}
            onClick={() => onGenreSelect(activeGenre === item.name ? "all" : item.name)}
            onMouseEnter={() => setHoveredGenre(item.name)}
            onMouseLeave={() => setHoveredGenre("")}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12,
              color: activeGenre === item.name ? "#fff" : "#c6c6d8",
              background: activeGenre === item.name ? "#ffffff14" : "transparent",
              border: "1px solid", borderColor: activeGenre === item.name ? "#ffffff33" : "transparent",
              borderRadius: 6, padding: "3px 6px", cursor: "pointer",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[index % COLORS.length] }} />
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function RatingDistributionChart({ distributions, selectedDecade, onDecadeSelect }) {
  const width = 420;
  const height = 320;
  const margin = { top: 20, right: 28, bottom: 48, left: 44 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const slot = innerWidth / distributions.length;
  const y = (rating) => margin.top + innerHeight - (rating / 10) * innerHeight;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 2, 4, 6, 8, 10].map((tick) => (
        <g key={tick}>
          <line x1={margin.left} y1={y(tick)} x2={margin.left + innerWidth} y2={y(tick)} stroke={tick === 0 ? "#343452" : "#20203a"} />
          <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" fill="#8b8ba3" fontSize="11">{tick}</text>
        </g>
      ))}
      {distributions.map((item, index) => {
        const cx = margin.left + slot * index + slot / 2;
        const boxWidth = Math.min(42, slot * 0.52);
        const hasData = item.count > 0;
        const isSelected = selectedDecade === item.decade;
        return (
          <g key={item.decade} opacity={hasData ? 1 : 0.35} onClick={() => onDecadeSelect(isSelected ? "all" : item.decade)} style={{ cursor: "pointer" }}>
            {hasData && (
              <>
                <line x1={cx} y1={y(item.min)} x2={cx} y2={y(item.max)} stroke={isSelected ? "#fff" : "#82c7f5"} strokeWidth={isSelected ? "2.4" : "1.6"} />
                <line x1={cx - boxWidth / 2} y1={y(item.min)} x2={cx + boxWidth / 2} y2={y(item.min)} stroke="#82c7f5" />
                <line x1={cx - boxWidth / 2} y1={y(item.max)} x2={cx + boxWidth / 2} y2={y(item.max)} stroke="#82c7f5" />
                <rect x={cx - boxWidth / 2} y={y(item.q3)} width={boxWidth} height={Math.max(2, y(item.q1) - y(item.q3))} fill={isSelected ? "#ffffff24" : "#4a9edd44"} stroke={isSelected ? "#fff" : "#4a9edd"} />
                <line x1={cx - boxWidth / 2} y1={y(item.median)} x2={cx + boxWidth / 2} y2={y(item.median)} stroke="#f4c430" strokeWidth="2" />
                <circle cx={cx} cy={y(item.avg)} r="3" fill="#e85d8e">
                  <title>{`${item.decade}: avg ${item.avg.toFixed(1)}, ${item.count} rated movies. Click to ${isSelected ? "clear" : "filter"}.`}</title>
                </circle>
              </>
            )}
            <text x={cx} y={height - 20} textAnchor="middle" fill={isSelected ? "#fff" : "#b8b8ca"} fontSize="10" fontWeight={isSelected ? "700" : "400"}>{item.decade}</text>
          </g>
        );
      })}
    </svg>
  );
}

function GenreRatingBarChart({ points, activeGenre, onGenreSelect }) {
  const width = 720;
  const rowHeight = 22;
  const height = Math.max(280, 46 + points.length * rowHeight);
  const margin = { top: 18, right: 120, bottom: 28, left: 112 };
  const innerWidth = width - margin.left - margin.right;
  const maxAvg = 10;
  const x = (rating) => margin.left + (rating / maxAvg) * innerWidth;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 2, 4, 6, 8, 10].map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} y1={margin.top} x2={x(tick)} y2={height - margin.bottom} stroke={tick === 0 ? "#343452" : "#20203a"} />
          <text x={x(tick)} y={height - 8} textAnchor="middle" fill="#8b8ba3" fontSize="11">{tick}</text>
        </g>
      ))}
      {points.map((point, index) => (
        <g key={point.genre} onClick={() => onGenreSelect(activeGenre === point.genre ? "all" : point.genre)} style={{ cursor: "pointer" }}>
          <text x={margin.left - 10} y={margin.top + index * rowHeight + 15} textAnchor="end" fill={activeGenre === point.genre ? "#fff" : "#c6c6d8"} fontSize="11" fontWeight={activeGenre === point.genre ? "700" : "400"}>{point.genre}</text>
          <rect x={margin.left} y={margin.top + index * rowHeight + 3} width={Math.max(2, x(point.avg) - margin.left)} height="14" rx="4" fill={COLORS[index % COLORS.length]} opacity={activeGenre && activeGenre !== point.genre ? 0.35 : 0.8}>
            <title>{`${point.genre}: ${point.avg.toFixed(1)} avg rating across ${point.count} sampled rated movies. Click to filter.`}</title>
          </rect>
          <text x={x(point.avg) + 8} y={margin.top + index * rowHeight + 15} fill="#f4c430" fontSize="11" fontWeight="700">★ {point.avg.toFixed(1)}</text>
          <text x={width - margin.right + 12} y={margin.top + index * rowHeight + 15} fill="#8b8ba3" fontSize="10">{point.count} sampled</text>
        </g>
      ))}
    </svg>
  );
}

function DecadesAtAGlance({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
      {items.map((item) => (
        <div key={item.decade} style={{ background: "#17172b", border: "1px solid #2a2a4a", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, color: "#9a9ab4", textTransform: "uppercase", marginBottom: 8 }}>{item.decade}</div>
          <div style={{ fontSize: 18, color: "#fff", fontWeight: 800 }}>{item.genre || "No data"}</div>
          {item.movie && (
            <>
              <div style={{ fontSize: 12, color: "#82c7f5", marginTop: 8 }}>{item.movie.title}</div>
              <div style={{ fontSize: 11, color: "#9a9ab4", marginTop: 4 }}>Defining film by rating: ★ {item.movie.rating.toFixed(1)}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function RatingSparklineCard({ points }) {
  const width = 210;
  const height = 54;
  const minYear = Math.min(...points.map((point) => point.year));
  const maxYear = Math.max(...points.map((point) => point.year));
  const yearSpan = Math.max(maxYear - minYear, 1);
  const minRating = Math.min(...points.map((point) => point.avg), 0);
  const maxRating = Math.max(...points.map((point) => point.avg), 10);
  const ratingSpan = Math.max(maxRating - minRating, 1);
  const path = points.map((point, index) => {
    const px = ((point.year - minYear) / yearSpan) * width;
    const py = height - ((point.avg - minRating) / ratingSpan) * height;
    return `${index === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join(" ");
  const latest = points[points.length - 1];
  const first = points[0];
  const delta = latest && first ? latest.avg - first.avg : 0;
  return (
    <div style={{ background: "#17172b", border: "1px solid #2a2a4a", borderRadius: 8, padding: "16px 18px", minWidth: "min(240px, 100%)", boxSizing: "border-box" }}>
      <div style={{ fontSize: 12, color: "#9a9ab4", marginBottom: 6, textTransform: "uppercase" }}>Avg rating trend</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>★ {latest ? latest.avg.toFixed(1) : "0.0"}</div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 54, marginTop: 8, display: "block" }}>
        <path d={path} fill="none" stroke="#4a9edd" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ fontSize: 12, color: delta >= 0 ? "#4ade80" : "#f06a5f" }}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)} since {first?.year || ""}</div>
    </div>
  );
}

function TopRatedGenresCard({ items }) {
  return (
    <div style={{ background: "#17172b", border: "1px solid #2a2a4a", borderRadius: 8, padding: "16px 18px", minWidth: "min(260px, 100%)", boxSizing: "border-box" }}>
      <div style={{ fontSize: 12, color: "#9a9ab4", marginBottom: 10, textTransform: "uppercase" }}>Top rated per genre</div>
      {items.slice(0, 4).map((item) => (
        <div key={item.genre} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderTop: "1px solid #20203a" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.genre}</div>
            <div style={{ color: "#9a9ab4", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.movie.title}</div>
          </div>
          <div style={{ color: "#f4c430", fontSize: 12, fontWeight: 800, flex: "0 0 auto" }}>★ {item.movie.rating.toFixed(1)}</div>
        </div>
      ))}
    </div>
  );
}

function RatingYearScatterPlot({ movies, onMovieSelect }) {
  const width = 720;
  const height = 320;
  const margin = { top: 18, right: 28, bottom: 56, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const minYear = Math.min(...movies.map((movie) => movie.year), TMDB_MOVIE_START_YEAR);
  const maxYear = Math.max(...movies.map((movie) => movie.year), TMDB_MOVIE_END_YEAR);
  const yearSpan = Math.max(maxYear - minYear, 1);
  const x = (year) => margin.left + ((year - minYear) / yearSpan) * innerWidth;
  const y = (rating) => margin.top + innerHeight - (rating / 10) * innerHeight;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 2, 4, 6, 8, 10].map((tick) => (
        <g key={tick}>
          <line x1={margin.left} y1={y(tick)} x2={margin.left + innerWidth} y2={y(tick)} stroke={tick === 0 ? "#343452" : "#20203a"} />
          <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" fill="#8b8ba3" fontSize="11">{tick}</text>
        </g>
      ))}
      {[minYear, Math.round((minYear + maxYear) / 2), maxYear].map((year) => (
        <text key={year} x={x(year)} y={height - 24} textAnchor="middle" fill="#8b8ba3" fontSize="11">{year}</text>
      ))}
      {movies.map((movie, index) => (
        <circle key={`${movie.title}-${movie.year}-${index}`} cx={x(movie.year)} cy={y(movie.rating)} r="2.4" fill="#e85d8e" opacity="0.34" style={{ cursor: "pointer" }} onClick={() => onMovieSelect(movie)}>
          <title>{`${movie.title}, ${movie.year}: ${movie.rating.toFixed(1)} from ${movie.votes.toLocaleString()} votes. Click to isolate.`}</title>
        </circle>
      ))}
      <text x={margin.left + innerWidth / 2} y={height - 8} textAnchor="middle" fill="#c6c6d8" fontSize="12" fontWeight="600">Release year</text>
      <text x={16} y={margin.top + innerHeight / 2} textAnchor="middle" fill="#c6c6d8" fontSize="12" fontWeight="600" transform={`rotate(-90 16 ${margin.top + innerHeight / 2})`}>Rating</text>
    </svg>
  );
}

// SearchResult: uses item.years && item.years.length > 0 guard (fix for songs crash)
function SearchResult({ item, mode }) {
  const isMovie = mode === "movies";
  const detail = isMovie
    ? `${item.year} / ${(item.genres || [item.genre]).join(", ")}`
    : `${item.artist} / ${item.genre}`;
  const rightContent = isMovie ? (
    <div style={{ textAlign: "right" }}>
      <div style={{ color: "#f4c430", fontWeight: 700 }}>★ {item.rating.toFixed(1)}</div>
      <div style={{ fontSize: 13, color: "#9a9ab4" }}>{item.votes.toLocaleString()} votes</div>
    </div>
  ) : (
    <div style={{ display: "flex", gap: "20px" }}>
      {item.years && item.years.length > 0 ? (
        <>
          {item.years.map(y => (
            <div key={y} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{y}</div>
              <div style={{ fontSize: 15, color: "#e85d8e", whiteSpace: "nowrap" }}>{item.yearlyWeeks[y]} weeks</div>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f4c430" }}>Total</div>
            <div style={{ fontSize: 15, color: "#e85d8e", whiteSpace: "nowrap" }}>{item.historicalStats?.totalWeeks || item.weeks} weeks</div>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{item.year}</div>
          <div style={{ fontSize: 15, color: "#e85d8e" }}>{item.weeks} weeks</div>
        </div>
      )}
    </div>
  );
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "16px 0", borderBottom: "1px solid #20203a" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 650, color: "#fff", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
        <div style={{ fontSize: 14, color: "#9a9ab4", marginTop: 6 }}>{detail}</div>
      </div>
      <div style={{ flex: "0 0 auto" }}>{rightContent}</div>
    </div>
  );
}

function HomeMovieCard({ movie, label, onClick }) {
  const posterUrl = movie.posterPath ? `${TMDB_IMAGE_BASE}${movie.posterPath}` : "";
  return (
    <div
      onClick={onClick}
      style={{ background: "#17172b", border: "1px solid #2a2a4a", borderRadius: 8, overflow: "hidden", minWidth: 0, cursor: onClick ? "pointer" : "default", transition: "border-color 0.15s ease" }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = "#4a9edd"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a4a"; }}
    >
      {posterUrl
        ? <img src={posterUrl} alt={`${movie.title} poster`} style={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover", display: "block" }} />
        : <div style={{ aspectRatio: "2 / 3", display: "grid", placeItems: "center", background: "#20203a", color: "#8b8ba3", fontSize: 12 }}>No poster</div>}
      <div style={{ padding: 10 }}>
        <div style={{ fontSize: 11, color: "#82c7f5", marginBottom: 4 }}>{label || movie.year}</div>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, lineHeight: 1.25, minHeight: 34 }}>{movie.title}</div>
        <div style={{ color: "#f4c430", fontSize: 12, fontWeight: 700, marginTop: 6 }}>★ {movie.rating.toFixed(1)}</div>
      </div>
    </div>
  );
}

function getFilteredYears(yearRange, selectedDecade) {
  if (selectedDecade === "all") return yearRange;
  const [lo, hi] = DECADE_RANGE[selectedDecade];
  return [Math.max(yearRange[0], lo), Math.min(yearRange[1], hi)];
}

function getMovieDecade(year) {
  return DECADES.find((decade) => {
    const [lo, hi] = DECADE_RANGE[decade];
    return year >= lo && year <= hi;
  }) || "";
}

function getGenreAverage(movies, genre) {
  const genreMovies = movies.filter((movie) => isRatedMovie(movie) && (movie.genres.length ? movie.genres : ["Unknown"]).includes(genre));
  const sum = genreMovies.reduce((total, movie) => total + movie.rating, 0);
  return { avg: genreMovies.length ? sum / genreMovies.length : 0, count: genreMovies.length };
}

function getRatingPercentile(movie, movies, genre) {
  const comparison = movies.filter((item) => isRatedMovie(item) && (item.genres.length ? item.genres : ["Unknown"]).includes(genre));
  if (!isRatedMovie(movie) || comparison.length === 0) return null;
  const belowOrEqual = comparison.filter((item) => item.rating <= movie.rating).length;
  return Math.round((belowOrEqual / comparison.length) * 100);
}

function PercentileGauge({ movie, genreAverage, percentile }) {
  const ratingPosition = Math.max(0, Math.min(100, (movie.rating / 10) * 100));
  const avgPosition = Math.max(0, Math.min(100, (genreAverage / 10) * 100));
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: "#c6c6d8", marginBottom: 8 }}>
        <span>How it compares</span>
        <span>{percentile ? `Top ${Math.max(1, 101 - percentile)}% of genre sample` : "No rating context"}</span>
      </div>
      <div style={{ position: "relative", height: 12, borderRadius: 999, background: "#20203a", overflow: "hidden" }}>
        <div style={{ width: `${ratingPosition}%`, height: "100%", background: "linear-gradient(90deg, #4a9edd, #e85d8e)" }} />
        <div style={{ position: "absolute", left: `${avgPosition}%`, top: -4, width: 2, height: 20, background: "#f4c430" }}>
          <title>Genre average</title>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8, fontSize: 12, color: "#9a9ab4" }}>
        <span>{movie.rating.toFixed(1)} movie rating</span>
        <span>{genreAverage.toFixed(1)} genre average</span>
      </div>
    </div>
  );
}

function MovieDetailCard({ movie, allMovies }) {
  const posterUrl = movie.posterPath ? `${TMDB_IMAGE_BASE}${movie.posterPath}` : "";
  const primaryGenre = movie.genres[0] || movie.genre || "Unknown";
  const decade = getMovieDecade(movie.year);
  const genreStats = getGenreAverage(allMovies, primaryGenre);
  const pct = getRatingPercentile(movie, allMovies, primaryGenre);
  return (
    <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20, display: "grid", gridTemplateColumns: "minmax(120px, 180px) minmax(0, 1fr)", gap: 18 }}>
      {posterUrl
        ? <img src={posterUrl} alt={`${movie.title} poster`} style={{ width: "100%", borderRadius: 8, aspectRatio: "2 / 3", objectFit: "cover" }} />
        : <div style={{ borderRadius: 8, aspectRatio: "2 / 3", display: "grid", placeItems: "center", background: "#20203a", color: "#8b8ba3", fontSize: 12 }}>No poster</div>}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, color: "#fff", fontSize: 28, lineHeight: 1.08 }}>{movie.title}</h2>
          <span style={{ color: "#82c7f5", fontSize: 16, fontWeight: 700 }}>{movie.year}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {(movie.genres.length ? movie.genres : [movie.genre]).map((genre) => (
            <span key={genre} style={{ border: "1px solid #2a2a4a", borderRadius: 999, padding: "4px 10px", color: "#c6c6d8", fontSize: 12 }}>{genre}</span>
          ))}
        </div>
        <div style={{ marginTop: 18, display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
          <div style={{ color: "#f4c430", fontSize: 38, fontWeight: 850, lineHeight: 1 }}>★ {movie.rating.toFixed(1)}</div>
          <div style={{ color: "#9a9ab4", fontSize: 13 }}>{movie.votes.toLocaleString()} votes</div>
        </div>
        <div style={{ marginTop: 10, color: "#c6c6d8", fontSize: 13 }}>
          {pct ? `Ranks in the top ${Math.max(1, 101 - pct)}% of sampled ${primaryGenre} films${decade ? ` from the ${decade}` : ""}.` : "This movie does not have enough rating context in the loaded sample."}
        </div>
        <PercentileGauge movie={movie} genreAverage={genreStats.avg} percentile={pct} />
      </div>
    </div>
  );
}

function PeerList({ movie, allMovies }) {
  const primaryGenre = movie.genres[0] || movie.genre || "Unknown";
  const decade = getMovieDecade(movie.year);
  const [lo, hi] = DECADE_RANGE[decade] || [TMDB_MOVIE_START_YEAR, TMDB_MOVIE_END_YEAR];
  const peers = allMovies
    .filter((item) => item.title !== movie.title && item.year >= lo && item.year <= hi)
    .filter((item) => (item.genres.length ? item.genres : ["Unknown"]).includes(primaryGenre))
    .filter(isQualifiedTopMovie)
    .sort((a, b) => b.rating - a.rating || b.votes - a.votes)
    .slice(0, 5);
  return (
    <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Genre peers</h3>
      <InsightText>{peers.length ? `Closest context: highly rated ${primaryGenre} films from the ${decade || "same era"} in the loaded sample.` : `No qualified ${primaryGenre} peers from this decade in the loaded sample.`}</InsightText>
      {peers.map((peer) => (
        <SearchResult key={`${peer.title}-${peer.year}`} item={peer} mode="movies" />
      ))}
    </div>
  );
}

function SearchContextScatter({ allMovies, highlightedMovies, onMovieSelect }) {
  const contextMovies = allMovies.filter(isRatedMovie);
  const highlightedTitles = new Set(highlightedMovies.map((movie) => `${movie.title}|${movie.year}`));
  const width = 720; const height = 320;
  const margin = { top: 18, right: 28, bottom: 56, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const minYear = Math.min(...contextMovies.map((movie) => movie.year), TMDB_MOVIE_START_YEAR);
  const maxYear = Math.max(...contextMovies.map((movie) => movie.year), TMDB_MOVIE_END_YEAR);
  const yearSpan = Math.max(maxYear - minYear, 1);
  const x = (year) => margin.left + ((year - minYear) / yearSpan) * innerWidth;
  const y = (rating) => margin.top + innerHeight - (rating / 10) * innerHeight;
  return (
    <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Rating vs release year context</h3>
      <InsightText>All rated sampled movies are shown as faint context; searched movies are highlighted so the single result keeps its place in the larger field.</InsightText>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 2, 4, 6, 8, 10].map((tick) => (
          <g key={tick}>
            <line x1={margin.left} y1={y(tick)} x2={margin.left + innerWidth} y2={y(tick)} stroke={tick === 0 ? "#343452" : "#20203a"} />
            <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" fill="#8b8ba3" fontSize="11">{tick}</text>
          </g>
        ))}
        {[minYear, Math.round((minYear + maxYear) / 2), maxYear].map((year) => (
          <text key={year} x={x(year)} y={height - 24} textAnchor="middle" fill="#8b8ba3" fontSize="11">{year}</text>
        ))}
        {contextMovies.map((movie, index) => {
          const highlighted = highlightedTitles.has(`${movie.title}|${movie.year}`);
          return (
            <circle key={`${movie.title}-${movie.year}-${index}`} cx={x(movie.year)} cy={y(movie.rating)} r={highlighted ? 6 : 2} fill={highlighted ? "#f4c430" : "#8b8ba3"} opacity={highlighted ? 1 : 0.18} stroke={highlighted ? "#fff" : "transparent"} strokeWidth={highlighted ? 1.6 : 0} style={{ cursor: highlighted ? "default" : "pointer" }} onClick={() => onMovieSelect(movie)}>
              <title>{`${movie.title}, ${movie.year}: ${movie.rating.toFixed(1)} from ${movie.votes.toLocaleString()} votes`}</title>
            </circle>
          );
        })}
        <text x={margin.left + innerWidth / 2} y={height - 8} textAnchor="middle" fill="#c6c6d8" fontSize="12" fontWeight="600">Release year</text>
        <text x={16} y={margin.top + innerHeight / 2} textAnchor="middle" fill="#c6c6d8" fontSize="12" fontWeight="600" transform={`rotate(-90 16 ${margin.top + innerHeight / 2})`}>Rating</text>
      </svg>
    </div>
  );
}

function SearchDecadeContext({ movies }) {
  const activeDecades = new Set(movies.map((movie) => getMovieDecade(movie.year)).filter(Boolean));
  return (
    <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Decade placement</h3>
      <InsightText>{activeDecades.size === 1 ? `Released in the ${[...activeDecades][0]}; other decades are dimmed for context.` : "Multiple matched movies span these highlighted decades."}</InsightText>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        {DECADES.map((decade) => {
          const active = activeDecades.has(decade);
          const decadeMovies = movies.filter((movie) => getMovieDecade(movie.year) === decade);
          return (
            <div key={decade} style={{ border: "1px solid", borderColor: active ? "#e85d8e" : "#2a2a4a", borderRadius: 8, padding: 12, opacity: active ? 1 : 0.35, background: active ? "#e85d8e14" : "#17172b" }}>
              <div style={{ color: active ? "#ff9cc1" : "#9a9ab4", fontSize: 12, fontWeight: 800 }}>{decade}</div>
              <div style={{ color: "#fff", fontSize: 13, marginTop: 8 }}>{active ? decadeMovies.map((movie) => movie.title).join(", ") : "Not matched"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RelevantDecadeRatingContext({ movies, allMovies }) {
  const primaryMovie = movies.find(isRatedMovie) || movies[0];
  const decade = getMovieDecade(primaryMovie.year);
  const [lo, hi] = DECADE_RANGE[decade] || [TMDB_MOVIE_START_YEAR, TMDB_MOVIE_END_YEAR];
  const ratings = allMovies.filter((movie) => isRatedMovie(movie) && movie.year >= lo && movie.year <= hi).map((movie) => movie.rating);
  const stats = {
    count: ratings.length,
    min: ratings.length ? Math.min(...ratings) : 0,
    q1: percentile(ratings, 0.25),
    median: percentile(ratings, 0.5),
    q3: percentile(ratings, 0.75),
    max: ratings.length ? Math.max(...ratings) : 0,
  };
  const width = 420; const height = 180;
  const margin = { top: 24, right: 24, bottom: 34, left: 44 };
  const innerHeight = height - margin.top - margin.bottom;
  const y = (rating) => margin.top + innerHeight - (rating / 10) * innerHeight;
  const cx = width / 2;
  const boxWidth = 70;
  return (
    <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Relevant decade rating context</h3>
      <InsightText>{primaryMovie.title} is marked against the {decade} sampled rating distribution.</InsightText>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 5, 10].map((tick) => (
          <g key={tick}>
            <line x1={margin.left} y1={y(tick)} x2={width - margin.right} y2={y(tick)} stroke={tick === 0 ? "#343452" : "#20203a"} />
            <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" fill="#8b8ba3" fontSize="11">{tick}</text>
          </g>
        ))}
        {stats.count > 0 && (
          <>
            <line x1={cx} y1={y(stats.min)} x2={cx} y2={y(stats.max)} stroke="#82c7f5" strokeWidth="1.6" />
            <rect x={cx - boxWidth / 2} y={y(stats.q3)} width={boxWidth} height={Math.max(2, y(stats.q1) - y(stats.q3))} fill="#4a9edd44" stroke="#4a9edd" />
            <line x1={cx - boxWidth / 2} y1={y(stats.median)} x2={cx + boxWidth / 2} y2={y(stats.median)} stroke="#f4c430" strokeWidth="2" />
            {movies.filter(isRatedMovie).map((movie, index) => (
              <circle key={`${movie.title}-${movie.year}`} cx={cx + (index - (movies.length - 1) / 2) * 16} cy={y(movie.rating)} r="5" fill="#e85d8e" stroke="#fff" strokeWidth="1.5">
                <title>{`${movie.title}: ${movie.rating.toFixed(1)}`}</title>
              </circle>
            ))}
          </>
        )}
        <text x={cx} y={height - 10} textAnchor="middle" fill="#c6c6d8" fontSize="12">{decade} rated sample, {stats.count.toLocaleString()} movies</text>
      </svg>
    </div>
  );
}

function MovieSearchDetailView({ movies, allMovies, onMovieSelect }) {
  const primaryMovie = movies[0];
  return (
    <div>
      <div style={{ marginBottom: 18, color: "#c6c6d8", fontSize: 14 }}>
        {movies.length === 1 ? "Showing a movie detail view because the search has narrowed to one result." : `Showing a detail view for ${movies.length} close matches.`}
      </div>
      <div style={{ display: "grid", gap: 18, marginBottom: 28 }}>
        {movies.map((movie) => (
          <MovieDetailCard key={`${movie.title}-${movie.year}`} movie={movie} allMovies={allMovies} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 20, marginBottom: 28 }}>
        <PeerList movie={primaryMovie} allMovies={allMovies} />
        <RelevantDecadeRatingContext movies={movies} allMovies={allMovies} />
        <SearchDecadeContext movies={movies} />
      </div>
      <SearchContextScatter allMovies={allMovies} highlightedMovies={movies.filter(isRatedMovie)} onMovieSelect={onMovieSelect} />
    </div>
  );
}

export default function PopCultureArchive() {
  const [mode, setMode] = useState("home");
  const [selectedDecade, setSelectedDecade] = useState("all");
  const [selectedGenre, setSelectedGenre] = useState("all");
  const [removeChristmasSongs, setRemoveChristmasSongs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [yearRange, setYearRange] = useState([1980, 2026]);
  const [movies, setMovies] = useState([]);
  const [allMovieTotal, setAllMovieTotal] = useState(0);
  const [movieYearTotals, setMovieYearTotals] = useState({});
  const [songs, setSongs] = useState([]);
  const [movieGenreYears, setMovieGenreYears] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  // FROM FRIEND: displayLimit for load more
  const [displayLimit, setDisplayLimit] = useState(RESULT_LIMIT);

  useEffect(() => {
    async function loadData() {
      try {
        const [movieData, billboardRowsByYear] = await Promise.all([
          fetchTmdbMovies(),
          Promise.all(BILLBOARD_DATASET_URLS.map((url) => parseCsv(url))),
        ]);
        const normalizedMovies = movieData.movies;
        const rawSongs = billboardRowsByYear.flat().map(normalizeSong).filter(Boolean);
        const songStats = new Map();
        rawSongs.forEach(song => {
          const key = `${song.title}-${song.artist}`;
          const current = songStats.get(key) || { totalWeeks: 0, totalAppearances: 0 };
          songStats.set(key, {
            totalWeeks: current.totalWeeks + song.weeks,
            totalAppearances: current.totalAppearances + song.appearances
          });
        });
        const enrichedSongs = rawSongs.map(song => ({
          ...song,
          historicalStats: songStats.get(`${song.title}-${song.artist}`)
        }));
        setMovies(normalizedMovies);
        setAllMovieTotal(movieData.allMovieTotal);
        setMovieYearTotals(movieData.yearTotals);
        setSongs(enrichedSongs);
        setMovieGenreYears(buildMovieGenreYears(normalizedMovies));
        setLoadState("ready");
      } catch (error) {
        console.error(error);
        setLoadState("error");
      }
    }
    loadData();
  }, []);

  // FROM FRIEND: reset displayLimit when query/mode changes
  useEffect(() => {
    setDisplayLimit(RESULT_LIMIT);
  }, [searchQuery, mode]);

  const data = mode === "songs" ? songs : movies;
  const [activeYearStart, activeYearEnd] = getFilteredYears(yearRange, selectedDecade);

  const allGenres = useMemo(() => {
    if (mode === "songs") return [...new Set(songs.map((song) => song.genre).filter(Boolean))].sort();
    const relevantMovies = movies.filter(m => m.year >= activeYearStart && m.year <= activeYearEnd);
    const genres = new Set();
    relevantMovies.forEach(m => m.genres.forEach(g => genres.add(g)));
    return [...genres].sort();
  }, [mode, movies, activeYearStart, activeYearEnd, songs]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = data.filter((item) => {
      if (item.year < activeYearStart || item.year > activeYearEnd) return false;
      if (mode === "movies" && selectedGenre !== "all" && !(item.genres || [item.genre]).includes(selectedGenre)) return false;
      if (mode === "songs" && selectedGenre !== "all" && item.genre !== selectedGenre) return false;
      if (mode === "songs" && removeChristmasSongs && isChristmasSong(item)) return false;
      if (q) {
        if (mode === "songs") {
          // FROM FRIEND: partial match for songs (includes instead of exact)
          if (!item.title.toLowerCase().includes(q) && !item.artist.toLowerCase().includes(q)) return false;
        } else {
          const searchable = [item.title, item.artist, item.director, item.genre, ...(item.genres || [])].filter(Boolean).join(" ").toLowerCase();
          if (!searchable.includes(q)) return false;
        }
      }
      return true;
    });
    if (mode === "songs") {
      const aggregated = new Map();
      result.forEach(song => {
        const key = `${song.title}-${song.artist}`;
        if (!aggregated.has(key)) {
          aggregated.set(key, { ...song, yearlyWeeks: new Map() });
        }
        aggregated.get(key).yearlyWeeks.set(song.year, song.weeks);
      });
      result = [...aggregated.values()].map(s => ({
        ...s,
        years: [...s.yearlyWeeks.keys()].sort((a, b) => a - b),
        yearlyWeeks: Object.fromEntries(s.yearlyWeeks) // Convert to plain object for easier access
      }));
    }
    return result;
  }, [data, activeYearStart, activeYearEnd, selectedGenre, searchQuery, mode, removeChristmasSongs]);

  const ratedMoviesForCharts = useMemo(() => {
    if (mode !== "movies") return [];
    return filtered.filter(isRatedMovie);
  }, [filtered, mode]);

  const qualifiedTopMovies = useMemo(() => {
    if (mode !== "movies") return [];
    return filtered.filter(isQualifiedTopMovie);
  }, [filtered, mode]);

  const chartSeries = useMemo(() => {
    // Derive actual min/max years from filtered data
    const allYears = new Set();
    filtered.forEach(item => {
      if (item.year) allYears.add(item.year);
      if (item.years) item.years.forEach(y => allYears.add(y));
    });
    const minYear = allYears.size > 0 ? Math.min(...allYears) : activeYearStart;
    const maxYear = allYears.size > 0 ? Math.max(...allYears) : activeYearEnd;
    const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);

    if (mode === "songs") {
      const counts = new Map();
      const genreTotals = new Map();
      
      filtered.forEach((song) => {
        const genres = (song.genre || "Unknown").split(" / ").map(g => g.trim());
        genres.forEach(genre => {
          const key = `${genre}|${song.year}`;
          counts.set(key, (counts.get(key) || 0) + 1);
          genreTotals.set(genre, (genreTotals.get(genre) || 0) + 1);
        });
      });

      const majorGenres = [...genreTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([genre]) => genre);

      const series = majorGenres.map(genre => ({
        name: genre,
        points: years.map(year => ({ year, count: counts.get(`${genre}|${year}`) || 0 }))
      }));

      const otherPoints = years.map(year => {
        let count = 0;
        [...genreTotals.keys()].filter(g => !majorGenres.includes(g)).forEach(genre => {
          count += counts.get(`${genre}|${year}`) || 0;
        });
        return { year, count };
      });
      series.push({ name: "Other", points: otherPoints });

      return { years, series };
    }
    // ... (rest of the movie logic remains unchanged)
    const scopedRows = movieGenreYears.filter((row) => row.year >= minYear && row.year <= maxYear);
    const totals = new Map();
    scopedRows.forEach((row) => {
      if (selectedGenre !== "all" && row.genre !== selectedGenre) return;
      totals.set(row.genre, (totals.get(row.genre) || 0) + row.count);
    });
    const genres = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, selectedGenre === "all" ? 10 : 1).map(([genre]) => genre);
    const rowMap = new Map(scopedRows.map((row) => [`${row.genre}|${row.year}`, row.count]));
    return {
      years,
      series: genres.map((genre) => ({ name: genre, points: years.map((year) => ({ year, count: rowMap.get(`${genre}|${year}`) || 0 })) })),
    };
  }, [mode, filtered, movieGenreYears, activeYearStart, activeYearEnd, selectedGenre]);

  const movieShareSeries = useMemo(() => {
    const years = Array.from({ length: activeYearEnd - activeYearStart + 1 }, (_, index) => activeYearStart + index);
    const scopedRows = movieGenreYears.filter((row) => row.year >= activeYearStart && row.year <= activeYearEnd);
    const yearTotals = new Map();
    const genreTotals = new Map();
    scopedRows.forEach((row) => {
      if (selectedGenre !== "all" && row.genre !== selectedGenre) return;
      yearTotals.set(row.year, (yearTotals.get(row.year) || 0) + row.count);
      genreTotals.set(row.genre, (genreTotals.get(row.genre) || 0) + row.count);
    });
    const genres = [...genreTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, selectedGenre === "all" ? GENRE_SHARE_LIMIT : 1).map(([genre]) => genre);
    const rowMap = new Map(scopedRows.map((row) => [`${row.genre}|${row.year}`, row.count]));
    return {
      years,
      series: genres.map((genre) => ({
        name: genre,
        points: smoothSharePoints(years.map((year) => {
          const total = yearTotals.get(year) || 0;
          const count = rowMap.get(`${genre}|${year}`) || 0;
          return { year, share: total ? (count / total) * 100 : 0 };
        })),
      })),
    };
  }, [movieGenreYears, activeYearStart, activeYearEnd, selectedGenre]);

  const movieRatingDistributions = useMemo(() => {
    return DECADES.map((decade) => {
      const [lo, hi] = DECADE_RANGE[decade];
      const ratings = ratedMoviesForCharts.filter((movie) => movie.year >= lo && movie.year <= hi).map((movie) => movie.rating);
      const sum = ratings.reduce((total, rating) => total + rating, 0);
      return {
        decade, count: ratings.length,
        min: ratings.length ? Math.min(...ratings) : 0,
        q1: percentile(ratings, 0.25), median: percentile(ratings, 0.5), q3: percentile(ratings, 0.75),
        max: ratings.length ? Math.max(...ratings) : 0,
        avg: ratings.length ? sum / ratings.length : 0,
      };
    });
  }, [ratedMoviesForCharts]);

  const genreRatingPoints = useMemo(() => {
    const aggregates = new Map();
    ratedMoviesForCharts.forEach((movie) => {
      const genres = movie.genres.length ? movie.genres : ["Unknown"];
      genres.forEach((genre) => {
        const current = aggregates.get(genre) || { genre, count: 0, ratingSum: 0, topMovie: movie };
        current.count += 1;
        current.ratingSum += movie.rating;
        if (movie.rating > current.topMovie.rating || (movie.rating === current.topMovie.rating && movie.votes > current.topMovie.votes)) {
          current.topMovie = movie;
        }
        aggregates.set(genre, current);
      });
    });
    return [...aggregates.values()].map((item) => ({ genre: item.genre, count: item.count, avg: item.ratingSum / item.count, topMovie: item.topMovie })).sort((a, b) => b.avg - a.avg || b.count - a.count).slice(0, 12);
  }, [ratedMoviesForCharts]);

  // FIX: use optional chaining on movie.genres to prevent crash when mode=songs
  const decadesAtAGlance = useMemo(() => {
    if (mode !== "movies") return [];
    return DECADES.map((decade) => {
      const [lo, hi] = DECADE_RANGE[decade];
      const moviesInDecade = filtered.filter((movie) => movie.year >= lo && movie.year <= hi);
      const counts = new Map();
      moviesInDecade.forEach((movie) => {
        const genres = movie.genres?.length ? movie.genres : ["Unknown"];
        genres.forEach((genre) => counts.set(genre, (counts.get(genre) || 0) + 1));
      });
      const genre = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      const movie = genre
        ? moviesInDecade.filter((item) => (item.genres?.length ? item.genres : ["Unknown"]).includes(genre)).filter(isQualifiedTopMovie).sort((a, b) => b.rating - a.rating || b.votes - a.votes)[0]
        : null;
      return { decade, genre, movie };
    });
  }, [filtered, mode]);

  const ratingTrendPoints = useMemo(() => {
    const byYear = new Map();
    ratedMoviesForCharts.forEach((movie) => {
      const current = byYear.get(movie.year) || { year: movie.year, count: 0, sum: 0 };
      current.count += 1;
      current.sum += movie.rating;
      byYear.set(movie.year, current);
    });
    return [...byYear.values()].sort((a, b) => a.year - b.year).map((item) => ({ year: item.year, avg: item.sum / item.count }));
  }, [ratedMoviesForCharts]);

  const topRatedPerGenre = useMemo(() => {
    const byGenre = new Map();
    qualifiedTopMovies.forEach((movie) => {
      const genres = movie.genres.length ? movie.genres : ["Unknown"];
      genres.forEach((genre) => {
        const current = byGenre.get(genre);
        if (!current || movie.rating > current.rating || (movie.rating === current.rating && movie.votes > current.votes)) {
          byGenre.set(genre, movie);
        }
      });
    });
    return [...byGenre.entries()].map(([genre, movie]) => ({ genre, movie })).sort((a, b) => b.movie.rating - a.movie.rating || b.movie.votes - a.movie.votes);
  }, [qualifiedTopMovies]);

  const decadeCounts = useMemo(() => {
    return DECADES.map((decade) => {
      const [lo, hi] = DECADE_RANGE[decade];
      if (mode === "movies") {
        let count = 0;
        for (let year = lo; year <= hi; year += 1) count += movieYearTotals[year] || 0;
        return { decade, count };
      }
      return { decade, count: data.filter((item) => item.year >= lo && item.year <= hi).length };
    });
  }, [data, mode, movieYearTotals]);

  const hasMovieSubsetFilter = mode === "movies" && (selectedGenre !== "all" || searchQuery.trim());
  const visibleMovieTotal = useMemo(() => {
    if (mode !== "movies" || hasMovieSubsetFilter) return filtered.length;
    if (selectedDecade === "all" && activeYearStart === TMDB_MOVIE_START_YEAR && activeYearEnd === TMDB_MOVIE_END_YEAR) {
      return allMovieTotal || filtered.length;
    }
    let count = 0;
    for (let year = activeYearStart; year <= activeYearEnd; year += 1) count += movieYearTotals[year] || 0;
    return count || filtered.length;
  }, [mode, hasMovieSubsetFilter, selectedDecade, activeYearStart, activeYearEnd, allMovieTotal, filtered.length, movieYearTotals]);

  const maxDecadeCount = Math.max(...decadeCounts.map((item) => item.count), 1);

  // FROM FRIEND: better topItem and topResults for songs
  const topItem = mode === "movies"
    ? [...qualifiedTopMovies].sort((a, b) => b.rating - a.rating || b.votes - a.votes)[0]
    : mode === "songs"
      ? [...filtered].sort((a, b) => (b.historicalStats?.totalWeeks || b.weeks) - (a.historicalStats?.totalWeeks || a.weeks))[0]
      : null;

  const topResults = useMemo(() => {
    const sorted = mode === "movies"
      ? [...qualifiedTopMovies].sort((a, b) => b.rating - a.rating || b.votes - a.votes)
      : [...filtered].sort((a, b) => { 
          const sumWeeks = (s) => Object.entries(s.yearlyWeeks || {}).filter(([y]) => Number(y) >= activeYearStart && Number(y) <= activeYearEnd).reduce((acc, [, w]) => acc + w, 0); 
          return sumWeeks(b) - sumWeeks(a); 
        });
    return sorted.slice(0, displayLimit);
  }, [filtered, mode, qualifiedTopMovies, displayLimit, activeYearStart, activeYearEnd]);

  const homeYearlyTopMovies = useMemo(() => {
    const topByYear = new Map();
    movies.filter(isQualifiedTopMovie).forEach((movie) => {
      const current = topByYear.get(movie.year);
      if (!current || movie.rating > current.rating || (movie.rating === current.rating && movie.votes > current.votes)) {
        topByYear.set(movie.year, movie);
      }
    });
    return [...topByYear.values()].sort((a, b) => b.year - a.year);
  }, [movies]);

  const homeTopSongs = useMemo(() => {
    console.log("homeTopSongs memo recomputed, removeChristmasSongs:", removeChristmasSongs);
    return [...songs]
      .filter(song => {
        const isChristmas = isChristmasSong(song);
        if (removeChristmasSongs && isChristmas) return false;
        return true;
      })
      .sort((a, b) => b.weeks - a.weeks || a.title.localeCompare(b.title))
      .slice(0, RESULT_LIMIT);
  }, [songs, removeChristmasSongs]);

  // FROM FRIEND: avgRating and songMatch
  const avgRating = mode === "movies"
    ? (filtered.reduce((sum, item) => sum + item.rating, 0) / (filtered.length || 1)).toFixed(1)
    : null;
  const totalWeeks = mode === "songs"
    ? filtered.reduce((sum, item) => sum + (item.historicalStats?.totalWeeks || item.weeks), 0)
    : null;
  const songMatch = mode === "songs" && searchQuery.trim() && filtered.length === 1 ? filtered[0] : null;

  const movieShareInsight = useMemo(() => {
    if (mode !== "movies" || movieShareSeries.series.length === 0) return "";
    const leader = movieShareSeries.series.map((item) => ({ name: item.name, avgShare: item.points.reduce((sum, point) => sum + point.share, 0) / (item.points.length || 1) })).sort((a, b) => b.avgShare - a.avgShare)[0];
    return `${leader.name} has the largest smoothed share in this view; click a color band or legend item to isolate a genre.`;
  }, [mode, movieShareSeries]);

  const ratingDistributionInsight = useMemo(() => {
    if (mode !== "movies") return "";
    const withData = movieRatingDistributions.filter((item) => item.count > 0);
    if (withData.length === 0) return "";
    const highestMedian = [...withData].sort((a, b) => b.median - a.median)[0];
    const widestSpread = [...withData].sort((a, b) => (b.q3 - b.q1) - (a.q3 - a.q1))[0];
    return `${highestMedian.decade} has the highest median rating, while ${widestSpread.decade} shows the widest middle spread. Click a decade to filter.`;
  }, [mode, movieRatingDistributions]);

  const genreRatingInsight = useMemo(() => {
    if (mode !== "movies" || genreRatingPoints.length === 0) return "";
    const top = genreRatingPoints[0];
    return `${top.genre} leads this sampled set by average rating; bar length is rating, while the right label shows sample size.`;
  }, [mode, genreRatingPoints]);

  const releaseYearInsight = useMemo(() => {
    if (mode !== "movies") return "";
    const excluded = filtered.length - ratedMoviesForCharts.length;
    return excluded > 0
      ? `${excluded.toLocaleString()} unrated or zero-rated sampled movies are hidden here so missing ratings do not flatten the plot. Click a point to isolate that title.`
      : "Every sampled movie in this view has a usable rating; click a point to isolate that title.";
  }, [filtered.length, mode, ratedMoviesForCharts.length]);

  const movieDetailMode = mode === "movies" && searchQuery.trim() && filtered.length > 0 && filtered.length <= 5;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: "clamp(16px, 4vw, 24px)" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, color: "#fff" }}>Pop Culture</h1>
          <span style={{ fontSize: 32, fontWeight: 300, color: "#4a9edd" }}>Archive</span>
        </div>
        <p style={{ margin: "6px 0 0", color: "#8b8ba3", fontSize: 13 }}>TMDB movies and Billboard Hot 100 chart history</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["home", "movies", "songs"].map((item) => (
          <button key={item} onClick={() => { setMode(item); setSelectedGenre("all"); setSearchQuery(""); }}
            style={{ padding: "8px 20px", borderRadius: 999, border: "1px solid", borderColor: mode === item ? "#4a9edd" : "#2a2a4a", background: mode === item ? "#4a9edd22" : "transparent", color: mode === item ? "#82c7f5" : "#9a9ab4", cursor: "pointer", fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>
            {item}
          </button>
        ))}
      </div>

      {loadState === "loading" && <div style={{ color: "#9a9ab4", marginBottom: 24 }}>Loading TMDB movies and Billboard CSV data...</div>}
      {loadState === "error" && <div style={{ color: "#f06a5f", marginBottom: 24 }}>Could not load TMDB movies or Billboard CSV data.</div>}

      {mode === "home" ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
            <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
              <div style={{ fontSize: 12, color: "#9a9ab4", textTransform: "uppercase", marginBottom: 8 }}>Movies</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#fff" }}>{(allMovieTotal || movies.length).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "#82c7f5", marginTop: 6 }}>TMDB catalog total / {movies.length.toLocaleString()} sampled records</div>
            </div>
            <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
              <div style={{ fontSize: 12, color: "#9a9ab4", textTransform: "uppercase", marginBottom: 8 }}>Songs</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#fff" }}>{songs.length.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "#ff9cc1", marginTop: 6 }}>Billboard Hot 100 entries loaded</div>
            </div>
          </div>
          <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20, marginBottom: 28 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Top rated #1 movie for each year</h3>
            {homeYearlyTopMovies.length === 0
              ? <div style={{ color: "#666680", fontSize: 13 }}>No movie data loaded yet.</div>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 14 }}>
                  {homeYearlyTopMovies.map((movie) => (
                    <HomeMovieCard key={`${movie.title}-${movie.year}`} movie={movie} label={movie.year} 
                    onClick={() => {
                      setMode("movies");
                      setSelectedGenre("all");
                      setSearchQuery(movie.title);
                  }}
                />
              ))}
                </div>}
          </div>
          <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Top 10 songs</h3>
            {homeTopSongs.length === 0
              ? <div style={{ color: "#666680", fontSize: 13 }}>No song data loaded yet.</div>
              : homeTopSongs.map((song) => <SearchResult key={`home-song-${song.title}-${song.artist}-${song.year}`} item={song} mode="songs" />)}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
            <input type="text" placeholder={`Search ${mode}...`} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)}
              style={{ background: "#17172b", border: "1px solid #2a2a4a", borderRadius: 8, padding: "8px 14px", color: "#fff", fontSize: 13, minWidth: 220 }} />
            <select value={selectedGenre} onChange={(event) => setSelectedGenre(event.target.value)}
              style={{ background: "#17172b", border: "1px solid #2a2a4a", borderRadius: 8, padding: "8px 14px", color: "#fff", fontSize: 13 }}>
              <option value="all">All genres</option>
              {allGenres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#17172b", border: "1px solid #2a2a4a", borderRadius: 8, padding: "8px 14px", boxSizing: "border-box", maxWidth: "100%" }}>
              <style>{`.slider-input{pointer-events:none;-webkit-appearance:none;appearance:none;background:transparent;width:100%}.slider-input::-webkit-slider-thumb{pointer-events:auto;-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#4a9edd;cursor:pointer}.slider-input::-moz-range-thumb{pointer-events:auto;width:14px;height:14px;border-radius:50%;background:#4a9edd;cursor:pointer}`}</style>
              <select value={yearRange[0]} onChange={(e) => setYearRange([Number(e.target.value), Math.max(Number(e.target.value), yearRange[1])])} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 13, width: 60 }}>
                {YEAR_OPTIONS.map(y => <option key={y} value={y} style={{ background: "#17172b" }}>{y}</option>)}
              </select>
              <div style={{ position: "relative", width: 150, height: 20 }}>
                {(() => {
                  const min = TMDB_MOVIE_START_YEAR; const max = TMDB_MOVIE_END_YEAR; const range = max - min;
                  const left = ((yearRange[0] - min) / range) * 100; const right = ((yearRange[1] - min) / range) * 100;
                  return <div style={{ position: "absolute", top: 10, left: 0, right: 0, height: 4, borderRadius: 2, background: `linear-gradient(to right, #343452 ${left}%, #fff ${left}%, #fff ${right}%, #343452 ${right}%)` }} />;
                })()}
                <input type="range" className="slider-input" min={TMDB_MOVIE_START_YEAR} max={TMDB_MOVIE_END_YEAR} value={yearRange[0]} onChange={(e) => setYearRange([Math.min(Number(e.target.value), yearRange[1]), yearRange[1]])} style={{ position: "absolute", top: 5 }} />
                <input type="range" className="slider-input" min={TMDB_MOVIE_START_YEAR} max={TMDB_MOVIE_END_YEAR} value={yearRange[1]} onChange={(e) => setYearRange([yearRange[0], Math.max(Number(e.target.value), yearRange[0])])} style={{ position: "absolute", top: 5 }} />
              </div>
              <select value={yearRange[1]} onChange={(e) => setYearRange([Math.min(yearRange[0], Number(e.target.value)), Number(e.target.value)])} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 13, width: 60 }}>
                {YEAR_OPTIONS.map(y => <option key={y} value={y} style={{ background: "#17172b" }}>{y}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
            {["all", ...DECADES].map((decade) => (
              <button key={decade} onClick={() => { setSelectedDecade(decade); if (decade === "all") { setYearRange([TMDB_MOVIE_START_YEAR, TMDB_MOVIE_END_YEAR]); } else { setYearRange(DECADE_RANGE[decade]); } }}
                style={{ padding: "5px 14px", borderRadius: 999, border: "1px solid", borderColor: selectedDecade === decade ? "#e85d8e" : "#2a2a4a", background: selectedDecade === decade ? "#e85d8e22" : "transparent", color: selectedDecade === decade ? "#ff9cc1" : "#9a9ab4", cursor: "pointer", fontSize: 12 }}>
                {decade === "all" ? "All time" : decade}
              </button>
            ))}
          </div>

          {/* FROM FRIEND: songMatch detail cards + avgRating */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
            {songMatch ? (
              <>
                <StatCard label="Artist" value={songMatch.artist} fontSize={20} />
                <StatCard label="Genre" value={songMatch.genre} fontSize={20} />
                <StatCard label="Total charting weeks" value={(songMatch.historicalStats?.totalWeeks || songMatch.weeks).toLocaleString()} fontSize={20} />
                <StatCard label="Charted years" value={songMatch.years?.join(", ") || songMatch.year} fontSize={20} />
              </>
            ) : (
              <>
                <StatCard label={`Total ${mode}`} value={(mode === "movies" ? visibleMovieTotal : filtered.length).toLocaleString()} sub={mode === "movies" ? `${filtered.length.toLocaleString()} sampled records loaded` : `of ${data.length.toLocaleString()} loaded`} fontSize={20} />
                {mode === "movies" && ratingTrendPoints.length > 1 && <RatingSparklineCard points={ratingTrendPoints} />}
                {mode === "songs" && <StatCard label="Total chart weeks" value={totalWeeks.toLocaleString()} fontSize={20} />}
                {topItem && (
                  mode === "movies"
                    ? <TopRatedGenresCard items={topRatedPerGenre} />
                    : <StatCard label="Longest charting" value={<div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }} title={topItem.title}>{topItem.title}</div>} sub={`${topItem.historicalStats?.totalWeeks || topItem.weeks} total weeks`} fontSize={20} />
                )}
                {mode === "movies" && <StatCard label="Avg rating" value={`★ ${avgRating}`} fontSize={20} />}
                <StatCard label={mode === "movies" ? "Genres" : "Source"} value={mode === "movies" ? allGenres.length : "Billboard"} fontSize={20} />
              </>
            )}
          </div>

          {movieDetailMode ? (
            <MovieSearchDetailView movies={filtered} allMovies={movies} onMovieSelect={(movie) => setSearchQuery(movie.title)} />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 20, marginBottom: 28 }}>
                <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>
                    {mode === "movies" ? "Genre share over time" : "Hot 100 songs by year"}
                    <span style={{ color: "#82c7f5", marginLeft: 8 }}>{activeYearStart === activeYearEnd ? activeYearStart : `${activeYearStart}-${activeYearEnd}`}</span>
                  </h3>
                  {mode === "movies"
                    ? movieShareSeries.series.length === 0
                      ? <div style={{ color: "#666680", fontSize: 13 }}>No data for selection</div>
                      : <><InsightText>{movieShareInsight}</InsightText><GenreShareAreaChart series={movieShareSeries.series} years={movieShareSeries.years} activeGenre={selectedGenre} onGenreSelect={setSelectedGenre} /></>
                    : chartSeries.series.length === 0
                      ? <div style={{ color: "#666680", fontSize: 13 }}>No data for selection</div>
                      : <GenreStackedAreaChart series={chartSeries.series} xLabel="Year" />}
                </div>
                <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20, display: "flex", flexDirection: "column" }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>{mode === "movies" ? "Rating distribution by decade" : "By decade"}</h3>
                  {mode === "movies"
                    ? <><InsightText>{ratingDistributionInsight}</InsightText><RatingDistributionChart distributions={movieRatingDistributions} selectedDecade={selectedDecade} onDecadeSelect={setSelectedDecade} /></>
                    : <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: 8, flex: "1 1 auto", minHeight: 250, alignItems: "stretch", overflow: "hidden" }}>
                        {decadeCounts.map(({ decade, count }) => <TimelineBar key={decade} decade={decade} count={count} max={maxDecadeCount} mode={mode} />)}
                      </div>}
                </div>
              </div>

              {mode === "movies" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 20, marginBottom: 28 }}>
                    <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
                      <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Genre average rating</h3>
                      {genreRatingPoints.length === 0
                        ? <div style={{ color: "#666680", fontSize: 13 }}>No data for selection</div>
                        : <><InsightText>{genreRatingInsight}</InsightText><GenreRatingBarChart points={genreRatingPoints} activeGenre={selectedGenre} onGenreSelect={setSelectedGenre} /></>}
                    </div>
                    <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
                      <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Decades at a glance</h3>
                      <DecadesAtAGlance items={decadesAtAGlance} />
                    </div>
                  </div>
                  <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20, marginBottom: 28 }}>
                    <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Rating vs release year</h3>
                    {ratedMoviesForCharts.length === 0
                      ? <div style={{ color: "#666680", fontSize: 13 }}>No data for selection</div>
                      : <><InsightText>{releaseYearInsight}</InsightText><RatingYearScatterPlot movies={ratedMoviesForCharts} onMovieSelect={(movie) => setSearchQuery(movie.title)} /></>}
                  </div>
                </>
              )}

              <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>{mode === "movies" ? "Top 10 movies" : "Top 10 songs"}</h3>
                  {mode === "songs" && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={removeChristmasSongs} onChange={(e) => setRemoveChristmasSongs(e.target.checked)} />
                      Hide Christmas
                    </label>
                  )}
                </div>
                {mode === "songs" && filtered.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <SongPerformanceChart songs={filtered} yearStart={activeYearStart} yearEnd={activeYearEnd} />
                  </div>
                )}
                {filtered.length === 0
                  ? <div style={{ color: "#666680", fontSize: 13 }}>No results match your filters.</div>
                  : topResults.map((item) => <SearchResult key={`${mode}-${item.title}-${item.artist || item.year}`} item={item} mode={mode} />)}
                {/* FROM FRIEND: Load more / Show less buttons */}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  {filtered.length > displayLimit && (
                    <button onClick={() => setDisplayLimit(limit => limit + RESULT_LIMIT)}
                      style={{ background: "#2a2a4a", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                      Load more
                    </button>
                  )}
                  {displayLimit > RESULT_LIMIT && (
                    <button onClick={() => setDisplayLimit(limit => Math.max(RESULT_LIMIT, limit - RESULT_LIMIT))}
                      style={{ background: "#2a2a4a", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                      Show less
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
