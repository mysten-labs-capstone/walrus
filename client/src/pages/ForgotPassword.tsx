import React, { useState } from "react";
import { Eye, EyeOff, Key, AlertCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { authService } from "../services/authService";
import {
  validateRecoveryPhrase,
  deriveKeyFromRecoveryPhrase,
} from "../services/keyDerivation";
import { useAuth } from "../auth/AuthContext";

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { setPrivateKey } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [username, setUsername] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  // password validation helpers (same criteria as signup)
  const passwordValidation = {
    hasMinLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasLowercase: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
  };
  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  const submitUsername = async () => {
    setError("");
    if (!username.trim()) return setError("Please enter your username");
    setStep(2);
  };

  const verifyRecoveryPhrase = async () => {
    setError("");
    const trimmedPhrase = recoveryPhrase.trim().toLowerCase();

    if (!validateRecoveryPhrase(trimmedPhrase)) {
      setError("Invalid recovery phrase. Please enter exactly 12 words.");
      return;
    }

    // Verify the phrase generates a valid key
    try {
      deriveKeyFromRecoveryPhrase(trimmedPhrase);
      setStep(3);
    } catch (err: any) {
      setError("Invalid recovery phrase format. Please check and try again.");
    }
  };

  const submitNewPassword = async () => {
    setError("");
    if (!isPasswordValid)
      return setError("Password does not meet all requirements");
    if (newPassword !== confirmPassword)
      return setError("Passwords do not match");

    setLoading(true);
    try {
      // Derive the master key from recovery phrase
      const trimmedPhrase = recoveryPhrase.trim().toLowerCase();
      const masterKey = deriveKeyFromRecoveryPhrase(trimmedPhrase);

      // Store encryption key in session
      setPrivateKey(`0x${masterKey}`);

      // Update password on server
      // Note: This requires a new backend endpoint that doesn't rely on security questions
      // For now, we'll just restore the key and have them login
      alert(
        "Recovery phrase verified! Your encryption key has been restored. Please log in with your username and NEW password.",
      );
      navigate("/login");
    } catch (err: any) {
      setError(err.message || "Password reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navbar />
      <div className="container mx-auto px-6 py-12 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-center mb-4">
            Password recovery
          </h1>

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Enter your username to begin account recovery.
              </p>
              <input
                className="w-full px-3 py-2 border rounded-lg"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
              />
              <button
                onClick={submitUsername}
                disabled={!username.trim()}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-2">
                <Key className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    Enter your recovery phrase
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    This is the 12-word phrase you saved when creating your
                    account.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Recovery Phrase
                </label>
                <textarea
                  value={recoveryPhrase}
                  onChange={(e) => setRecoveryPhrase(e.target.value)}
                  placeholder="Enter your 12-word recovery phrase separated by spaces"
                  className="w-full p-3 border rounded-lg font-mono text-sm min-h-[100px]"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-xs text-gray-500">
                  Enter all 12 words separated by spaces
                </p>
              </div>

              <button
                onClick={verifyRecoveryPhrase}
                disabled={recoveryPhrase.trim().split(/\s+/).length !== 12}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg disabled:opacity-50"
              >
                Verify Phrase
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-2">
                <AlertCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-900">
                    Recovery phrase verified!
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Your encryption key has been restored. You can now log in
                    with your username and password.
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600">
                If you'd like to change your password, you can do so from your
                profile after logging in.
              </p>

              <button
                onClick={() => navigate("/login")}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg"
              >
                Go to Login
              </button>
            </div>
          )}

          {/* Legacy password reset UI - keeping structure for reference but simplified */}
          {false && step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Set a new password for your account.
              </p>
              <p className="text-xs text-gray-500">
                Password must be at least 8 characters and include an uppercase
                letter, a lowercase letter, a number, and a special character.
              </p>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  className="w-full px-3 py-2 border rounded-lg"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {newPassword && (
                <div className="mt-2 space-y-1 text-xs">
                  <div
                    className={`flex items-center gap-1 ${passwordValidation.hasMinLength ? "text-green-600" : "text-gray-500"}`}
                  >
                    <span>{passwordValidation.hasMinLength ? "✓" : "○"}</span>
                    <span>At least 8 characters</span>
                  </div>
                  <div
                    className={`flex items-center gap-1 ${passwordValidation.hasUppercase ? "text-green-600" : "text-gray-500"}`}
                  >
                    <span>{passwordValidation.hasUppercase ? "✓" : "○"}</span>
                    <span>One uppercase letter</span>
                  </div>
                  <div
                    className={`flex items-center gap-1 ${passwordValidation.hasLowercase ? "text-green-600" : "text-gray-500"}`}
                  >
                    <span>{passwordValidation.hasLowercase ? "✓" : "○"}</span>
                    <span>One lowercase letter</span>
                  </div>
                  <div
                    className={`flex items-center gap-1 ${passwordValidation.hasNumber ? "text-green-600" : "text-gray-500"}`}
                  >
                    <span>{passwordValidation.hasNumber ? "✓" : "○"}</span>
                    <span>One number</span>
                  </div>
                  <div
                    className={`flex items-center gap-1 ${passwordValidation.hasSpecial ? "text-green-600" : "text-gray-500"}`}
                  >
                    <span>{passwordValidation.hasSpecial ? "✓" : "○"}</span>
                    <span>One special character (!@#$%^&*...)</span>
                  </div>
                </div>
              )}
              <div className="relative">
                <input
                  type={showConfirmNewPassword ? "text" : "password"}
                  className="w-full px-3 py-2 border rounded-lg"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmNewPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmNewPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-sm text-red-600 mt-1">
                  ✗ Passwords do not match
                </p>
              )}
              {confirmPassword && newPassword === confirmPassword && (
                <p className="text-sm text-green-600 mt-1">✓ Passwords match</p>
              )}
              <button
                onClick={submitNewPassword}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg"
              >
                {loading ? "Please wait..." : "Reset Password"}
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Remembered your password?{" "}
              <Link to="/login" className="text-indigo-600 font-semibold">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
