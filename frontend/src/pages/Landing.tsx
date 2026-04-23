import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function Landing() {
  const { login, isAuthenticated } = useAuth();
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  if (isAuthenticated) {
    navigate('/dashboard', { replace: true });
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    login(password);
    navigate('/dashboard', { replace: true });
  };

  return (
    <>
      <nav className="nav">
        <span className="nav-brand">FPL Viewer</span>
      </nav>
      <section className="hero">
        <p className="hero-overtitle">Fantasy Premier League</p>
        <h1>Any player. Any gameweek.</h1>
        <p className="hero-subtitle">
          Live stats pulled straight from the FPL API. Sign in with the
          sandbox password to look up per-gameweek performance.
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Sandbox password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            aria-label="Sandbox password"
          />
          <button type="submit" className="hero-cta" disabled={!password}>
            Enter
            <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 7h12m0 0L8 2m5 5L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </section>
    </>
  );
}
