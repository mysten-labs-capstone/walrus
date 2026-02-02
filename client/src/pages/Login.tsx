import React, { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiUrl } from "../config/api";
import { authService } from "../services/authService";
import {
  deriveKeysFromPasswordWithSalt,
  decryptMasterKey,
  decryptRecoveryPhrase,
  deriveKeyFromRecoveryPhrase,
} from "../services/keyDerivation";
import { useAuth } from "../auth/AuthContext";
import "./css/Login.css";
import SlidesCarousel from "../components/SlidesCarousel";

export default function Login() {
  const { setPrivateKey } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorUsername, setErrorUsername] = useState("");
  const [errorPassword, setErrorPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"username" | "password">("username");
  // no transient text notice; we'll visually indicate read-only with darker input
  const navigate = useNavigate();
  const location = useLocation();

  // carousel moved to SlidesCarousel component

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = username.trim();
    if (!trimmed) {
      setErrorUsername("Please enter your username");
      return;
    }

    if (trimmed.length < 3) {
      setErrorUsername("Invalid username");
      return;
    }

    setErrorUsername("");
    setLoading(true);

    try {
      const res = await fetch(
        apiUrl(
          `/api/auth/check-username?username=${encodeURIComponent(username.trim())}`,
        ),
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorUsername(data.error || "Unable to verify username");
        return;
      }
      const data = await res.json();
      // server returns available === true when username is NOT taken
      if (data.available) {
        setErrorUsername("User not found");
        return;
      }
      setStep("password");
    } catch (err) {
      console.error("Username check failed", err);
      setErrorUsername("Unable to verify username");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorPassword("");
    setLoading(true);
    try {
      // Step 1: Get user's salt from server (public, non-sensitive)
      const saltResponse = await fetch(
        apiUrl(
          `/api/auth/get-salt?username=${encodeURIComponent(username.trim())}`,
        ),
      );

      if (!saltResponse.ok) {
        throw new Error("Invalid username or password");
      }

      const { salt, hasNewAuth } = await saltResponse.json();

      let authKey: string | undefined;
      let encKey: Uint8Array | undefined;

      // NEW FLOW: Use salt to derive auth_key and enc_key
      if (salt && hasNewAuth) {
        const keys = await deriveKeysFromPasswordWithSalt(password, salt);
        authKey = keys.authKey;
        encKey = keys.encKey;
      }

      // Step 2: Authenticate with server
      const user = await authService.login({
        username: username.trim(),
        authKey,
        password: !authKey ? password : undefined, // Fallback to old flow
      });
      authService.saveUser(user);

      // Step 3: Decrypt master key using enc_key
      if (user.encryptedMasterKey && encKey) {
        try {
          const masterKeyHex = await decryptMasterKey(
            user.encryptedMasterKey,
            encKey,
          );
          setPrivateKey(`0x${masterKeyHex}`);
        } catch (err) {
          console.error("Failed to decrypt master key:", err);
          setErrorPassword(
            "Warning: Could not restore encryption key. Files may not be accessible.",
          );
        }
      } else if (user.encryptedRecoveryPhrase) {
        // BACKWARD COMPATIBILITY: old accounts with encrypted recovery phrase
        try {
          const recoveryPhrase = await decryptRecoveryPhrase(
            user.encryptedRecoveryPhrase,
            password,
            username.trim(),
          );
          const masterKey = deriveKeyFromRecoveryPhrase(recoveryPhrase);
          setPrivateKey(`0x${masterKey}`);
        } catch (err) {
          console.error("Failed to derive encryption key:", err);
          setErrorPassword(
            "Warning: Could not restore encryption key. Files may not be accessible.",
          );
        }
      }

      // Check if we should redirect to a share link
      const pendingShareId = sessionStorage.getItem("pendingShareId");
      const returnTo = (location.state as any)?.from;
      if (pendingShareId) {
        sessionStorage.removeItem("pendingShareId");
        if (returnTo) {
          navigate(returnTo);
        } else {
          navigate(`/s/${pendingShareId}`);
        }
      } else if (returnTo) {
        navigate(returnTo);
      } else {
        navigate("/home");
      }
    } catch (err: any) {
      console.error("Login failed", err);
      setErrorPassword("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  // slides now provided by SlidesCarousel

  return (
    <div className="login-page">
      {/* Left side - Login Form */}
      <div className="login-left">
        <div className="container">
          {/* Logo */}
          <div className="login-logo">
            <div className="logo-row">
              <a href="/" className="logo-mark-link">
                <img
                  src="/logo+text.svg"
                  alt="Walrus - Infinity Storage"
                  className="login-logo-img h-12 w-auto"
                />
              </a>
            </div>
          </div>

          {/* Form */}
          <div className="form-space">
            {/* Username Step*/}
            {step === "username" && (
              <>
                <div className="form-group">
                  <label className="label">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setErrorUsername("");
                    }}
                    className={`input ${errorUsername ? "input-error" : ""}`}
                    required
                  />
                  {errorUsername && (
                    <p className="error-text">{errorUsername}</p>
                  )}
                </div>

                <button
                  onClick={handleNext}
                  className="btn btn-gradient liquid-btn"
                >
                  Next
                </button>
              </>
            )}

            {/* Password Step */}
            {step === "password" && (
              <>
                <div className="form-group">
                  <label className="label">Signing in as</label>
                  <div className="signed-in-as">
                    <div className="signed-in-top">
                      <div className="signed-in-username">{username}</div>
                      <button
                        type="button"
                        onClick={() => setStep("username")}
                        className="signed-in-change"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrorPassword("");
                      }}
                      className={`input ${errorPassword ? "input-error" : ""}`}
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="password-toggle"
                    >
                      {showPassword ? (
                        <EyeOff className="icon" />
                      ) : (
                        <Eye className="icon" />
                      )}
                    </button>
                  </div>
                  {errorPassword && (
                    <p className="error-text">{errorPassword}</p>
                  )}
                </div>

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="btn btn-gradient liquid-btn"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>
                <div className="link-center back-link-wrapper">
                  <button
                    type="button"
                    onClick={() => setStep("username")}
                    className="back-link"
                  >
                    ← Back
                  </button>
                </div>
              </>
            )}

            <div className="link-center forgot-link">
              <a href="/forgot-password" className="small-link">
                Forgot password?
              </a>
            </div>

            <div className="link-center divider">
              <p className="label info-text">
                Don't have an account?{" "}
                <a href="/join" className="small-link">
                  Join now
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Carousel*/}
      <SlidesCarousel />
    </div>
  );
}
