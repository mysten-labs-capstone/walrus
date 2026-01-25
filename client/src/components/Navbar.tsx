import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DollarSign } from "lucide-react";
import { authService } from "../services/authService";
import { apiUrl } from "../config/api";
import { useAuth } from "../auth/AuthContext";

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const { clearPrivateKey } = useAuth();
  const user = authService.getCurrentUser();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      fetchBalance();
      // Auto-refresh balance - increased interval to reduce server CPU load
      const interval = setInterval(() => {
        fetchBalance();
      }, 60000); // 60 seconds - reduced frequency to prevent CPU exhaustion
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchBalance = async () => {
    if (!user) return;

    try {
      const response = await fetch(
        apiUrl(`/api/payment/get-balance?userId=${user.id}`),
      );
      
      // Don't try to parse JSON if request failed (prevents errors)
      if (!response.ok) {
        // Silently fail - don't spam console with errors
        return;
      }
      
      const data = await response.json();
      if (response.ok) {
        setBalance(data.balance || 0);
      }
    } catch (err) {
      // Silently fail - don't spam console with errors during server downtime
      // console.error("Failed to fetch balance:", err);
    }
  };

  const handleLogout = () => {
    clearPrivateKey(); // Clear encryption key from sessionStorage
    authService.logout(); // Clear user from localStorage
    window.location.href = "/";
  };

  return (
    <nav className="bg-indigo-600 text-white shadow-lg">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-bold hover:text-indigo-200"
          >
            Walrus Vault
          </Link>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Link to="/home" className="hover:text-indigo-200">
                  Dashboard
                </Link>
                <Link to="/profile" className="hover:text-indigo-200">
                  Profile
                </Link>
                <Link
                  to="/payment"
                  className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded-lg transition-colors"
                >
                  <DollarSign className="h-4 w-4" />
                  {balance !== null ? balance.toFixed(2) : "Balance"}
                </Link>
                <button
                  onClick={handleLogout}
                  className="bg-indigo-800 hover:bg-indigo-900 px-4 py-2 rounded-lg transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-indigo-200 px-4 py-2">
                  Login
                </Link>
                <Link
                  to="/join"
                  className="bg-white text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg font-semibold transition-colors"
                >
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
