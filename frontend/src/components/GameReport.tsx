import { useState } from 'react';
import type { GameReportData } from '../pages/Dashboard';
import { teamColor } from '../lib/teamColors';

interface Props {
  data: GameReportData;
}

interface Highlight {
  label: string;
  value: string | number;
  tone: 'positive' | 'negative' | 'neutral' | 'gold';
  icon: string;
}

function buildHighlights(d: GameReportData): Highlight[] {
  const h: Highlight[] = [];
  const { attacking, defending, discipline, summary, player } = d;

  if (attacking.goals > 0) {
    h.push({ label: 'Goals', value: attacking.goals, tone: 'positive', icon: '⚽' });
  }
  if (attacking.assists > 0) {
    h.push({ label: 'Assists', value: attacking.assists, tone: 'positive', icon: '🎯' });
  }
  if (defending.clean_sheets > 0 && (player.position === 'GKP' || player.position === 'DEF')) {
    h.push({ label: 'Clean sheet', value: '✓', tone: 'positive', icon: '🛡️' });
  }
  if (summary.bonus > 0) {
    h.push({ label: 'Bonus', value: `+${summary.bonus}`, tone: 'gold', icon: '⭐' });
  }
  if (defending.saves >= 3 && player.position === 'GKP') {
    h.push({ label: 'Saves', value: defending.saves, tone: 'positive', icon: '🧤' });
  }
  if (discipline.penalties_saved > 0) {
    h.push({ label: 'Pen saved', value: discipline.penalties_saved, tone: 'positive', icon: '🧤' });
  }
  if (discipline.penalties_missed > 0) {
    h.push({ label: 'Pen missed', value: discipline.penalties_missed, tone: 'negative', icon: '❌' });
  }
  if (discipline.yellow_cards > 0) {
    h.push({ label: 'Yellow', value: discipline.yellow_cards, tone: 'neutral', icon: '🟨' });
  }
  if (discipline.red_cards > 0) {
    h.push({ label: 'Red', value: discipline.red_cards, tone: 'negative', icon: '🟥' });
  }
  if (discipline.own_goals > 0) {
    h.push({ label: 'Own goal', value: discipline.own_goals, tone: 'negative', icon: '😬' });
  }
  return h;
}

function pointsTone(pts: number): string {
  if (pts >= 10) return 'points-elite';
  if (pts >= 6) return 'points-good';
  if (pts >= 2) return 'points-ok';
  return 'points-bad';
}

function ictBar({ influence, creativity, threat }: GameReportData['ict']) {
  const total = influence + creativity + threat || 1;
  return {
    influence: (influence / total) * 100,
    creativity: (creativity / total) * 100,
    threat: (threat / total) * 100,
  };
}

function MetricCompare({
  label,
  actual,
  expected,
}: { label: string; actual: number; expected: number }) {
  const diff = actual - expected;
  const sign = diff > 0 ? '+' : '';
  const cls = diff > 0.1 ? 'over' : diff < -0.1 ? 'under' : 'par';
  return (
    <div className="metric-compare">
      <div className="metric-label">{label}</div>
      <div className="metric-values">
        <span className="metric-actual">{actual}</span>
        <span className="metric-divider">vs</span>
        <span className="metric-expected">x{expected.toFixed(2)}</span>
      </div>
      <div className={`metric-diff ${cls}`}>
        {sign}{diff.toFixed(2)}
      </div>
    </div>
  );
}

