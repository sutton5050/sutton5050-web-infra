import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { CallbackPage } from './auth/CallbackPage';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { ProtectedRoute } from './components/ProtectedRoute';
import { setTokenGetter } from './api/client';
import './App.css';

function TokenSync() {
  const { getAccessToken } = useAuth();
  useEffect(() => {
    setTokenGetter(getAccessToken);
  }, [getAccessToken]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TokenSync />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
