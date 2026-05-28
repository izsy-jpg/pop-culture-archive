import { useState, useMemo } from "react";

// ─── Mock data (replace with real CSVs via Papa.parse) ───────────────────────
const MOCK_MOVIES = [
  { title: "Pulp Fiction", year: 1994, genre: "Crime", rating: 8.9, votes: 2100000, revenue: 214 },
  { title: "The Lion King", year: 1994, genre: "Animation", rating: 8.5, votes: 1050000, revenue: 763 },
  { title: "Forrest Gump", year: 1994, genre: "Drama", rating: 8.8, votes: 2200000, revenue: 678 },
  { title: "Titanic", year: 1997, genre: "Romance", rating: 7.9, votes: 1200000, revenue: 2187 },
  { title: "The Matrix", year: 1999, genre: "Sci-Fi", rating: 8.7, votes: 1900000, revenue: 467 },
  { title: "Gladiator", year: 2000, genre: "Action", rating: 8.5, votes: 1500000, revenue: 460 },
  { title: "Spirited Away", year: 2001, genre: "Animation", rating: 8.6, votes: 750000, revenue: 395 },
  { title: "The Dark Knight", year: 2008, genre: "Action", rating: 9.0, votes: 2800000, revenue: 1004 },
  { title: "Inception", year: 2010, genre: "Sci-Fi", rating: 8.8, votes: 2400000, revenue: 836 },
  { title: "Parasite", year: 2019, genre: "Drama", rating: 8.5, votes: 850000, revenue: 258 },
  { title: "Avengers: Endgame", year: 2019, genre: "Action", rating: 8.4, votes: 1100000, revenue: 2797 },
  { title: "Get Out", year: 2017, genre: "Horror", rating: 7.7, votes: 620000, revenue: 176 },
  { title: "La La Land", year: 2016, genre: "Musical", rating: 8.0, votes: 510000, revenue: 449 },
  { title: "Mad Max: Fury Road", year: 2015, genre: "Action", rating: 8.1, votes: 1000000, revenue: 378 },
  { title: "Her", year: 2013, genre: "Drama", rating: 8.0, votes: 630000, revenue: 48 },
];

const MOCK_SONGS = [
  { title: "Like a Prayer", artist: "Madonna", year: 1989, weeks: 6, genre: "Pop" },
  { title: "Smells Like Teen Spirit", artist: "Nirvana", year: 1991, weeks: 12, genre: "Rock" },
  { title: "I Will Always Love You", artist: "Whitney Houston", year: 1992, weeks: 14, genre: "R&B" },
  { title: "Gangsta's Paradise", artist: "Coolio", year: 1995, weeks: 15, genre: "Hip-Hop" },
  { title: "...Baby One More Time", artist: "Britney Spears", year: 1999, weeks: 10, genre: "Pop" },
  { title: "Lose Yourself", artist: "Eminem", year: 2002, weeks: 12, genre: "Hip-Hop" },
  { title: "Crazy in Love", artist: "Beyoncé", year: 2003, weeks: 8, genre: "R&B" },
  { title: "Rehab", artist: "Amy Winehouse", year: 2007, weeks: 9, genre: "Soul" },
  { title: "Blinding Lights", artist: "The Weeknd", year: 2020, weeks: 57, genre: "Pop" },
  { title: "Shape of You", artist: "Ed Sheeran", year: 2017, weeks: 33, genre: "Pop" },
  { title: "Old Town Road", artist: "Lil Nas X", year: 2019, weeks: 19, genre: "Country-Rap" },
  { title: "God's Plan", artist: "Drake", year: 2018, weeks: 11, genre: "Hip-Hop" },
  { title: "Despacito", artist: "Luis Fonsi", year: 2017, weeks: 16, genre: "Latin" },
  { title: "Happy", artist: "Pharrell Williams", year: 2014, weeks: 24, genre: "Pop" },
  { title: "Rolling in the Deep", artist: "Adele", year: 2011, weeks: 7, genre: "Soul" },
];

const DECADES = ["1980s", "1990s", "2000s", "2010s", "2020s"];
const DECADE_RANGE = { "1980s": [1980,1989], "1990s": [1990,1999], "2000s": [2000,2009], "2010s": [2010,2019], "2020s": [2020,2026] };

const GENRE_COLORS = {
  Action: "#e85d4a", Animation: "#7c6fcd", Drama: "#4a9edd", "Sci-Fi": "#3dbfa8",
  Crime: "#e8943a", Romance: "#e85d8e", Horror: "#8e5de8", Musical: "#5dc47a",
  Pop: "#e85d8e", "Hip-Hop": "#e8943a", "R&B": "#7c6fcd", Rock: "#e85d4a",
  Soul: "#3dbfa8", Latin: "#5dc47a", "Country-Rap": "#4a9edd",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 12,
      padding: "16px 20px", minWidth: 140,
    }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#4ade80", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function GenreBar({ genre, count, max, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ width: 80, fontSize: 12, color: "#aaa", textAlign: "right" }}>{genre}</div>
      <div style={{ flex: 1, background: "#1a1a2e", borderRadius: 4, height: 20, overflow: "hidden" }}>
        <div style={{
          width: `${(count / max) * 100}%`, height: "100%",
          background: color || "#4a9edd", borderRadius: 4,
          transition: "width 0.5s ease",
          display: "flex", alignItems: "center", paddingLeft: 8,
        }}>
          <span style={{ fontSize: 11, color: "#fff", whiteSpace: "nowrap" }}>{count}</span>
        </div>
      </div>
    </div>
  );
}

