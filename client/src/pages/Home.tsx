import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { authService } from '../services/authService';
import App from '../App';

export const Home: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      navigate('/login');
    }
  }, [navigate]);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <App />
    </div>
  );
};