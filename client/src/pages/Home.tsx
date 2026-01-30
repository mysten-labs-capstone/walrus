import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import App from "../App";

console.log("[Home] Home.tsx module loaded");

export const Home: React.FC = () => {
  console.log("[Home] Home component rendering");
  const navigate = useNavigate();

  useEffect(() => {
    console.log("[Home] useEffect - checking auth");
    if (!authService.isAuthenticated()) {
      navigate("/login");
    }
  }, [navigate]);

  console.log("[Home] About to render App component");
  return (
    <div className="flex flex-col min-h-screen">
      <App />
    </div>
  );
};