function TimelineBar({ decade, count, max, mode }) {
  const h = Math.max(8, (count / max) * 140);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ fontSize: 12, color: "#888" }}>{count}</div>
      <div style={{
        width: 44, height: h, borderRadius: "6px 6px 0 0",
        background: mode === "movies" ? "#4a9edd" : "#e85d8e",
        transition: "height 0.5s ease",
      }} />
      <div style={{ fontSize: 11, color: "#aaa", textAlign: "center", lineHeight: 1.3 }}>{decade}</div>
    </div>
  );
}

function SearchResult({ item, mode }) {
  if (mode === "movies") {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 0", borderBottom: "1px solid #1a1a2e" }}>
        <div>
          <div style={{ fontWeight: 600, color: "#fff" }}>{item.title}</div>
          <div style={{ fontSize: 12, color: "#888" }}>{item.year} · {item.genre}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#fbbf24", fontWeight: 600 }}>★ {item.rating}</div>
          <div style={{ fontSize: 12, color: "#888" }}>${item.revenue}M</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: "1px solid #1a1a2e" }}>
      <div>
        <div style={{ fontWeight: 600, color: "#fff" }}>{item.title}</div>
        <div style={{ fontSize: 12, color: "#888" }}>{item.artist} · {item.year} · {item.genre}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: "#e85d8e", fontWeight: 600 }}>{item.weeks} wks</div>
        <div style={{ fontSize: 11, color: "#888" }}>on chart</div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function PopCultureArchive() {
  const [mode, setMode] = useState("movies");
  const [selectedDecade, setSelectedDecade] = useState("all");
  const [selectedGenre, setSelectedGenre] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [yearRange, setYearRange] = useState([1980, 2026]);

  const data = mode === "movies" ? MOCK_MOVIES : MOCK_SONGS;

  // Filter pipeline
  const filtered = useMemo(() => {
    return data.filter(item => {
      const y = item.year;
      if (y < yearRange[0] || y > yearRange[1]) return false;
      if (selectedDecade !== "all") {
        const [lo, hi] = DECADE_RANGE[selectedDecade];
        if (y < lo || y > hi) return false;
      }
      if (selectedGenre !== "all" && item.genre !== selectedGenre) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const title = item.title.toLowerCase();
        const artist = (item.artist || "").toLowerCase();
        const genre = item.genre.toLowerCase();
        if (!title.includes(q) && !artist.includes(q) && !genre.includes(q)) return false;
      }
      return true;
    });
  }, [data, yearRange, selectedDecade, selectedGenre, searchQuery, mode]);

  // Genre counts
  const genreCounts = useMemo(() => {
    const counts = {};
    filtered.forEach(item => { counts[item.genre] = (counts[item.genre] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filtered]);

  const maxGenreCount = genreCounts[0]?.[1] || 1;

  // Decade counts
  const decadeCounts = useMemo(() => {
    return DECADES.map(dec => {
      const [lo, hi] = DECADE_RANGE[dec];
      return { decade: dec, count: filtered.filter(i => i.year >= lo && i.year <= hi).length };
    });
  }, [filtered]);
  const maxDecadeCount = Math.max(...decadeCounts.map(d => d.count), 1);

  // Genres list
  const allGenres = [...new Set(data.map(i => i.genre))].sort();

  // Stats
  const topItem = mode === "movies"
    ? filtered.sort((a, b) => b.rating - a.rating)[0]
    : filtered.sort((a, b) => b.weeks - a.weeks)[0];

  const avgRating = mode === "movies"
    ? (filtered.reduce((s, i) => s + i.rating, 0) / (filtered.length || 1)).toFixed(1)
    : null;

  const totalWeeks = mode === "songs"
    ? filtered.reduce((s, i) => s + i.weeks, 0)
    : null;

  return (
    <div style={{
      minHeight: "100vh", background: "#0d0d1a", color: "#e0e0e0",
      fontFamily: "'Segoe UI', system-ui, sans-serif", padding: "24px",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, color: "#fff", letterSpacing: -1 }}>
            Pop Culture
          </h1>
          <span style={{ fontSize: 32, fontWeight: 300, color: "#4a9edd" }}>Archive</span>
        </div>
        <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>
          The pop culture shift across time · 1980 – 2026
        </p>
      </div>

      {/* Mode Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["movies", "songs"].map(m => (
          <button key={m} onClick={() => { setMode(m); setSelectedGenre("all"); setSearchQuery(""); }}
            style={{
              padding: "8px 20px", borderRadius: 20, border: "1px solid",
              borderColor: mode === m ? "#4a9edd" : "#2a2a4a",
              background: mode === m ? "#4a9edd22" : "transparent",
              color: mode === m ? "#4a9edd" : "#888",
              cursor: "pointer", fontSize: 13, fontWeight: 500, textTransform: "capitalize",
            }}>
            {m === "movies" ? "🎬" : "🎵"} {m}
          </button>
        ))}
      </div>

      {/* Controls Row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {/* Search */}
        <input
          type="text"
          placeholder={`Search ${mode}...`}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8,
            padding: "8px 14px", color: "#fff", fontSize: 13, minWidth: 200,
          }}
        />
        {/* Genre filter */}
        <select value={selectedGenre} onChange={e => setSelectedGenre(e.target.value)}
          style={{
            background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8,
            padding: "8px 14px", color: "#fff", fontSize: 13,
          }}>
          <option value="all">All genres</option>
          {allGenres.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {/* Year range */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#888" }}>From</span>
          <input type="range" min={1980} max={2020} value={yearRange[0]}
            onChange={e => setYearRange([+e.target.value, yearRange[1]])}
            style={{ width: 100 }} />
          <span style={{ fontSize: 13, color: "#4a9edd", minWidth: 36 }}>{yearRange[0]}</span>
          <span style={{ fontSize: 12, color: "#888" }}>to</span>
          <input type="range" min={1985} max={2026} value={yearRange[1]}
            onChange={e => setYearRange([yearRange[0], +e.target.value])}
            style={{ width: 100 }} />
          <span style={{ fontSize: 13, color: "#4a9edd", minWidth: 36 }}>{yearRange[1]}</span>
        </div>
      </div>

      {/* Decade Pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        {["all", ...DECADES].map(d => (
          <button key={d} onClick={() => setSelectedDecade(d)}
            style={{
              padding: "5px 14px", borderRadius: 20, border: "1px solid",
              borderColor: selectedDecade === d ? "#e85d8e" : "#2a2a4a",
              background: selectedDecade === d ? "#e85d8e22" : "transparent",
              color: selectedDecade === d ? "#e85d8e" : "#888",
              cursor: "pointer", fontSize: 12,
            }}>
            {d === "all" ? "All time" : d}
          </button>
        ))}
      </div>

      {/* Stats Row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        <StatCard label={`Total ${mode}`} value={filtered.length} sub={`of ${data.length} total`} />
        {mode === "movies" && <StatCard label="Avg rating" value={`★ ${avgRating}`} />}
        {mode === "songs" && <StatCard label="Total chart weeks" value={totalWeeks} />}
        {topItem && (
          <StatCard
            label={mode === "movies" ? "Top rated" : "Longest charting"}
            value={topItem.title.length > 18 ? topItem.title.slice(0, 18) + "…" : topItem.title}
            sub={mode === "movies" ? `★ ${topItem.rating}` : `${topItem.weeks} weeks`}
          />
        )}
        <StatCard label="Genres" value={genreCounts.length} />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        {/* Genre Distribution */}
        <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>
            Top genres
          </h3>
          {genreCounts.length === 0
            ? <div style={{ color: "#555", fontSize: 13 }}>No data for selection</div>
            : genreCounts.map(([genre, count]) => (
              <GenreBar key={genre} genre={genre} count={count} max={maxGenreCount}
                color={GENRE_COLORS[genre] || "#4a9edd"} />
            ))}
        </div>

        {/* Decade Timeline */}
        <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>
            By decade
          </h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 180, paddingTop: 20 }}>
            {decadeCounts.map(({ decade, count }) => (
              <TimelineBar key={decade} decade={decade} count={count} max={maxDecadeCount} mode={mode} />
            ))}
          </div>
        </div>
      </div>

      {/* Results List */}
      <div style={{ background: "#111126", border: "1px solid #2a2a4a", borderRadius: 14, padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </h3>
        {filtered.length === 0
          ? <div style={{ color: "#555", fontSize: 13 }}>No results match your filters.</div>
          : filtered.slice(0, 12).map((item, i) => (
            <SearchResult key={i} item={item} mode={mode} />
          ))}
        {filtered.length > 12 && (
          <div style={{ paddingTop: 12, fontSize: 12, color: "#555" }}>
            Showing 12 of {filtered.length} — refine filters to narrow results
          </div>
        )}
      </div>

      {/* Footer note */}
      <p style={{ marginTop: 24, fontSize: 11, color: "#444", textAlign: "center" }}>
        📌 Replace MOCK_MOVIES / MOCK_SONGS with real CSV data via Papa.parse · Add D3.js scatter plot & correlation view next
      </p>
    </div>
  );
}
