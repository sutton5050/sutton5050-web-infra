import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import apiClient from '../api/client';

interface PingResult {
  message: string;
  user: string;
  timestamp: string;
}

export function Dashboard() {
  const { isAuthenticated, logout } = useAuth();
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'unknown' | 'up' | 'down'>('unknown');

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handlePing = async () => {
    setPinging(true);
    setPingError(null);
    setPingResult(null);
    try {
      const res = await apiClient.get<PingResult>('/ping');
      setPingResult(res.data);
      setBackendStatus('up');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setPingError(message);
      setBackendStatus('down');
    } finally {
      setPinging(false);
    }
  };

  return (
    <div className="dashboard">
      <nav className="nav">
        <span className="nav-brand">sutton5050</span>
        <div className="nav-right">
          <button className="nav-link" onClick={logout}>Sign out</button>
        </div>
      </nav>

      <section className="dashboard-hero">
        <h1>Welcome back.</h1>
        <p>Your sandbox is ready.</p>
      </section>

      <section className="card-grid">
        <div className="card">
          <h2>Ping Backend</h2>
          <p>
            Send an authenticated request to the API Gateway.
            Check the ECS CloudWatch logs to see it arrive.
          </p>
          <button className="ping-btn" onClick={handlePing} disabled={pinging}>
            {pinging ? 'Sending...' : 'Send Ping'}
          </button>

          {pingResult && (
            <div className="ping-result success">
              <div>&#10003; {pingResult.message}</div>
              <div>user: {pingResult.user}</div>
              <div>time: {pingResult.timestamp}</div>
            </div>
          )}

          {pingError && (
            <div className="ping-result error">
              &#10007; {pingError}
            </div>
          )}
        </div>
      </section>

      <div style={{ flex: 1 }} />

      <footer className="status-footer">
        <div className="status-item">
          <span className={`dot ${backendStatus === 'unknown' ? 'unknown' : backendStatus === 'down' ? 'error' : ''}`} />
          API {backendStatus === 'unknown' ? '—' : backendStatus === 'up' ? 'Connected' : 'Error'}
        </div>
        <div className="status-item">
          <span className="dot" />
          eu-west-2
        </div>
        <div className="status-item">
          <span className="dot" />
          Fargate
        </div>
      </footer>
    </div>
  );
}
