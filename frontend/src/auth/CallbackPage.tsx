import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { userManager } from './AuthProvider';

export function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    userManager
      .signinRedirectCallback()
      .then(() => {
        navigate('/dashboard', { replace: true });
      })
      .catch((err) => {
        console.error('Auth callback error:', err);
        setError(err.message || 'Authentication failed');
        timeoutId = setTimeout(() => navigate('/', { replace: true }), 3000);
      });
    return () => clearTimeout(timeoutId);
  }, [navigate]);

  if (error) {
    return (
      <div className="callback">
        <h2>Something went wrong.</h2>
        <p>{error}</p>
        <p>Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="callback">
      <p>Signing you in...</p>
    </div>
  );
}
