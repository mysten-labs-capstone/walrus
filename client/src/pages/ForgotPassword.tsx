import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { authService } from '../services/authService';

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<number>(1);
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
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
    setError('');
    if (!username) return setError('Please enter your username');
    setLoading(true);
    try {
      const res = await authService.requestRecovery(username);
      setUserId(res.userId);
      setQuestionId(res.questionId);
      setQuestion(res.question);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Unable to start recovery');
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    setError('');
    if (!answer) return setError('Please provide an answer');
    setLoading(true);
    try {
      const res = await authService.verifyRecovery({ userId, questionId, answer });
      setToken(res.token);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async () => {
    setError('');
    if (!isPasswordValid) return setError('Password does not meet all requirements');
    if (newPassword !== confirmPassword) return setError('Passwords do not match');
    setLoading(true);
    try {
      await authService.resetPassword({ userId, token, newPassword });
      navigate('/login');
    } catch (err: any) {
      setError(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navbar />
      <div className="container mx-auto px-6 py-12 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-center mb-4">Password recovery</h1>

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Enter the username for the account you want to recover.</p>
              <input className="w-full px-3 py-2 border rounded-lg" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
              <button onClick={submitUsername} disabled={loading} className="w-full bg-indigo-600 text-white py-2 rounded-lg">{loading ? 'Please wait...' : 'Continue'}</button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Answer the security question below.</p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm font-medium">{question}</p>
              </div>
              <div className="relative">
                <input
                  type={showAnswer ? 'text' : 'password'}
                  className="w-full px-3 py-2 border rounded-lg"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Answer"
                />
                <button
                  type="button"
                  onClick={() => setShowAnswer((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showAnswer ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <button onClick={submitAnswer} disabled={loading} className="w-full bg-indigo-600 text-white py-2 rounded-lg">{loading ? 'Please wait...' : 'Verify'}</button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Set a new password for your account.</p>
              <p className="text-xs text-gray-500">Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.</p>
              <div className="relative">
                <input type={showNewPassword ? 'text' : 'password'} className="w-full px-3 py-2 border rounded-lg" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {newPassword && (
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
              <div className="relative">
                <input type={showConfirmNewPassword ? 'text' : 'password'} className="w-full px-3 py-2 border rounded-lg" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
                <button
                  type="button"
                  onClick={() => setShowConfirmNewPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && <p className="text-sm text-red-600 mt-1">✗ Passwords do not match</p>}
              {confirmPassword && newPassword === confirmPassword && <p className="text-sm text-green-600 mt-1">✓ Passwords match</p>}
              <button onClick={submitNewPassword} disabled={loading} className="w-full bg-indigo-600 text-white py-2 rounded-lg">{loading ? 'Please wait...' : 'Reset Password'}</button>
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4 text-red-700 text-sm">{error}</div>}

          <div className="mt-6 text-center">
            <p className="text-gray-600">Remembered your password? <Link to="/login" className="text-indigo-600 font-semibold">Sign in</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
};
