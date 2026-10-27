import { useEffect, useState } from "react";
import { api } from "../api.js";
import Plot, { baseLayout, plotConfig } from "../components/Plot.jsx";

// Drivers' or constructors' championship for a season: the table after the latest race,
// and a chart of points race by race. Data: official standings from OpenF1, stored per race.
const COPY = {
  drivers: { eyebrow: "Championship", title: "Driver standings", who: "Driver" },
  constructors: { eyebrow: "Championship", title: "Constructors' championship", who: "Team" },
};

function fmtPoints(p) {
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
}

function Headshot({ src, code }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="st-photo st-photo--empty" aria-hidden>{code}</span>;
  const sharp = src.replace(/\.transform\/[\w-]+\//, ".transform/2col/");
  return <img className="st-photo" src={sharp} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function Progression({ data }) {
  const rounds = data.rounds.map((r) => `R${r.round}`);
  const names = data.rounds.map((r) => r.name);
  const top = data.rows.slice(0, data.kind === "drivers" ? 10 : 10);
  const traces = top.map((row, i) => ({
    x: rounds,
    y: row.progression,
    customdata: names,
    name: data.kind === "drivers" ? row.driver_code : row.team,
    mode: "lines",
    line: { color: row.team_color, width: i < 3 ? 2.4 : 1.4, dash: data.kind === "drivers" && top.findIndex((r) => r.team === row.team) !== i ? "dot" : "solid" },
    hovertemplate: "%{customdata}<br><b>%{fullData.name}</b> %{y} pts<extra></extra>",
  }));
  return (
    <Plot
      data={traces}
      layout={baseLayout({
        height: 380,
        showlegend: true,
        legend: { orientation: "h", y: -0.18, font: { size: 11 } },
        margin: { l: 48, r: 12, t: 8, b: 40 },
        xaxis: { gridcolor: "rgba(36,25,20,0.06)", tickfont: { size: 10 } },
        yaxis: { gridcolor: "rgba(36,25,20,0.08)", title: { text: "points", font: { size: 11 } } },
      })}
      config={plotConfig}
    />
  );
}

export default function Standings({ kind }) {
  const copy = COPY[kind];
  const [seasons, setSeasons] = useState(null);
  const [year, setYear] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/standings/seasons")
      .then((s) => {
        setSeasons(s);
        setYear(s[0] ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (year == null) return;
    setData(null);
    setError("");
    api(`/standings/${kind}?year=${year}`).then(setData).catch((e) => setError(e.message));
  }, [kind, year]);

  const latest = data?.rounds[data.rounds.length - 1];
  return (
    <>
      <header className="page-head">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        {latest && (
          <p className="muted st-after">
            After round {latest.round} of {year}, the {latest.name}. Official points, sprints included.
          </p>
        )}
      </header>

      {seasons && seasons.length > 0 && (
        <div className="tabs" role="tablist">
          {seasons.map((s) => (
            <button key={s} role="tab" aria-selected={s === year} className={s === year ? "tab active" : "tab"} onClick={() => setYear(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {seasons && seasons.length === 0 && <p className="empty">No standings loaded yet. They're added after each race.</p>}
      {error && <p className="error">{error}</p>}
      {year != null && !data && !error && <p className="muted">Loading standings…</p>}

      {data && (
        <div className="st-layout">
          <section className="panel st-table-panel">
            <table className="st-table">
              <thead>
                <tr>
                  <th className="num">Pos</th>
                  <th>{copy.who}</th>
                  <th className="num">Wins</th>
                  <th className="num">Podiums</th>
                  <th className="num">Gap</th>
                  <th className="num">Points</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.number ?? row.team} style={{ "--team": row.team_color }}>
                    <td className="num st-pos">{row.position ?? "–"}</td>
                    <td>
                      <div className="st-who">
                        <span className="st-bar" aria-hidden />
                        {kind === "drivers" ? (
                          <>
                            <Headshot src={row.headshot_url} code={row.driver_code} />
                            <span>
                              <strong>{row.full_name}</strong>
                              <span className="muted st-sub">
                                #{row.number} · {row.team}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span>
                            <strong>{row.team}</strong>
                            <span className="muted st-sub">{row.drivers.join(" · ")}</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="num">{row.wins}</td>
                    <td className="num">{row.podiums}</td>
                    <td className="num muted">{row.gap ? `−${fmtPoints(row.gap)}` : "—"}</td>
                    <td className="num st-points">{fmtPoints(row.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted st-note">Wins and podiums count Grands Prix only.</p>
          </section>
          <section className="panel">
            <h2 className="section-title">Points, race by race</h2>
            <Progression data={data} />
          </section>
        </div>
      )}
    </>
  );
}
