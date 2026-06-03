import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

const DECADES = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
const DECADE_RANGE = {
  "1950s": [1950, 1959],
  "1960s": [1960, 1969],
  "1970s": [1970, 1979],
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
const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || "71790251f947beef32f979fe5ba1c0fe";
const TMDB_MOVIE_START_YEAR = 1958;
const TMDB_MOVIE_END_YEAR = 2026;
const TMDB_MOVIE_PAGES_PER_YEAR = 1;
const YEAR_OPTIONS = Array.from({ length: TMDB_MOVIE_END_YEAR - TMDB_MOVIE_START_YEAR + 1 }, (_, index) => TMDB_MOVIE_START_YEAR + index);
const BILLBOARD_DATASET_URLS = Object.values(import.meta.glob("../dataset/billboard/*.csv", {
  eager: true,
  query: "?url",
  import: "default",
})).sort();

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

  moviePages
    .forEach(({ year, data }) => {
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

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: "#17172b",
      border: "1px solid #2a2a4a",
      borderRadius: 8,
      padding: "16px 18px",
      minWidth: 150,
    }}>
      <div style={{ fontSize: 12, color: "#9a9ab4", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{value}</div>
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

function GenreLineChart({ series, years, xLabel, yLabel }) {
  const width = 720;
  const height = 320;
  const margin = { top: 18, right: 28, bottom: 66, left: 78 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const rawMaxCount = Math.max(...series.flatMap((item) => item.points.map((point) => point.count)), 1);
  const maxCount = niceMax(rawMaxCount);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const yearSpan = Math.max(maxYear - minYear, 1);
  const yTicks = Array.from({ length: 6 }, (_, index) => (maxCount / 5) * index);
  const xTicks = [...new Set([minYear, Math.round((minYear + maxYear) / 2), maxYear])];

  const x = (year) => margin.left + ((year - minYear) / yearSpan) * innerWidth;
  const y = (count) => margin.top + innerHeight - (count / maxCount) * innerHeight;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: "100%", height: "auto", display: "block" }}>
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + innerHeight} stroke="#343452" />
        <line x1={margin.left} y1={margin.top + innerHeight} x2={margin.left + innerWidth} y2={margin.top + innerHeight} stroke="#343452" />
        {yTicks.map((tickValue) => {
          const tickY = y(tickValue);
          return (
            <g key={tickValue}>
              <line x1={margin.left} y1={tickY} x2={margin.left + innerWidth} y2={tickY} stroke="#20203a" />
              <text x={margin.left - 10} y={tickY + 4} textAnchor="end" fill="#8b8ba3" fontSize="11">{Math.round(tickValue).toLocaleString()}</text>
            </g>
          );
        })}
        {xTicks.map((year) => (
          <text key={year} x={x(year)} y={height - 36} textAnchor="middle" fill="#8b8ba3" fontSize="11">{year}</text>
        ))}
        <text x={margin.left + innerWidth / 2} y={height - 12} textAnchor="middle" fill="#c6c6d8" fontSize="12" fontWeight="600">{xLabel}</text>
        <text
          x={18}
          y={margin.top + innerHeight / 2}
          textAnchor="middle"
          fill="#c6c6d8"
          fontSize="12"
          fontWeight="600"
          transform={`rotate(-90 18 ${margin.top + innerHeight / 2})`}
        >
          {yLabel}
        </text>
        {series.map((item, index) => {
          const points = item.points.map((point) => `${x(point.year)},${y(point.count)}`).join(" ");
          const color = COLORS[index % COLORS.length];
          return (
            <g key={item.name}>
              <polyline points={points} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
              {item.points.map((point) => (
                <circle key={`${item.name}-${point.year}`} cx={x(point.year)} cy={y(point.count)} r="2.4" fill={color}>
                  <title>{`${item.name}, ${point.year}: ${point.count.toLocaleString()}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        {series.map((item, index) => (
          <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#c6c6d8" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[index % COLORS.length] }} />
            {item.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchResult({ item, mode }) {
  const detail = mode === "movies"
    ? `${item.year} / ${(item.genres || [item.genre]).join(", ")}`
    : `${item.artist} / ${item.year} / ${item.genre}`;
  const metric = mode === "movies" ? `★ ${item.rating.toFixed(1)}` : `${item.weeks} wks`;
  const subMetric = mode === "movies"
    ? `${item.votes.toLocaleString()} IMDb votes`
    : `${item.appearances.toLocaleString()} chart appearances`;

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 16,
      padding: "11px 0",
      borderBottom: "1px solid #20203a",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 650, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
        <div style={{ fontSize: 12, color: "#9a9ab4", marginTop: 3 }}>{detail}</div>
      </div>
      <div style={{ textAlign: "right", flex: "0 0 auto" }}>
        <div style={{ color: mode === "movies" ? "#f4c430" : "#e85d8e", fontWeight: 700 }}>{metric}</div>
        <div style={{ fontSize: 11, color: "#9a9ab4" }}>{subMetric}</div>
      </div>
    </div>
  );
}

function HomeMovieCard({ movie, rank }) {
  const posterUrl = movie.posterPath ? `${TMDB_IMAGE_BASE}${movie.posterPath}` : "";

  return (
    <div style={{ background: "#17172b", border: "1px solid #2a2a4a", borderRadius: 8, overflow: "hidden", minWidth: 0 }}>
      {posterUrl
        ? <img src={posterUrl} alt={`${movie.title} poster`} style={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover", display: "block" }} />
        : (
          <div style={{ aspectRatio: "2 / 3", display: "grid", placeItems: "center", background: "#20203a", color: "#8b8ba3", fontSize: 12 }}>
            No poster
          </div>
        )}
      <div style={{ padding: 10 }}>
        <div style={{ fontSize: 11, color: "#82c7f5", marginBottom: 4 }}>#{rank} / {movie.year}</div>
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

export default function PopCultureArchive() {
  const [mode, setMode] = useState("home");
  const [selectedDecade, setSelectedDecade] = useState("all");
  const [selectedGenre, setSelectedGenre] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [yearRange, setYearRange] = useState([1958, 2026]);
  const [movies, setMovies] = useState([]);
  const [allMovieTotal, setAllMovieTotal] = useState(0);
  const [movieYearTotals, setMovieYearTotals] = useState({});
  const [songs, setSongs] = useState([]);
  const [movieGenreYears, setMovieGenreYears] = useState([]);
  const [loadState, setLoadState] = useState("loading");

  useEffect(() => {
    async function loadData() {
      try {
        const [movieData, billboardRowsByYear] = await Promise.all([
          fetchTmdbMovies(),
          Promise.all(BILLBOARD_DATASET_URLS.map((url) => parseCsv(url))),
        ]);
        const normalizedMovies = movieData.movies;
        const normalizedSongs = billboardRowsByYear.flat().map(normalizeSong).filter(Boolean);

        setMovies(normalizedMovies);
        setAllMovieTotal(movieData.allMovieTotal);
        setMovieYearTotals(movieData.yearTotals);
        setSongs(normalizedSongs);
        setMovieGenreYears(buildMovieGenreYears(normalizedMovies));
        setLoadState("ready");
      } catch (error) {
        console.error(error);
        setLoadState("error");
      }
    }

    loadData();
  }, []);

  const data = mode === "songs" ? songs : movies;
  const [activeYearStart, activeYearEnd] = getFilteredYears(yearRange, selectedDecade);

  const allGenres = useMemo(() => {
    if (mode === "songs") return ["Billboard Hot 100"];
    return [...new Set(movieGenreYears.map((row) => row.genre))].sort();
  }, [mode, movieGenreYears]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return data.filter((item) => {
      if (item.year < activeYearStart || item.year > activeYearEnd) return false;
      if (mode === "movies" && selectedGenre !== "all" && !(item.genres || [item.genre]).includes(selectedGenre)) return false;
      if (q) {
        const searchable = [
          item.title,
          item.artist,
          item.director,
          item.genre,
          ...(item.genres || []),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [data, activeYearStart, activeYearEnd, selectedGenre, searchQuery, mode]);

  const chartSeries = useMemo(() => {
    const years = Array.from({ length: activeYearEnd - activeYearStart + 1 }, (_, index) => activeYearStart + index);

    if (mode === "songs") {
      const counts = new Map();
      filtered.forEach((song) => counts.set(song.year, (counts.get(song.year) || 0) + 1));
      return {
        years,
        series: [{
          name: "Billboard Hot 100",
          points: years.map((year) => ({ year, count: counts.get(year) || 0 })),
        }],
      };
    }

    const scopedRows = movieGenreYears.filter((row) => row.year >= activeYearStart && row.year <= activeYearEnd);
    const totals = new Map();
    scopedRows.forEach((row) => {
      if (selectedGenre !== "all" && row.genre !== selectedGenre) return;
      totals.set(row.genre, (totals.get(row.genre) || 0) + row.count);
    });
    const genres = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, selectedGenre === "all" ? 10 : 1)
      .map(([genre]) => genre);

    const rowMap = new Map(scopedRows.map((row) => [`${row.genre}|${row.year}`, row.count]));
    return {
      years,
      series: genres.map((genre) => ({
        name: genre,
        points: years.map((year) => ({ year, count: rowMap.get(`${genre}|${year}`) || 0 })),
      })),
    };
  }, [mode, filtered, movieGenreYears, activeYearStart, activeYearEnd, selectedGenre]);

  const decadeCounts = useMemo(() => {
    return DECADES.map((decade) => {
      const [lo, hi] = DECADE_RANGE[decade];
      if (mode === "movies") {
        let count = 0;
        for (let year = lo; year <= hi; year += 1) {
          count += movieYearTotals[year] || 0;
        }
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
    for (let year = activeYearStart; year <= activeYearEnd; year += 1) {
      count += movieYearTotals[year] || 0;
    }
    return count || filtered.length;
  }, [mode, hasMovieSubsetFilter, selectedDecade, activeYearStart, activeYearEnd, allMovieTotal, filtered.length, movieYearTotals]);

  const maxDecadeCount = Math.max(...decadeCounts.map((item) => item.count), 1);
  const topItem = mode === "movies"
    ? [...filtered].sort((a, b) => b.rating - a.rating || b.votes - a.votes)[0]
    : [...filtered].sort((a, b) => b.weeks - a.weeks || a.peak - b.peak)[0];
  const topResults = useMemo(() => {
    const sorted = mode === "movies"
      ? [...filtered].sort((a, b) => b.rating - a.rating || b.votes - a.votes)
      : [...filtered].sort((a, b) => b.weeks - a.weeks || a.peak - b.peak);
    return sorted.slice(0, RESULT_LIMIT);
  }, [filtered, mode]);
  const homeTopMovies = useMemo(() => {
    return [...movies]
      .sort((a, b) => b.rating - a.rating || b.votes - a.votes)
      .slice(0, RESULT_LIMIT);
  }, [movies]);
  const homeTopSongs = useMemo(() => {
    return [...songs]
      .sort((a, b) => b.weeks - a.weeks || a.title.localeCompare(b.title))
      .slice(0, RESULT_LIMIT);
  }, [songs]);
  const avgRating = mode === "movies"
    ? (filtered.reduce((sum, item) => sum + item.rating, 0) / (filtered.length || 1)).toFixed(1)
    : null;
  const totalWeeks = mode === "songs"
    ? filtered.reduce((sum, item) => sum + item.weeks, 0)
    : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d1a",
      color: "#e0e0e0",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      padding: "24px",
    }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, color: "#fff" }}>Pop Culture</h1>
          <span style={{ fontSize: 32, fontWeight: 300, color: "#4a9edd" }}>Archive</span>
        </div>
        <p style={{ margin: "6px 0 0", color: "#8b8ba3", fontSize: 13 }}>
          TMDB movies and Billboard Hot 100 chart history
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["home", "movies", "songs"].map((item) => (
          <button key={item} onClick={() => { setMode(item); setSelectedGenre("all"); setSearchQuery(""); }}
            style={{
              padding: "8px 20px",
              borderRadius: 999,
              border: "1px solid",
              borderColor: mode === item ? "#4a9edd" : "#2a2a4a",
              background: mode === item ? "#4a9edd22" : "transparent",
              color: mode === item ? "#82c7f5" : "#9a9ab4",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              textTransform: "capitalize",
            }}>
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
            <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Top 10 movies</h3>
            {homeTopMovies.length === 0
              ? <div style={{ color: "#666680", fontSize: 13 }}>No movie data loaded yet.</div>
              : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 14 }}>
                  {homeTopMovies.map((movie, index) => (
                    <HomeMovieCard key={`${movie.title}-${movie.year}-${index}`} movie={movie} rank={index + 1} />
                  ))}
                </div>
              )}
          </div>

          <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>Top 10 songs</h3>
            {homeTopSongs.length === 0
              ? <div style={{ color: "#666680", fontSize: 13 }}>No song data loaded yet.</div>
              : homeTopSongs.map((song) => (
                <SearchResult key={`home-song-${song.title}-${song.artist}-${song.year}`} item={song} mode="songs" />
              ))}
          </div>
        </div>
      ) : (
        <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <input
          type="text"
          placeholder={`Search ${mode}...`}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          style={{
            background: "#17172b",
            border: "1px solid #2a2a4a",
            borderRadius: 8,
            padding: "8px 14px",
            color: "#fff",
            fontSize: 13,
            minWidth: 220,
          }}
        />
        <select value={selectedGenre} onChange={(event) => setSelectedGenre(event.target.value)}
          disabled={mode === "songs"}
          style={{
            background: "#17172b",
            border: "1px solid #2a2a4a",
            borderRadius: 8,
            padding: "8px 14px",
            color: "#fff",
            fontSize: 13,
          }}>
          <option value="all">{mode === "movies" ? "All genres" : "No song genre column"}</option>
          {mode === "movies" && allGenres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
        </select>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "#9a9ab4", textTransform: "uppercase" }}>
          From year
          <select
            value={yearRange[0]}
            onChange={(event) => {
              const year = Number(event.target.value);
              setYearRange([year, Math.max(year, yearRange[1])]);
            }}
            style={{
              background: "#17172b",
              border: "1px solid #2a2a4a",
              borderRadius: 8,
              padding: "8px 14px",
              color: "#fff",
              fontSize: 13,
            }}>
            {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "#9a9ab4", textTransform: "uppercase" }}>
          To year
          <select
            value={yearRange[1]}
            onChange={(event) => {
              const year = Number(event.target.value);
              setYearRange([Math.min(yearRange[0], year), year]);
            }}
            style={{
              background: "#17172b",
              border: "1px solid #2a2a4a",
              borderRadius: 8,
              padding: "8px 14px",
              color: "#fff",
              fontSize: 13,
            }}>
            {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "#9a9ab4", textTransform: "uppercase" }}>
          Through year
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#8b8ba3", minWidth: 32, textAlign: "right", textTransform: "none" }}>{TMDB_MOVIE_START_YEAR}</span>
            <input
              type="range"
              min={TMDB_MOVIE_START_YEAR}
              max={TMDB_MOVIE_END_YEAR}
              value={yearRange[1]}
              onChange={(event) => {
                const year = Number(event.target.value);
                setYearRange([TMDB_MOVIE_START_YEAR, year]);
              }}
              style={{ width: 180 }}
              aria-label="Through year slider"
            />
            <span style={{ fontSize: 11, color: "#8b8ba3", minWidth: 32, textTransform: "none" }}>{TMDB_MOVIE_END_YEAR}</span>
            <span style={{ fontSize: 12, color: "#82c7f5", minWidth: 86, textTransform: "none" }}>{TMDB_MOVIE_START_YEAR}-{yearRange[1]}</span>
          </div>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        {["all", ...DECADES].map((decade) => (
          <button key={decade} onClick={() => setSelectedDecade(decade)}
            style={{
              padding: "5px 14px",
              borderRadius: 999,
              border: "1px solid",
              borderColor: selectedDecade === decade ? "#e85d8e" : "#2a2a4a",
              background: selectedDecade === decade ? "#e85d8e22" : "transparent",
              color: selectedDecade === decade ? "#ff9cc1" : "#9a9ab4",
              cursor: "pointer",
              fontSize: 12,
            }}>
            {decade === "all" ? "All time" : decade}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        <StatCard
          label={`Total ${mode}`}
          value={(mode === "movies" ? visibleMovieTotal : filtered.length).toLocaleString()}
          sub={mode === "movies"
            ? `${filtered.length.toLocaleString()} sampled records loaded`
            : `of ${data.length.toLocaleString()} loaded`}
        />
        {mode === "movies" && <StatCard label="Avg rating" value={`★ ${avgRating}`} />}
        {mode === "songs" && <StatCard label="Total chart weeks" value={totalWeeks.toLocaleString()} />}
        {topItem && (
          <StatCard
            label={mode === "movies" ? "Top rated" : "Longest charting"}
            value={topItem.title.length > 20 ? `${topItem.title.slice(0, 20)}...` : topItem.title}
            sub={mode === "movies" ? `${topItem.rating.toFixed(1)} rating` : `${topItem.weeks} weeks`}
          />
        )}
        <StatCard label={mode === "movies" ? "Genres" : "Source"} value={mode === "movies" ? allGenres.length : "Billboard"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.85fr)", gap: 20, marginBottom: 28 }}>
        <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>
            {mode === "movies" ? "Top 10 genre trend" : "Hot 100 songs by year"}
            <span style={{ color: "#82c7f5", marginLeft: 8 }}>
              {activeYearStart === activeYearEnd ? activeYearStart : `${activeYearStart}-${activeYearEnd}`}
            </span>
          </h3>
          {chartSeries.series.length === 0
            ? <div style={{ color: "#666680", fontSize: 13 }}>No data for selection</div>
            : (
              <GenreLineChart
                series={chartSeries.series}
                years={chartSeries.years}
                xLabel="Year"
                yLabel={mode === "movies" ? "Movies released" : "Songs first charted"}
              />
            )}
        </div>

        <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20, display: "flex", flexDirection: "column" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>
            By decade
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
            gap: 8,
            flex: "1 1 auto",
            minHeight: 250,
            alignItems: "stretch",
            overflow: "hidden",
          }}>
            {decadeCounts.map(({ decade, count }) => (
              <TimelineBar key={decade} decade={decade} count={count} max={maxDecadeCount} mode={mode} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 8, padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#9a9ab4", textTransform: "uppercase" }}>
          {mode === "movies" ? "Top 10 movies" : "Top 10 songs"}
        </h3>
        {filtered.length === 0
          ? <div style={{ color: "#666680", fontSize: 13 }}>No results match your filters.</div>
          : topResults.map((item) => (
            <SearchResult key={`${mode}-${item.title}-${item.artist || item.year}`} item={item} mode={mode} />
          ))}
        {filtered.length > RESULT_LIMIT && (
          <div style={{ paddingTop: 12, fontSize: 12, color: "#666680" }}>
            Showing top {RESULT_LIMIT} of {filtered.length.toLocaleString()} results
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
