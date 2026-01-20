import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Check } from "lucide-react";
import { X } from "lucide-react";
import { authService } from "../services/authService";
import { useAuth } from "../auth/AuthContext";
import { apiUrl } from "../config/api";
import "./css/Login.css";
import "./css/Join.css";
import SlidesCarousel from "../components/SlidesCarousel";

type SecurityQuestion = { question: string; answer: string };

const SECURITY_QUESTIONS: string[] = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the make of your first car?",
  "What's a memorable teacher's name?",
];

export const Join: React.FC = () => {
  const navigate = useNavigate();
  const { setPrivateKey } = useAuth();

  const [step, setStep] = useState<number>(1);
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available?: boolean;
    message?: string;
  }>({ checking: false });

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [securityQuestions, setSecurityQuestions] = useState<
    SecurityQuestion[]
  >([
    { question: "", answer: "" },
    { question: "", answer: "" },
    { question: "", answer: "" },
  ]);
  const [showAnswers, setShowAnswers] = useState<boolean[]>([
    false,
    false,
    false,
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // password validation helpers
  const passwordValidation = {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  // debounce username availability check
  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus({ checking: false, available: undefined, message: "" });
      return;
    }
    let mounted = true;
    setUsernameStatus((s) => ({
      ...s,
      checking: true,
      message: "Checking availability...",
    }));
    const t = setTimeout(async () => {
      try {
        const res = await authService.checkUsernameAvailability(username);
        if (!mounted) return;
        setUsernameStatus({
          checking: false,
          available: !!res.available,
          message: res.available
            ? "Username is available"
            : res.error || "Username is taken",
        });
      } catch (err) {
        if (!mounted) return;
        setUsernameStatus({
          checking: false,
          available: false,
          message: "Could not check username",
        });
      }
    }, 500);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [username]);

  const handleNext = () => {
    setError("");
    if (step === 1) {
      const trimmed = username.trim();
      if (!trimmed) {
        setError("Please enter your username");
        return;
      }
      if (usernameStatus.available === false) {
        setError("Please choose an available username");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (!isPasswordValid) {
        setError("Password does not meet all requirements");
        return;
      }
      setStep(3);
      return;
    }
  };

  const updateQuestion = (index: number, question: string) => {
    setSecurityQuestions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], question };
      return copy;
    });
  };

  const updateAnswer = (index: number, answer: string) => {
    setSecurityQuestions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], answer };
      return copy;
    });
  };

  const toggleShowAnswer = (index: number) => {
    setShowAnswers((prev) => {
      const copy = [...prev];
      copy[index] = !copy[index];
      return copy;
    });
  };

  // keep username textbox using the same input styles as password fields

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (step !== 3) {
      handleNext();
      return;
    }

    // final submit from step 3
    for (let i = 0; i < securityQuestions.length; i++) {
      if (!securityQuestions[i].question) {
        setError("Please select all security questions");
        return;
      }
      if (
        !securityQuestions[i].answer ||
        securityQuestions[i].answer.trim().length === 0
      ) {
        setError("Please answer all security questions");
        return;
      }
    }

    setLoading(true);
    try {
      const user = await authService.signup({
        username,
        password,
        securityQuestions,
      });
      authService.saveUser(user);

      // fetch privateKey (if server provides it)
      try {
        const res = await fetch(apiUrl(`/api/auth/profile?userId=${user.id}`));
        if (res.ok) {
          const data = await res.json();
          if (data.privateKey) setPrivateKey(data.privateKey);
        }
      } catch (err) {
        if (import.meta.env.DEV)
          console.warn("Could not load encryption key:", err);
      }

      navigate("/home");
    } catch (err: any) {
      setError(err.message || "Signup failed");
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

          <div className="form-space">
            <form onSubmit={handleSubmit} className="join-form">
              {step === 1 && (
                <div className="form-group">
                  <label className="label">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input"
                    placeholder=""
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9_-]+"
                  />
                  <p className="help-text">3–30 characters · letters, numbers, - and _</p>
                  {usernameStatus.message && (
                    <p className="status-line">
                      {usernameStatus.checking && (
                        <Loader2 className="loader-icon" />
                      )}
                      <span
                        className={
                          usernameStatus.checking
                            ? "status-yellow"
                            : usernameStatus.available
                            ? "status-green"
                            : "status-red"
                        }
                      >
                        {usernameStatus.message}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {step === 2 && (
                <>
                  <div className="form-group">
                    <label className="label">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input input-has-right-icon"
                        placeholder=""
                        required
                        minLength={8}
                      />
                      {password && (
                        <div className="right-icon-wrapper">
                          {isPasswordValid ? (
                            <Check className="right-icon right-icon-success" />
                          ) : (
                            <X className="right-icon right-icon-fail" />
                          )}
                        </div>
                      )}
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
                    <p className="help-text">
                      Password must be at least 8 characters long and include an
                      uppercase letter, a lowercase letter, a number, and a
                      special character.
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="label">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="input input-has-right-icon"
                        placeholder=""
                        required
                      />
                      {confirmPassword && (
                        <div className="right-icon-wrapper">
                          {confirmPassword === password ? (
                            <Check className="right-icon right-icon-success" />
                          ) : (
                            <X className="right-icon right-icon-fail" />
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="password-toggle"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="icon" />
                        ) : (
                          <Eye className="icon" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="link-center back-link-wrapper">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="back-link"
                    >
                      ← Back
                    </button>
                  </div>
                </>
              )}

              {step === 1 && (
                <button
                  type="submit"
                  className="btn btn-gradient liquid-btn"
                  disabled={loading || usernameStatus.checking}
                >
                  {loading ? "Checking..." : "Next"}
                </button>
              )}

              {step === 2 && (
                <button
                  type="submit"
                  className="btn btn-gradient liquid-btn"
                  disabled={loading || !isPasswordValid || password !== confirmPassword}
                >
                  {loading ? "Checking..." : "Next"}
                </button>
              )}

              {step === 3 && (
                <div className="account-section">
                  <div>
                    <p className="security-note">
                      Choose and answer 3 security questions to enable account
                      recovery.
                    </p>
                    <div className="space-y-3">
                      {securityQuestions.map((sq, idx) => (
                        <div key={idx} className="security-item">
                          <select
                            value={sq.question}
                            onChange={(e) => updateQuestion(idx, e.target.value)}
                            className="security-select"
                          >
                            <option value="">-- Select a question --</option>
                            {SECURITY_QUESTIONS.map((q) => (
                              <option key={q} value={q}>
                                {q}
                              </option>
                            ))}
                          </select>
                          <div className="relative">
                            <input
                              type={showAnswers[idx] ? "text" : "password"}
                              value={sq.answer}
                              onChange={(e) => updateAnswer(idx, e.target.value)}
                              placeholder="Answer"
                              className="security-input"
                            />
                            <button
                              type="button"
                              onClick={() => toggleShowAnswer(idx)}
                              className="eye-button"
                            >
                              {showAnswers[idx] ? (
                                <EyeOff className="eye-icon" />
                              ) : (
                                <Eye className="eye-icon" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="button-row">
                    <button
                      type="submit"
                      disabled={loading}
                      className={`btn-primary ${loading ? "btn-disabled" : ""}`}
                    >
                      {loading ? "Creating Account..." : "Create Account"}
                    </button>
                  </div>
                  <div className="link-center back-link-wrapper">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="back-link"
                    >
                      ← Back
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Right side - shared slides */}
      <SlidesCarousel />
    </div>
  );
};
