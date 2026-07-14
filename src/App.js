import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Auth from './pages/Auth';
import Feed from './pages/Feed';
import * as api from './api';

// Auth state is driven by the API layer: a flag is set on login/register and the
// httpOnly refresh cookie is the durable credential (see src/api.js). If the
// cookie has expired, the first authenticated request self-heals by clearing the
// flag and redirecting back to /login.
function isAuthed() {
  return api.isLoggedIn();
}

// Guards the feed so only logged-in users can reach it.
function RequireAuth({ children }) {
  const location = useLocation();
  if (!isAuthed()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={isAuthed() ? '/feed' : '/login'} replace />} />
        {/* Login and Register share one page (Auth.jsx); the route decides the view. */}
        <Route path="/login" element={<Auth />} />
        <Route path="/register" element={<Auth />} />
        <Route
          path="/feed"
          element={
            <RequireAuth>
              <Feed />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
