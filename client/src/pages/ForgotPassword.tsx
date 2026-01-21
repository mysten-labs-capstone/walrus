import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import "./css/ForgotPassword.css";
import "./css/Login.css";

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<number>(1);
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  // Join-style password state
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordInvalidOnSubmit, setPasswordInvalidOnSubmit] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState(false);

  // password validation helpers (same criteria as signup)
  const passwordValidation = {
    hasMinLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasLowercase: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
  };
  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  // password strength (same logic as Join)
  const getPasswordStrength = () => {
    const validations = Object.values(passwordValidation);
    const passed = validations.filter(Boolean).length;
    if (passed === 5) return { level: "Strong", color: "status-green" };
    if (passed >= 3) return { level: "Moderate", color: "status-yellow" };
    return { level: "Weak", color: "status-red" };
  };

  const submitUsername = async () => {
    setError("");
    if (!username) return setError("Please enter your username");
    setLoading(true);
    try {
      const res = await authService.requestRecovery(username);
      setUserId(res.userId);
      setQuestionId(res.questionId);
      setQuestion(res.question);
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Unable to start recovery");
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    setError("");
    if (!answer) return setError("Please provide an answer");
    setLoading(true);
    try {
      const res = await authService.verifyRecovery({
        userId,
        questionId,
        answer,
      });
      setToken(res.token);
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async () => {
    setError("");
    if (!isPasswordValid) {
      // prioritize password requirements message; clear confirm mismatch
      setPasswordInvalidOnSubmit(true);
      setPasswordError(true);
      setConfirmPasswordError(false);
      return setError("Password requirements not met");
    }
    if (newPassword !== confirmPassword) {
      // only show mismatch after user attempts submit
      setPasswordInvalidOnSubmit(false);
      setConfirmPasswordError(true);
      // If confirm is empty, show a specific prompt; otherwise clear global error so message renders once (confirm-only)
      if (!confirmPassword || !confirmPassword.trim()) {
        setError("Please confirm your password");
      } else {
        setError("");
      }
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword({ userId, token, newPassword });
      navigate("/login");
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="container">
          <div className="login-logo">
            <div className="logo-row">
              <div className="logo-mark">
                <span>W</span>
              </div>
              <h1 className="logo-title">Infinity Storage</h1>
            </div>
          </div>

          <div className="password-heading status-neutral text-center mb-2">
            Account recovery
          </div>
          <div className="form-space">
            {step === 1 && (
              <>
                <div className="form-group">
                  <label className="label">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError("");
                    }}
                    className={`input ${error ? "input-error" : ""}`}
                    placeholder=""
                  />
                  {error && <p className="error-text">{error}</p>}
                </div>

                <button
                  onClick={submitUsername}
                  disabled={loading}
                  className="btn btn-gradient liquid-btn"
                >
                  {loading ? "Please wait..." : "Continue"}
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="form-group">
                  <label className="label">Security question</label>
                  <div className="signed-in-as">
                    <p className="signed-in-username">{question}</p>
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Answer</label>
                  <div className="relative">
                    <input
                      type={showAnswer ? "text" : "password"}
                      value={answer}
                      onChange={(e) => {
                        setAnswer(e.target.value);
                        setError("");
                      }}
                      className={`input ${error ? "input-error" : ""}`}
                      placeholder=""
                    />
                    <button
                      type="button"
                      onClick={() => setShowAnswer((s) => !s)}
                      className="password-toggle"
                    >
                      {showAnswer ? (
                        <EyeOff className="icon" />
                      ) : (
                        <Eye className="icon" />
                      )}
                    </button>
                  </div>
                  {error && <p className="error-text">{error}</p>}
                </div>

                <button
                  onClick={submitAnswer}
                  disabled={loading}
                  className="btn btn-gradient liquid-btn"
                >
                  {loading ? "Please wait..." : "Verify"}
                </button>
              </>
            )}

            {step === 3 && (
              <>
                <div className="form-group">
                  <label className="label">New password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordTouched(true);
                        setPasswordInvalidOnSubmit(false);
                        setPasswordError(false);
                        setError("");
                      }}
                      className={`input input-has-right-icon ${passwordError || passwordInvalidOnSubmit ? "border-red-500" : ""}`}
                      placeholder=""
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((s) => !s)}
                      className="password-toggle"
                    >
                      {showNewPassword ? (
                        <EyeOff className="icon" />
                      ) : (
                        <Eye className="icon" />
                      )}
                    </button>
                  </div>

                  {(() => {
                    const baseClass = "status-line";
                    const requirements = [
                      "lowercase letter",
                      "uppercase letter",
                      "number",
                      "special character",
                    ];
                    let unmet: string[] = [];
                    if (!passwordValidation.hasLowercase)
                      unmet.push("lowercase letter");
                    if (!passwordValidation.hasUppercase)
                      unmet.push("uppercase letter");
                    if (!passwordValidation.hasNumber) unmet.push("number");
                    if (!passwordValidation.hasSpecial)
                      unmet.push("special character");

                    if (isPasswordValid) {
                      const strength = getPasswordStrength();
                      return (
                        <p className={`${baseClass} status-neutral`}>
                          Strength:{" "}
                          <span className={strength.color}>
                            {strength.level}
                          </span>
                        </p>
                      );
                    }

                    return (
                      <p className={`${baseClass} status-neutral`}>
                        Must contain:{" "}
                        {(unmet.length > 0 ? unmet : requirements).join(", ")}
                      </p>
                    );
                  })()}
                </div>

                <div className="form-group">
                  <label className="label">Confirm new password</label>
                  <div className="relative">
                    <input
                      type={showConfirmNewPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setConfirmPasswordError(false);
                        setError("");
                      }}
                      className={`input input-has-right-icon ${confirmPasswordError ? "border-red-500" : ""}`}
                      placeholder=""
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmNewPassword((s) => !s)}
                      className="password-toggle"
                    >
                      {showConfirmNewPassword ? (
                        <EyeOff className="icon" />
                      ) : (
                        <Eye className="icon" />
                      )}
                    </button>
                  </div>

                  {confirmPasswordError &&
                    !passwordInvalidOnSubmit &&
                    confirmPassword.trim() !== "" && (
                      <p className="status-line status-red">
                        Passwords do not match
                      </p>
                    )}

                  {error && <p className="status-line status-red">{error}</p>}
                </div>

                <button
                  onClick={submitNewPassword}
                  disabled={loading}
                  className="btn btn-gradient liquid-btn"
                >
                  {loading ? "Please wait..." : "Reset Password"}
                </button>
              </>
            )}

            <div className="link-center forgot-link">
              <Link to="/login" className="small-link">
                Back to Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="login-right">
        <div className="login-grid-overlay" />
      </div>
    </div>
  );
};