export function GameReport({ data }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const { player, fixture, summary, attacking, defending, discipline, ict } = data;
  const highlights = buildHighlights(data);
  const color = teamColor(player.team.short_name);
  const ict_pct = ictBar(ict);
  const fullName = `${player.first_name} ${player.second_name}`.trim();

  return (
    <section className="report">
      {/* Hero */}
      <div
        className="report-hero"
        style={{ '--team-color': color } as React.CSSProperties}
      >
        <div className="hero-left">
          {player.photo_url && (
            <img
              className="hero-photo"
              src={player.photo_url}
              alt={fullName}
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>
        <div className="hero-main">
          <div className="hero-team">
            {player.team.crest_url && (
              <img className="crest" src={player.team.crest_url} alt={player.team.name} />
            )}
            <span>{player.team.name}</span>
            <span className="dot-sep">·</span>
            <span className="pos-chip">{player.position}</span>
          </div>
          <h1 className="hero-name">
            <span className="first">{player.first_name}</span>
            <span className="last">{player.second_name || player.web_name}</span>
          </h1>
          <div className="hero-fixture">
            <span className="gw-chip">GW {data.gameweek}</span>
            <span className="venue">{fixture.was_home ? 'Home' : 'Away'}</span>
            <span className="vs">vs</span>
            {fixture.opponent.crest_url && (
              <img className="crest sm" src={fixture.opponent.crest_url} alt={fixture.opponent.name} />
            )}
            <span className="opp-name">{fixture.opponent.name}</span>
          </div>
        </div>
        <div className={`hero-score ${pointsTone(summary.total_points)}`}>
          <div className="points-number">{summary.total_points}</div>
          <div className="points-label">FPL pts</div>
        </div>
      </div>

      {/* Minutes + BPS strip */}
      <div className="stat-strip">
        <div className="strip-item">
          <div className="strip-value">{summary.minutes}'</div>
          <div className="strip-label">Minutes</div>
        </div>
        <div className="strip-item">
          <div className="strip-value">{summary.bps}</div>
          <div className="strip-label">BPS</div>
        </div>
        <div className="strip-item">
          <div className="strip-value">{ict.ict_index.toFixed(1)}</div>
          <div className="strip-label">ICT</div>
        </div>
      </div>

      {/* Highlights */}
      {highlights.length > 0 && (
        <div className="highlights">
          {highlights.map((h, i) => (
            <div key={i} className={`highlight-card tone-${h.tone}`}>
              <div className="highlight-icon" aria-hidden>{h.icon}</div>
              <div className="highlight-value">{h.value}</div>
              <div className="highlight-label">{h.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* xG / xA comparison */}
      <div className="panel">
        <h3 className="panel-title">Expected vs actual</h3>
        <div className="metric-grid">
          <MetricCompare
            label="Goals"
            actual={attacking.goals}
            expected={attacking.expected_goals}
          />
          <MetricCompare
            label="Assists"
            actual={attacking.assists}
            expected={attacking.expected_assists}
          />
          {(player.position === 'GKP' || player.position === 'DEF') && (
            <MetricCompare
              label="Goals conceded"
              actual={defending.goals_conceded}
              expected={defending.expected_goals_conceded}
            />
          )}
        </div>
      </div>

      {/* ICT bar */}
      <div className="panel">
        <h3 className="panel-title">ICT index breakdown</h3>
        <div className="ict-bar">
          <div className="ict-segment ict-influence" style={{ width: `${ict_pct.influence}%` }}>
            {ict_pct.influence > 12 && <span>I</span>}
          </div>
          <div className="ict-segment ict-creativity" style={{ width: `${ict_pct.creativity}%` }}>
            {ict_pct.creativity > 12 && <span>C</span>}
          </div>
          <div className="ict-segment ict-threat" style={{ width: `${ict_pct.threat}%` }}>
            {ict_pct.threat > 12 && <span>T</span>}
          </div>
        </div>
        <div className="ict-legend">
          <div><span className="ict-dot ict-influence" /> Influence {ict.influence.toFixed(1)}</div>
          <div><span className="ict-dot ict-creativity" /> Creativity {ict.creativity.toFixed(1)}</div>
          <div><span className="ict-dot ict-threat" /> Threat {ict.threat.toFixed(1)}</div>
        </div>
      </div>

      {/* Raw stats (collapsible) */}
      <div className="panel">
        <button className="toggle-raw" onClick={() => setShowRaw((s) => !s)}>
          {showRaw ? '− Hide all stats' : '+ Show all stats'}
        </button>
        {showRaw && (
          <table className="stats-table">
            <tbody>
              <tr><th>Minutes</th><td>{summary.minutes}</td></tr>
              <tr><th>Starts</th><td>{summary.starts}</td></tr>
              <tr><th>Goals</th><td>{attacking.goals}</td></tr>
              <tr><th>Assists</th><td>{attacking.assists}</td></tr>
              <tr><th>xG</th><td>{attacking.expected_goals.toFixed(2)}</td></tr>
              <tr><th>xA</th><td>{attacking.expected_assists.toFixed(2)}</td></tr>
              <tr><th>xGI</th><td>{attacking.expected_goal_involvements.toFixed(2)}</td></tr>
              <tr><th>Clean sheets</th><td>{defending.clean_sheets}</td></tr>
              <tr><th>Goals conceded</th><td>{defending.goals_conceded}</td></tr>
              <tr><th>xGC</th><td>{defending.expected_goals_conceded.toFixed(2)}</td></tr>
              <tr><th>Saves</th><td>{defending.saves}</td></tr>
              <tr><th>Yellow cards</th><td>{discipline.yellow_cards}</td></tr>
              <tr><th>Red cards</th><td>{discipline.red_cards}</td></tr>
              <tr><th>Own goals</th><td>{discipline.own_goals}</td></tr>
              <tr><th>Pen saved</th><td>{discipline.penalties_saved}</td></tr>
              <tr><th>Pen missed</th><td>{discipline.penalties_missed}</td></tr>
              <tr><th>Bonus</th><td>{summary.bonus}</td></tr>
              <tr><th>BPS</th><td>{summary.bps}</td></tr>
              <tr><th>Influence</th><td>{ict.influence.toFixed(1)}</td></tr>
              <tr><th>Creativity</th><td>{ict.creativity.toFixed(1)}</td></tr>
              <tr><th>Threat</th><td>{ict.threat.toFixed(1)}</td></tr>
              <tr><th>ICT Index</th><td>{ict.ict_index.toFixed(1)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
