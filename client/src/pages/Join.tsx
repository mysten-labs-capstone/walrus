import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { authService } from '../services/authService';
import { useAuth } from '../auth/AuthContext';
import { apiUrl } from '../config/api';

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
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<{ checking: boolean; available?: boolean; message?: string }>({ checking: false });

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [securityQuestions, setSecurityQuestions] = useState<SecurityQuestion[]>([
    { question: '', answer: '' },
    { question: '', answer: '' },
    { question: '', answer: '' },
  ]);
  const [showAnswers, setShowAnswers] = useState<boolean[]>([false, false, false]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      setUsernameStatus({ checking: false, available: undefined, message: '' });
      return;
    }
    let mounted = true;
    setUsernameStatus((s) => ({ ...s, checking: true, message: 'Checking availability...' }));
    const t = setTimeout(async () => {
      try {
        const res = await authService.checkUsernameAvailability(username);
        if (!mounted) return;
        setUsernameStatus({ checking: false, available: !!res.available, message: res.available ? 'Username is available' : res.error || 'Username is taken' });
      } catch (err) {
        if (!mounted) return;
        setUsernameStatus({ checking: false, available: false, message: 'Could not check username' });
      }
    }, 500);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [username]);

  const handleNext = () => {
    setError('');
    if (usernameStatus.available === false) {
      setError('Please choose an available username');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!isPasswordValid) {
      setError('Password does not meet all requirements');
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
    if (username.length < 3) return 'border-gray-300';
    if (usernameStatus.checking) return 'border-yellow-400';
    if (usernameStatus.available === true) return 'border-green-500';
    if (usernameStatus.available === false) return 'border-red-500';
    return 'border-gray-300';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (step === 1) return handleNext();

    // final submit from step 2
    for (let i = 0; i < securityQuestions.length; i++) {
      if (!securityQuestions[i].question) {
        setError('Please select all security questions');
        return;
      }
      if (!securityQuestions[i].answer || securityQuestions[i].answer.trim().length === 0) {
        setError('Please answer all security questions');
        return;
      }
    }

    setLoading(true);
    try {
      const user = await authService.signup({ username, password, securityQuestions });
      authService.saveUser(user);

      // fetch privateKey (if server provides it)
      try {
        const res = await fetch(apiUrl(`/api/auth/profile?userId=${user.id}`));
        if (res.ok) {
          const data = await res.json();
          if (data.privateKey) setPrivateKey(data.privateKey);
        }
      } catch (err) {
        console.warn('Could not load encryption key:', err);
      }

      navigate('/home');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navbar />
      <div className="container mx-auto px-6 py-12 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-2">Join Walrus</h1>
          <p className="text-gray-600 text-center mb-8">Create your account to get started</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-base font-semibold text-gray-700">{step === 1 ? 'Account' : 'Security Questions'}</div>
              <div className="text-sm font-medium">Step {step} of 2</div>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`w-full px-4 py-3 border ${getUsernameBorderColor()} rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors`}
                    placeholder="Choose a username"
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9_-]+"
                  />
                  <div className="mt-2">
                    <p className="text-xs text-gray-500">3-30 characters, letters, numbers, - and _ only</p>
                  </div>
                  {usernameStatus.message && (
                    <p className="text-sm mt-1 flex items-center gap-2">
                      {usernameStatus.checking ? (
                        <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                      ) : usernameStatus.available ? (
                        <span className="text-green-500">✓</span>
                      ) : (
                        <span className="text-red-500">✗</span>
                      )}
                      <span className={usernameStatus.checking ? 'text-yellow-600' : usernameStatus.available ? 'text-green-600' : 'text-red-600'}>
                        {usernameStatus.message}
                      </span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Create a strong password"
                      required
                      minLength={8}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  {password && (
                    <div className="mt-2 space-y-1 text-xs">
                      <div className={`flex items-center gap-1 ${passwordValidation.hasMinLength ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordValidation.hasMinLength ? '✓' : '○'}</span>
                        <span>At least 8 characters</span>
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.hasUppercase ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordValidation.hasUppercase ? '✓' : '○'}</span>
                        <span>One uppercase letter</span>
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.hasLowercase ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordValidation.hasLowercase ? '✓' : '○'}</span>
                        <span>One lowercase letter</span>
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.hasNumber ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordValidation.hasNumber ? '✓' : '○'}</span>
                        <span>One number</span>
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.hasSpecial ? 'text-green-600' : 'text-gray-500'}`}>
                        <span>{passwordValidation.hasSpecial ? '✓' : '○'}</span>
                        <span>One special character (!@#$%^&*...)</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Re-enter your password"
                      required
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && <p className="text-sm text-red-600 mt-1">✗ Passwords do not match</p>}
                  {confirmPassword && password === confirmPassword && <p className="text-sm text-green-600 mt-1">✓ Passwords match</p>}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={loading || usernameStatus.checking || usernameStatus.available === false || !isPasswordValid}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 mb-2">Choose and answer 3 security questions to enable account recovery.</p>
                  <div className="space-y-3">
                    {securityQuestions.map((sq, idx) => (
                      <div key={idx} className="grid grid-cols-1 gap-2">
                        <select value={sq.question} onChange={(e) => updateQuestion(idx, e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                          <option value="">-- Select a question --</option>
                          {SECURITY_QUESTIONS.map((q) => (
                            <option key={q} value={q}>{q}</option>
                          ))}
                        </select>
                        <div className="relative">
                          <input
                            type={showAnswers[idx] ? 'text' : 'password'}
                            value={sq.answer}
                            onChange={(e) => updateAnswer(idx, e.target.value)}
                            placeholder="Answer"
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                          <button type="button" onClick={() => toggleShowAnswer(idx)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                            {showAnswers[idx] ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(1)} disabled={loading}
                    className="flex-1 bg-gray-100 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors">Back</button>
                  <button type="submit" disabled={loading}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{loading ? 'Creating Account...' : 'Create Account'}</button>
                </div>
              </div>
            )}

            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4 text-red-700 text-sm">{error}</div>}
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">Already have an account? <Link to="/login" className="text-indigo-600 font-semibold hover:text-indigo-700">Login</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
};