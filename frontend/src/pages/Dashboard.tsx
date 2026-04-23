import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import apiClient from '../api/client';

interface Bootstrap {
  current_gameweek: number;
  total_gameweeks: number;
}

interface PlayerMatch {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: string;
  position: string;
}

interface StatRow {
  label: string;
  value: string | number;
}

interface GameweekStats {
  player: {
    id: number;
    first_name: string;
    second_name: string;
    web_name: string;
  };
  gameweek: number;
  stats: StatRow[];
}

function describe(p: PlayerMatch): string {
  const full = `${p.first_name} ${p.second_name}`.trim();
  return `${full} (${p.web_name}) · ${p.team} · ${p.position}`;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { data?: { detail?: string } } }).response;
    if (res?.data?.detail) return res.data.detail;
  }
  return err instanceof Error ? err.message : 'Request failed';
}

export function Dashboard() {
  const { isAuthenticated, logout } = useAuth();
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [gameweek, setGameweek] = useState<number>(1);
  const [matches, setMatches] = useState<PlayerMatch[] | null>(null);
  const [result, setResult] = useState<GameweekStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    apiClient.get<Bootstrap>('/fpl/bootstrap')
      .then((res) => {
        setBootstrap(res.data);
        setGameweek(res.data.current_gameweek);
      })
      .catch((err) => setBootstrapError(errorMessage(err)));
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const fetchStats = async (playerId: number) => {
    setLoading(true);
    setError(null);
    setMatches(null);
    try {
      const res = await apiClient.get<GameweekStats>(
        `/fpl/players/${playerId}/gameweek/${gameweek}`,
      );
      setResult(res.data);
    } catch (err) {
      setError(errorMessage(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setMatches(null);

    try {
      const res = await apiClient.get<{ matches: PlayerMatch[] }>('/fpl/players', {
        params: { q: name.trim() },
      });
      const found = res.data.matches;
      if (found.length === 0) {
        setError(`No player matching "${name}". Try a different spelling.`);
      } else if (found.length === 1) {
        await fetchStats(found[0].id);
        return;
      } else {
        setMatches(found);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard">
      <nav className="nav">
        <span className="nav-brand">FPL Viewer</span>
        <div className="nav-right">
          <button className="nav-link" onClick={logout}>Sign out</button>
        </div>
      </nav>

      <section className="dashboard-hero">
        <h1>Gameweek Stats</h1>
        <p>Live data from the Fantasy Premier League API.</p>
      </section>

      <section className="card-grid">
        <div className="card fpl-card">
          {bootstrapError && (
            <div className="ping-result error">&#10007; {bootstrapError}</div>
          )}

          <form className="fpl-form" onSubmit={handleSubmit}>
            <label className="fpl-field">
              <span>Player name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Salah, Haaland"
                autoFocus
              />
            </label>

            <label className="fpl-field">
              <span>Gameweek</span>
              <select
                value={gameweek}
                onChange={(e) => setGameweek(Number(e.target.value))}
                disabled={!bootstrap}
              >
                {bootstrap &&
                  Array.from({ length: bootstrap.total_gameweeks }, (_, i) => i + 1).map((gw) => (
                    <option key={gw} value={gw}>
                      GW {gw}
                      {gw === bootstrap.current_gameweek ? ' (current)' : ''}
                    </option>
                  ))}
              </select>
            </label>

            <button
              type="submit"
              className="ping-btn"
              disabled={loading || !name.trim() || !bootstrap}
            >
              {loading ? 'Searching…' : 'Look up'}
            </button>
          </form>

          {error && <div className="ping-result error">&#10007; {error}</div>}

          {matches && (
            <div className="match-list">
              <p className="match-list-heading">Multiple matches — pick one:</p>
              <ul>
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="match-item"
                      onClick={() => fetchStats(p.id)}
                      disabled={loading}
                    >
                      {describe(p)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result && (
            <div className="stats-result">
              <h3 className="stats-title">
                {result.player.first_name} {result.player.second_name} · GW {result.gameweek}
              </h3>
              <table className="stats-table">
                <tbody>
                  {result.stats.map((row) => (
                    <tr key={row.label}>
                      <th>{row.label}</th>
                      <td>{row.value === '' ? '—' : String(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <div style={{ flex: 1 }} />

      <footer className="status-footer">
        <div className="status-item">
          <span className="dot" />
          FPL API
        </div>
        <div className="status-item">
          <span className="dot" />
          eu-west-2
        </div>
      </footer>
    </div>
  );
}
