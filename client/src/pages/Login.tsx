import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../config/api';
import { authService } from '../services/authService';
import './css/Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isShowingSlide, setIsShowingSlide] = useState(true);
  const currentSlideRef = useRef(currentSlide);
  const [step, setStep] = useState<'username' | 'password'>('username');
  const navigate = useNavigate();

  useEffect(() => {
    const id = setInterval(() => {
      changeSlideTo((currentSlideRef.current + 1) % slides.length);
    }, 7000);
    return () => clearInterval(id);
  }, []);

  function wait(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  const changeSlideTo = async (target: number) => {
    const fadeDuration = 900;
    const blankDuration = 600;
    if (target === currentSlideRef.current) return;
    setIsShowingSlide(false);
    await wait(fadeDuration);
    // blank gap
    await wait(blankDuration);
    setCurrentSlide(target);
    currentSlideRef.current = target;
    // small delay to ensure DOM updates
    await wait(30);
    setIsShowingSlide(true);
  };

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError('Please enter your username');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch(apiUrl(`/api/auth/check-username?username=${encodeURIComponent(username.trim())}`));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Unable to verify username');
        return;
      }
      const data = await res.json();
      // server returns available === true when username is NOT taken
      if (data.available) {
        setError('No username found');
        return;
      }
      setStep('password');
    } catch (err) {
      console.error('Username check failed', err);
      setError('Unable to verify username');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await authService.login({ username: username.trim(), password });
      authService.saveUser(user);
      navigate('/home/upload');
    } catch (err: any) {
      console.error('Login failed', err);
      setError(err?.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const slides = [
    {
      title: 'No vendor lock‑in',
      subtitle: 'Keep control of your backups',
      description: 'Avoid provider shutdowns, price hikes, and policy changes that trap your data.',
    },
    {
      title: 'Designed for long‑term access',
      subtitle: 'Durable and portable backups',
      description: 'Store backups in a way that remains accessible and auditable over time.',
    },
    {
      title: 'Privacy-first security',
      subtitle: 'End-to-end encryption by default',
      description: 'Strong client-side encryption keeps your data private from providers and regulators.',
    },
    {
      title: 'Simple secure sharing',
      subtitle: 'Expiring links with duration control',
      description: 'Share files with time-limited links — easy, auditable, and revocable.',
    },
  ];

  return (
    <div className="login-page">
      {/* Left side - Login Form */}
      <div className="login-left">
        <div className="container">
          {/* Logo */}
          <div className="login-logo">
            <div className="logo-row">
              <div className="logo-mark">
                <span>W</span>
              </div>
              <h1 className="logo-title">Infinity Storage</h1>
            </div>
          </div>

          {/* Form */}
          <div className="form-space">
            {/* Username Step */}
            {step === 'username' && (
              <>
                <div className="form-group">
                  <label className="label">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError('');
                    }}
                    className={`input ${error ? 'input-error' : ''}`}
                    required
                  />
                  {error && <p className="error-text">{error}</p>}
                </div>

                <button onClick={handleNext} className="btn btn-gradient">
                  Next
                </button>
              </>
            )}

            {/* Password Step */}
            {step === 'password' && (
              <>
                <div className="form-group">
                  <label className="label">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input"
                  />
                </div>

                <div className="form-group">
                  <label className="label">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="password-toggle"
                    >
                      {showPassword ? <EyeOff className="icon" /> : <Eye className="icon" />}
                    </button>
                  </div>
                </div>

                {error && <div className="alert">{error}</div>}

                <button onClick={handleLogin} disabled={loading} className="btn btn-gradient">
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>

                <div className="link-center back-link-wrapper">
                  <button type="button" onClick={() => setStep('username')} className="back-link">
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
                Don't have an account?{' '}
                <a href="/join" className="small-link">
                  Join now
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Carousel */}
      <div className="login-right">
        <div className="login-grid-overlay" />

        <div className="carousel-wrap">
          <div className="relative">
            <div key={currentSlide} className={`slide ${isShowingSlide ? 'visible' : 'hidden'}`}>
              <div className="slide-card">
                <div style={{textAlign:'center', marginTop:'2rem'}}>
                  <h2 className="slide-title">{slides[currentSlide].title}</h2>
                  <h3 className="slide-subtitle">{slides[currentSlide].subtitle}</h3>
                  <p className="slide-desc">{slides[currentSlide].description}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Dots indicator (anchored to .login-right) */}
        <div className="dots">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => changeSlideTo(index)}
              className={`dot ${index === currentSlide ? 'active' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}