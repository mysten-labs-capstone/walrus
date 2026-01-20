import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Navbar } from "../components/Navbar";
import { authService } from "../services/authService";
import { useAuth } from "../auth/AuthContext";
import { apiUrl } from "../config/api";
import "./css/Join.css";

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
    if (usernameStatus.available === false) {
      setError("Please choose an available username");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!isPasswordValid) {
      setError("Password does not meet all requirements");
      return;
    }
    setStep(2);
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

  const getUsernameBorderColor = () => {
    if (username.length < 3) return "username-border-default";
    if (usernameStatus.checking) return "username-border-checking";
    if (usernameStatus.available === true) return "username-border-available";
    if (usernameStatus.available === false) return "username-border-taken";
    return "username-border-default";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (step === 1) return handleNext();

    // final submit from step 2
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
    <div className="join-page">
      <Navbar />
      <div className="join-wrapper">
        <div className="join-card">
          <h1 className="join-title">Join Walrus</h1>
          <p className="join-subtitle">Create your account to get started</p>

          <form onSubmit={handleSubmit} className="join-form">
            <div className="join-step-row">
              <div className="join-step-title">
                {step === 1 ? "Account" : "Security Questions"}
              </div>
              <div className="join-step-count">Step {step} of 2</div>
            </div>

            {step === 1 && (
              <div className="account-section">
                <div>
                  <label className="label">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`input-base ${getUsernameBorderColor()}`}
                    placeholder="Choose a username"
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9_-]+"
                  />
                  <div className="help-text">
                    <p>3-30 characters, letters, numbers, - and _ only</p>
                  </div>
                  {usernameStatus.message && (
                    <p className="status-line">
                      {usernameStatus.checking ? (
                        <Loader2 className="loader-icon" />
                      ) : usernameStatus.available ? (
                        <span className="status-green">✓</span>
                      ) : (
                        <span className="status-red">✗</span>
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

                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-base input-with-icon"
                      placeholder="Create a strong password"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="eye-button"
                    >
                      {showPassword ? (
                        <EyeOff className="eye-icon" />
                      ) : (
                        <Eye className="eye-icon" />
                      )}
                    </button>
                  </div>

                  {password && (
                    <div className="password-check">
                      <div
                        className={`password-check-item ${passwordValidation.hasMinLength ? "passed" : ""}`}
                      >
                        <span>
                          {passwordValidation.hasMinLength ? "✓" : "○"}
                        </span>
                        <span>At least 8 characters</span>
                      </div>
                      <div
                        className={`password-check-item ${passwordValidation.hasUppercase ? "passed" : ""}`}
                      >
                        <span>
                          {passwordValidation.hasUppercase ? "✓" : "○"}
                        </span>
                        <span>One uppercase letter</span>
                      </div>
                      <div
                        className={`password-check-item ${passwordValidation.hasLowercase ? "passed" : ""}`}
                      >
                        <span>
                          {passwordValidation.hasLowercase ? "✓" : "○"}
                        </span>
                        <span>One lowercase letter</span>
                      </div>
                      <div
                        className={`password-check-item ${passwordValidation.hasNumber ? "passed" : ""}`}
                      >
                        <span>{passwordValidation.hasNumber ? "✓" : "○"}</span>
                        <span>One number</span>
                      </div>
                      <div
                        className={`password-check-item ${passwordValidation.hasSpecial ? "passed" : ""}`}
                      >
                        <span>{passwordValidation.hasSpecial ? "✓" : "○"}</span>
                        <span>One special character (!@#$%^&*...)</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="label">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input-base input-with-icon"
                      placeholder="Re-enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="eye-button"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="eye-icon" />
                      ) : (
                        <Eye className="eye-icon" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="status-message status-red">
                      ✗ Passwords do not match
                    </p>
                  )}
                  {confirmPassword && password === confirmPassword && (
                    <p className="status-message status-green">
                      ✓ Passwords match
                    </p>
                  )}
                </div>

                <div className="button-row">
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={
                      loading ||
                      usernameStatus.checking ||
                      usernameStatus.available === false ||
                      !isPasswordValid
                    }
                    className={`btn-primary ${loading || usernameStatus.checking || usernameStatus.available === false || !isPasswordValid ? "btn-disabled" : ""}`}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
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
                    type="button"
                    onClick={() => setStep(1)}
                    disabled={loading}
                    className={`btn-secondary ${loading ? "btn-disabled" : ""}`}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className={`btn-primary ${loading ? "btn-disabled" : ""}`}
                  >
                    {loading ? "Creating Account..." : "Create Account"}
                  </button>
                </div>
              </div>
            )}

            {error && <div className="error-box">{error}</div>}
          </form>

          <div className="footer-text">
            <p className="text-gray-600">
              Already have an account?{" "}
              <Link to="/login" className="link">
                Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
