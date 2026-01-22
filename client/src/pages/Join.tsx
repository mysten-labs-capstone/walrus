import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordInvalidOnSubmit, setPasswordInvalidOnSubmit] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState(false);
  const [buttonError, setButtonError] = useState("");

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
  const [currentSecurityQuestion, setCurrentSecurityQuestion] = useState(0);
  const [loading, setLoading] = useState(false);

  // Progressive reveal for security questions
  useEffect(() => {
    if (currentSecurityQuestion < 2 && securityQuestions[currentSecurityQuestion].question && securityQuestions[currentSecurityQuestion].answer.trim()) {
      const timer = setTimeout(() => {
        setCurrentSecurityQuestion(currentSecurityQuestion + 1);
      }, 400); // 400ms delay
      return () => clearTimeout(timer);
    }
  }, [securityQuestions, currentSecurityQuestion]);
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

  // password strength
  const getPasswordStrength = () => {
    const validations = Object.values(passwordValidation);
    const passed = validations.filter(Boolean).length;
    if (passed === 5) return { level: 'Strong', color: 'status-green' };
    if (passed >= 3) return { level: 'Moderate', color: 'status-yellow' };
    return { level: 'Weak', color: 'status-red' };
  };

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
      setButtonError("");
      setPasswordError(false);
      setConfirmPasswordError(false);

      if (!password.trim()) {
        setPasswordError(true);
      }

      if (!password.trim() && !confirmPassword.trim()) {
        setButtonError("Enter a password");
        return;
      } else if (!password.trim()) {
        setButtonError("Please enter a password");
        return;
      } else if (!confirmPassword.trim()) {
        if (password.trim() && !isPasswordValid) {
          setButtonError("Password requirements not met");
          setPasswordError(true);
          return;
        } else {
          setButtonError("Please confirm your password");
          setConfirmPasswordError(true);
          return;
        }
      }

      if (!isPasswordValid) {
        setButtonError("Password doesn’t meet requirements");
        setPasswordError(true);
        return;
      }

      if (password !== confirmPassword) {
        setButtonError("Passwords do not match");
        setConfirmPasswordError(true);
        return;
      }
      // valid - clear any submit-invalid flag
      setPasswordInvalidOnSubmit(false);
      setButtonError("");
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

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
    }
  };

  const toggleShowAnswer = (index: number) => {
    setShowAnswers((prev) => {
      const copy = [...prev];
      copy[index] = !copy[index];
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (step !== 3) {
      handleNext();
      return;
    }

    // final submit from step 3
    for (let i = 0; i < securityQuestions.length; i++) {
      if (!securityQuestions[i].question || !securityQuestions[i].answer.trim()) {
        setError("Please complete all security questions");
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
            <form noValidate onSubmit={handleSubmit} className="join-form">
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
                  <p className="status-line status-neutral">
                    3–30 characters · letters, numbers, – and _
                  </p>
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
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setPasswordTouched(true);
                          setPasswordInvalidOnSubmit(false);
                          setPasswordError(false);
                          setButtonError("");
                          setError("");
                        }}
                        className={`input input-has-right-icon ${passwordError ? 'border-red-500' : ''}`}
                        placeholder=""
                        minLength={8}
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
                    {/* Password status: green when valid, red messages only on submit */}
                    {(() => {
                      const baseClass = "status-line";
                      const requirements = [
                        "lowercase letter",
                        "uppercase letter",
                        "number",
                        "special character",
                      ];
                      let unmet = [];
                      if (!passwordValidation.hasLowercase)
                        unmet.push("lower");
                      if (!passwordValidation.hasUppercase)
                        unmet.push("upper");
                      if (!passwordValidation.hasNumber) unmet.push("number");
                      if (!passwordValidation.hasSpecial)
                        unmet.push("symbol");

                      if (isPasswordValid) {
                        const strength = getPasswordStrength();
                        return (
                          <p className={`${baseClass} status-neutral`}>
                            Strength: <span className={strength.color}>{strength.level}</span>
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
                    <label className="label">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setConfirmPasswordError(false);
                          setButtonError("");
                        }}
                        className={`input input-has-right-icon ${confirmPasswordError ? 'border-red-500' : ''}`}
                        placeholder=""
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="password-toggle"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="icon" />
                        ) : (
                          <Eye className="icon" />
                        )}
                      </button>
                    </div>
                    {/* Password match checker */}
                    {buttonError && (
                      <p className="status-line status-red">
                        {buttonError}
                      </p>
                    )}
                  </div>
                </>
              )}

              {step === 1 && (
                <button
                  type="submit"
                  className="btn btn-gradient liquid-btn"
                  disabled={loading || usernameStatus.checking || usernameStatus.available === false}
                >
                  {loading ? "Checking..." : "Next"}
                </button>
              )}

              {step === 2 && (
                <button
                  type="submit"
                  className="btn btn-gradient liquid-btn"
                  disabled={loading}
                >
                  {loading ? "Checking..." : "Next"}
                </button>
              )}

              {step === 2 && (
                <div className="link-center back-link-wrapper">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="back-link"
                  >
                    ← Back
                  </button>
                </div>
              )}

              {step === 3 && (
                <>
                  <p className="status-line status-neutral">
                    For account recovery
                  </p>

                  {[0, 1, 2].map((idx) => (
                    idx <= currentSecurityQuestion ? (
                      <div key={idx} className="form-group fade-in">
                        <label className="label">Security Question {idx + 1}</label>
                      <select
                        value={securityQuestions[idx].question}
                        onChange={(e) => updateQuestion(idx, e.target.value)}
                        className="input"

                      >
                        <option value="">-- Select a question --</option>
                        {SECURITY_QUESTIONS.filter(q => !securityQuestions.some((sq, i) => i !== idx && sq.question === q)).map((q) => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ))}
                      </select>
                      <div className="relative">
                        <input
                          type={showAnswers[idx] ? "text" : "password"}
                          value={securityQuestions[idx].answer}
                          onChange={(e) => updateAnswer(idx, e.target.value)}
                          placeholder="Answer"
                          className="input input-with-icon"

                        />
                        <button
                          type="button"
                          onClick={() => toggleShowAnswer(idx)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"

                        >
                          {showAnswers[idx] ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                      </div>
                    ) : null
                  ))}

                  {currentSecurityQuestion >= 2 && (
                    <>
                      {error && <p className="error-message">{error}</p>}
                      <button
                        type="submit"
                        className="btn btn-gradient liquid-btn"
                        disabled={loading}
                      >
                        {loading ? "Creating Account..." : "Create Account"}
                      </button>
                    </>
                  )}

                  <div className="link-center back-link-wrapper">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="back-link"
                    >
                      ← Back
                    </button>
                  </div>
                </>
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
