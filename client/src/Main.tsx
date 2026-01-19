import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Join } from './pages/Join';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Payment } from './pages/Payment';
import SharePage from './pages/SharePage';
import { authService } from './services/authService';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return authService.isAuthenticated() ? <>{children}</> : <Navigate to="/login" />;
};

function Main() {
  return (
    <Router>
      <Routes>
        <Route 
          path="/" 
          element={authService.isAuthenticated() ? <Navigate to="/home" /> : <Landing />} 
        />
        <Route 
          path="/join" 
          element={authService.isAuthenticated() ? <Navigate to="/home" /> : <Join />} 
        />
        <Route 
          path="/login" 
          element={authService.isAuthenticated() ? <Navigate to="/home" /> : <Login />} 
        />
        <Route
          path="/forgot-password"
          element={authService.isAuthenticated() ? <Navigate to="/home" /> : <ForgotPassword />}
        />
        {/* Share page - public, no authentication required */}
        <Route path="/s/:shareId" element={<SharePage />} />
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/home/upload" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/home/download" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/home/history" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/payment" element={<ProtectedRoute><Payment /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default Main;