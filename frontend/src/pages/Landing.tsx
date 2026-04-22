import { useAuth } from '../auth/AuthProvider';
import { Navigate } from 'react-router-dom';

export function Landing() {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      <nav className="nav">
        <span className="nav-brand">sutton5050</span>
        <button className="nav-link" onClick={login}>
          Sign in
        </button>
      </nav>
      <section className="hero">
        <p className="hero-overtitle">Sandbox Environment</p>
        <h1>Build anything. Experiment freely.</h1>
        <p className="hero-subtitle">
          A serverless platform on AWS for rapid application development
          and experimentation.
        </p>
        <button className="hero-cta" onClick={login}>
          Get started
          <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 7h12m0 0L8 2m5 5L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>
    </>
  );
}
