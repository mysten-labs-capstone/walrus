import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { authService } from '../services/authService';
import { useAuth } from '../auth/AuthContext';
import { apiUrl } from '../config/api';

export const Join: React.FC = () => {
  const navigate = useNavigate();
  const { setPrivateKey } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{ checking: boolean; available: boolean | null; message: string }>({
    checking: false, available: null, message: '',
  });

  const getPasswordValidation = () => {
    if (!password) return { hasMinLength: false, hasUppercase: false, hasLowercase: false, hasNumber: false, hasSpecial: false };
    return {
      hasMinLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
  };

  const passwordValidation = getPasswordValidation();
  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus({ checking: false, available: null, message: '' });
      return;
    }
    const timeoutId = setTimeout(async () => {
      setUsernameStatus({ checking: true, available: null, message: '' });
      const result = await authService.checkUsernameAvailability(username);
      if (result.error) {
        setUsernameStatus({ checking: false, available: false, message: result.error });
      } else if (result.available) {
        setUsernameStatus({ checking: false, available: true, message: '✓ Username available' });
      } else {
        setUsernameStatus({ checking: false, available: false, message: '✗ Username already taken' });
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setLoading(true);
    try {
      const user = await authService.signup({ username, password });
      authService.saveUser(user);
      
      // Fetch user's privateKey from server
      try {
        const res = await fetch(apiUrl(`/api/auth/profile?userId=${user.id}`));
        if (res.ok) {
          const data = await res.json();
          if (data.privateKey) {
            setPrivateKey(data.privateKey);
            console.log('✅ Loaded user encryption key');
          }
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

  const getUsernameBorderColor = () => {
    if (username.length < 3) return 'border-gray-300';
    if (usernameStatus.checking) return 'border-yellow-400';
    if (usernameStatus.available === true) return 'border-green-500';
    if (usernameStatus.available === false) return 'border-red-500';
    return 'border-gray-300';
  };

  const getUsernameIcon = () => {
    if (username.length < 3) return null;
    if (usernameStatus.checking) return <span className="text-yellow-500 text-sm">⏳ Checking...</span>;
    // Status messages are shown below the input field
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navbar />
      <div className="container mx-auto px-6 py-12 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-2">Join Walrus</h1>
          <p className="text-gray-600 text-center mb-8">Create your account to get started</p>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                className={`w-full px-4 py-3 border ${getUsernameBorderColor()} rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors`}
                placeholder="Choose a username" required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_-]+" />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-gray-500">3-30 characters, letters, numbers, - and _ only</p>
                {getUsernameIcon()}
              </div>
              {usernameStatus.message && (
                <p className={`text-sm mt-1 ${usernameStatus.available ? 'text-green-600' : 'text-red-600'}`}>
                  {usernameStatus.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Create a strong password" required minLength={8} />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
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
                <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Re-enter your password" required />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && <p className="text-sm text-red-600 mt-1">✗ Passwords do not match</p>}
              {confirmPassword && password === confirmPassword && <p className="text-sm text-green-600 mt-1">✓ Passwords match</p>}
            </div>
            <button type="submit" disabled={loading || usernameStatus.checking || usernameStatus.available === false || !isPasswordValid}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-gray-600">Already have an account? <Link to="/login" className="text-indigo-600 font-semibold hover:text-indigo-700">Login</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
};