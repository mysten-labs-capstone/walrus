import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const user = authService.getCurrentUser();

  const handleLogout = () => {
    authService.logout();
    navigate('/');
  };

  return (
    <nav className="bg-indigo-600 text-white shadow-lg">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold hover:text-indigo-200">
            Walrus Vault
          </Link>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Link to="/home" className="hover:text-indigo-200">Dashboard</Link>
                <span className="text-indigo-200">Welcome, <strong>{user.username}</strong></span>
                <button onClick={handleLogout} className="bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded-lg transition-colors">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-indigo-200 px-4 py-2">Login</Link>
                <Link to="/join" className="bg-white text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg font-semibold transition-colors">
                  Join
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};