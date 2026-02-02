import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './css/Landing.css';

// ============================================
// INTRO LOADER - File Upload Animation
// ============================================
const IntroLoader: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState(0);
  const [phase, setPhase] = useState<'uploading' | 'complete' | 'fade'>('uploading');
  const files = ['contracts.pdf', 'photos.zip', 'backup.tar', 'secrets.key'];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setPhase('complete');
          setTimeout(() => setPhase('fade'), 400);
          setTimeout(onComplete, 900);
          return 100;
        }
        if (prev === 25 || prev === 50 || prev === 75) {
          setCurrentFile(f => Math.min(f + 1, files.length - 1));
        }
        return prev + 1;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [onComplete, files.length]);

  return (
    <div className={`intro-loader ${phase}`}>
      <div className="intro-grid-bg">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="grid-line-h" style={{ top: `${i * 5}%` }} />
        ))}
        {[...Array(20)].map((_, i) => (
          <div key={i} className="grid-line-v" style={{ left: `${i * 5}%` }} />
        ))}
      </div>
      
      <div className="intro-content">
        {/* Animated File Stack */}
        <div className="file-stack">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`stacked-file file-${i}`} style={{ animationDelay: `${i * 0.1}s` }}>
              <svg viewBox="0 0 60 75" className="file-svg">
                <defs>
                  <linearGradient id={`stackGrad${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4da2ff" />
                    <stop offset="100%" stopColor="#0066ff" />
                  </linearGradient>
                </defs>
                <path d="M5 0 L40 0 L55 15 L55 70 C55 73 52 75 50 75 L5 75 C2 75 0 73 0 70 L0 5 C0 2 2 0 5 0 Z" 
                      fill={`url(#stackGrad${i})`} opacity={1 - i * 0.25} />
                <path d="M40 0 L40 15 L55 15 Z" fill="#003388" opacity={0.8 - i * 0.2} />
                <rect x="10" y="25" width="30" height="3" rx="1" fill="rgba(255,255,255,0.5)" />
                <rect x="10" y="32" width="22" height="3" rx="1" fill="rgba(255,255,255,0.3)" />
                <rect x="10" y="39" width="26" height="3" rx="1" fill="rgba(255,255,255,0.3)" />
              </svg>
            </div>
          ))}
          
          {/* Upload arrow animation */}
          <div className="upload-arrow">
            <svg viewBox="0 0 40 60" className="arrow-svg">
              <path d="M20 55 L20 10 M5 25 L20 5 L35 25" stroke="#4da2ff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          
          {/* Particle effects */}
          <div className="upload-particles">
            {[...Array(16)].map((_, i) => (
              <div key={i} className="upload-particle" style={{ 
                animationDelay: `${i * 0.1}s`,
                left: `${30 + Math.random() * 40}%`,
              }} />
            ))}
          </div>
        </div>

        {/* Text */}
        <div className="intro-text">
          <div className="uploading-label">
            <span className="upload-icon">↑</span>
            <span className="uploading-text">UPLOADING</span>
          </div>
          <div className="file-name-container">
            <span className="file-name">{files[currentFile]}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="progress-section">
          <div className="progress-bar">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }}>
                <div className="progress-shimmer" />
              </div>
            </div>
            <div className="progress-markers">
              {[25, 50, 75, 100].map(mark => (
                <div key={mark} className={`marker ${progress >= mark ? 'active' : ''}`} style={{ left: `${mark}%` }} />
              ))}
            </div>
          </div>
          <div className="progress-info">
            <span className="progress-percent">{progress}%</span>
            <span className="progress-status">{progress < 100 ? 'Encrypting & distributing...' : 'Secured!'}</span>
          </div>
        </div>

        <div className="intro-footer">
          <span>Powered by</span>
          <div className="powered-logos">
            <span className="sui-logo">◎ Sui</span>
            <span className="walrus-logo">🦭 Walrus</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// SCROLL HIGHLIGHT TEXT - Sui-style
// ============================================
const ScrollHighlightText: React.FC = () => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const sectionTop = rect.top;
      const sectionHeight = rect.height;
      
      if (sectionTop < windowHeight && sectionTop > -sectionHeight) {
        const progress = Math.min(1, Math.max(0, (windowHeight - sectionTop) / (windowHeight + sectionHeight * 0.5)));
        setScrollProgress(progress);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const words = [
    { text: "The only platform where your ", highlight: false },
    { text: "files", highlight: true, icon: "📁" },
    { text: ", ", highlight: false },
    { text: "encryption keys", highlight: true, icon: "🔐" },
    { text: ", and ", highlight: false },
    { text: "access controls", highlight: true, icon: "👤" },
    { text: " are truly owned by you. The result? ", highlight: false },
    { text: "Unbreakable security", highlight: true, icon: "🛡️" },
    { text: ", ", highlight: false },
    { text: "zero trust required", highlight: true, icon: "✓" },
    { text: ", and ", highlight: false },
    { text: "data that's protected, not exploited.", highlight: true, icon: "💎" },
  ];

  return (
    <div ref={sectionRef} className="scroll-highlight-section">
      <div className="highlight-label">The future of file storage</div>
      <div className="highlight-text">
        {words.map((word, i) => {
          const wordProgress = Math.min(1, Math.max(0, (scrollProgress * words.length - i) * 2));
          return (
            <span 
              key={i} 
              className={`highlight-word ${word.highlight ? 'highlightable' : ''}`}
              style={{ 
                opacity: word.highlight ? 0.3 + wordProgress * 0.7 : 1,
                background: word.highlight && wordProgress > 0.5 ? '#4da2ff' : 'transparent',
                color: word.highlight && wordProgress > 0.5 ? '#000' : (word.highlight ? 'rgba(255,255,255,0.4)' : '#fff'),
              }}
            >
              {word.highlight && word.icon && wordProgress > 0.5 && (
                <span className="word-icon">{word.icon}</span>
              )}
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// FILE FLOW CARD - Expands like Sui's cards
// ============================================
const FileFlowCard: React.FC<{
  number: string;
  title: string;
  description: string;
  features: string[];
  delay: number;
  icon: React.ReactNode;
}> = ({ number, title, description, features, delay, icon }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
          setTimeout(() => setIsExpanded(true), delay + 400);
        }
      },
      { threshold: 0.2 }
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={cardRef} className={`file-flow-card ${isVisible ? 'visible' : ''} ${isExpanded ? 'expanded' : ''}`}>
      {/* Left connector line */}
      <div className="card-timeline">
        <div className="timeline-line" />
        <div className="timeline-dot">
          <div className="dot-inner" />
        </div>
        <div className="timeline-line-bottom" />
      </div>
      
      {/* Card content */}
      <div className="card-main">
        <div className="card-header">
          <span className="card-number">{number}</span>
          <span className="card-title">{title}</span>
        </div>
        
        <div className="card-expanded-content">
          <div className="card-left">
            <div className="card-icon-wrap">{icon}</div>
            <p className="card-description">{description}</p>
            <div className="card-features">
              {features.map((f, i) => (
                <div key={i} className="feature-row" style={{ animationDelay: `${delay + 600 + i * 100}ms` }}>
                  <span className="feature-bullet">→</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="card-visual">
            <svg viewBox="0 0 240 180" className="visual-svg">
              <defs>
                <linearGradient id={`vg${number}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4da2ff" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#4da2ff" stopOpacity="0.1" />
                </linearGradient>
              </defs>
              {/* Isometric grid layers */}
              <g transform="translate(120, 50)">
                <polygon points="0,0 80,40 0,80 -80,40" fill="none" stroke="#4da2ff" strokeWidth="1" opacity="0.2" className="grid-layer l1" />
                <polygon points="0,20 80,60 0,100 -80,60" fill="none" stroke="#4da2ff" strokeWidth="1" opacity="0.15" className="grid-layer l2" />
                <polygon points="0,40 80,80 0,120 -80,80" fill="none" stroke="#4da2ff" strokeWidth="1" opacity="0.1" className="grid-layer l3" />
                {/* Connection lines */}
                <line x1="-40" y1="20" x2="40" y2="60" stroke="#4da2ff" strokeWidth="2" className="conn-line c1" />
                <line x1="40" y1="20" x2="-40" y2="60" stroke="#4da2ff" strokeWidth="2" className="conn-line c2" />
                {/* Nodes */}
                <circle cx="0" cy="0" r="6" fill="#4da2ff" className="node n1" />
                <circle cx="80" cy="40" r="4" fill="#4da2ff" className="node n2" />
                <circle cx="0" cy="80" r="4" fill="#4da2ff" className="node n3" />
                <circle cx="-80" cy="40" r="4" fill="#4da2ff" className="node n4" />
                {/* Center file icon */}
                <g transform="translate(-15, 30)">
                  <rect x="0" y="0" width="30" height="38" rx="3" fill={`url(#vg${number})`} stroke="#4da2ff" strokeWidth="1" />
                  <rect x="5" y="10" width="20" height="2" fill="#4da2ff" opacity="0.5" />
                  <rect x="5" y="15" width="15" height="2" fill="#4da2ff" opacity="0.3" />
                  <rect x="5" y="20" width="18" height="2" fill="#4da2ff" opacity="0.3" />
                </g>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// ANIMATED FILE NETWORK - Hero visual
// ============================================
const FileNetworkAnimation: React.FC = () => {
  return (
    <div className="file-network">
      <svg viewBox="0 0 500 400" className="network-svg">
        <defs>
          <linearGradient id="fileGradMain" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4da2ff" />
            <stop offset="100%" stopColor="#0052cc" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Connection lines */}
        <g className="connections">
          {[[250, 120, 100, 200], [250, 120, 400, 200], [250, 120, 250, 300], [100, 200, 250, 300], [400, 200, 250, 300]].map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4da2ff" strokeWidth="1" opacity="0.3" className={`conn-${i}`} />
          ))}
        </g>
        
        {/* Central large file */}
        <g className="main-file" transform="translate(220, 70)">
          <rect x="0" y="0" width="60" height="75" rx="5" fill="url(#fileGradMain)" filter="url(#glow)" />
          <path d="M40 0 L60 20 L40 20 Z" fill="#003399" />
          <rect x="10" y="30" width="40" height="4" rx="2" fill="rgba(255,255,255,0.6)" />
          <rect x="10" y="38" width="30" height="4" rx="2" fill="rgba(255,255,255,0.4)" />
          <rect x="10" y="46" width="35" height="4" rx="2" fill="rgba(255,255,255,0.4)" />
          <rect x="10" y="54" width="25" height="4" rx="2" fill="rgba(255,255,255,0.3)" />
        </g>
        
        {/* Distributed nodes */}
        {[
          { x: 70, y: 170, size: 40 },
          { x: 370, y: 170, size: 40 },
          { x: 220, y: 270, size: 40 },
        ].map((node, i) => (
          <g key={i} className={`node-${i}`} transform={`translate(${node.x}, ${node.y})`}>
            <rect x="0" y="0" width={node.size} height={node.size * 1.25} rx="4" fill="#1a3a5c" stroke="#4da2ff" strokeWidth="1" />
            <rect x="8" y="15" width={node.size - 16} height="3" rx="1" fill="#4da2ff" opacity="0.5" />
            <rect x="8" y="22" width={node.size - 20} height="3" rx="1" fill="#4da2ff" opacity="0.3" />
            <circle cx={node.size / 2} cy={node.size * 1.25 + 10} r="4" fill="#4da2ff" className="pulse-dot" />
          </g>
        ))}
        
        {/* Floating data particles */}
        {[...Array(8)].map((_, i) => (
          <circle key={i} r="3" fill="#4da2ff" className="data-particle" style={{ animationDelay: `${i * 0.5}s` }}>
            <animateMotion 
              dur={`${3 + i * 0.3}s`} 
              repeatCount="indefinite"
              path={`M250,120 Q${150 + i * 30},${180 + i * 10} ${100 + (i % 3) * 150},${200 + (i % 2) * 100}`}
            />
          </circle>
        ))}
      </svg>
    </div>
  );
};

export const Landing: React.FC = () => {
  const [showIntro, setShowIntro] = useState(true);
  const [scrollY, setScrollY] = useState(0);
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (showIntro) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showIntro]);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);
      
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setNavVisible(false);
      } else {
        setNavVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.documentElement.style.scrollBehavior = 'auto';
    };
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  // Show intro loader first
  if (showIntro) {
    return <IntroLoader onComplete={handleIntroComplete} />;
  }

  return (
    <div className="landing-page">
      {/* Subtle grid background */}
      <div className="grid-background">
        {[...Array(30)].map((_, i) => (
          <div key={`h${i}`} className="grid-line-h" style={{ top: `${i * 3.33}%` }} />
        ))}
        {[...Array(30)].map((_, i) => (
          <div key={`v${i}`} className="grid-line-v" style={{ left: `${i * 3.33}%` }} />
        ))}
      </div>

      {/* Navigation */}
      <nav className={`landing-nav ${navVisible ? 'visible' : 'hidden'} ${scrollY > 50 ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <Link to="/" className="nav-logo">
            <div className="logo-icon">
              <svg viewBox="0 0 32 40">
                <path d="M4 0 L22 0 L28 8 L28 36 C28 38 26 40 24 40 L4 40 C2 40 0 38 0 36 L0 4 C0 2 2 0 4 0 Z" fill="#4da2ff" />
                <path d="M22 0 L22 8 L28 8 Z" fill="#003388" />
              </svg>
            </div>
            <span>Infinity Storage</span>
          </Link>
          <div className="nav-links">
            <button onClick={() => scrollToSection('manifesto')}>Why Us</button>
            <button onClick={() => scrollToSection('features')}>Features</button>
            <button onClick={() => scrollToSection('pricing')}>Pricing</button>
          </div>
          <div className="nav-actions">
            <Link to="/login" className="nav-login">Login</Link>
            <Link to="/join" className="nav-cta">Get Started →</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-text">
            <div className="hero-badge">
              <span className="badge-icon">◎</span>
              <span>Built on Sui & Walrus Protocol</span>
            </div>
            <h1 className="hero-title">
              <span className="title-line">Your Files.</span>
              <span className="title-line">Your Keys.</span>
              <span className="title-line gradient-text">Your Control.</span>
            </h1>
            <p className="hero-description">
              Decentralized storage with true end-to-end encryption. 
              Files are split, encrypted, and distributed across hundreds of nodes.
              Not even we can see your data.
            </p>
            <div className="hero-buttons">
              <Link to="/join" className="btn-primary">
                <span>Start Storing Free</span>
                <span className="btn-arrow">→</span>
              </Link>
              <button onClick={() => scrollToSection('features')} className="btn-secondary">
                <span>Learn More</span>
              </button>
            </div>
            <div className="hero-trust">
              <div className="trust-item">
                <span className="trust-icon">🔐</span>
                <span>AES-256 Encrypted</span>
              </div>
              <div className="trust-item">
                <span className="trust-icon">◎</span>
                <span>Sui Blockchain</span>
              </div>
              <div className="trust-item">
                <span className="trust-icon">💳</span>
                <span>Stripe Payments</span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <FileNetworkAnimation />
          </div>
        </div>
        <div className="scroll-indicator" onClick={() => scrollToSection('manifesto')}>
          <div className="scroll-line" />
          <span>Scroll</span>
        </div>
      </section>

      {/* Manifesto - Scroll Highlight Section */}
      <section id="manifesto" className="manifesto-section">
        <ScrollHighlightText />
      </section>

      {/* Features - File Flow Cards */}
      <section id="features" className="features-section">
        <div className="section-container">
          <div className="section-header">
            <span className="section-label">CAPABILITIES</span>
            <h2 className="section-title">How It Works</h2>
          </div>
          
          <div className="file-flow-container">
            <FileFlowCard
              number="01"
              title="END-TO-END ENCRYPTION"
              description="Your files are encrypted in your browser before upload using AES-256-GCM. Keys are derived from your password using Argon2id - we never see them."
              features={[
                "Client-side encryption",
                "Zero-knowledge architecture",
                "BIP39 recovery phrase backup"
              ]}
              delay={0}
              icon={<span className="card-emoji">🔐</span>}
            />
            
            <FileFlowCard
              number="02"
              title="DISTRIBUTED STORAGE"
              description="Files are split into erasure-coded chunks and distributed across the Walrus network. No single node holds your complete file."
              features={[
                "100+ storage nodes worldwide",
                "Automatic redundancy",
                "99.99% availability guarantee"
              ]}
              delay={200}
              icon={<span className="card-emoji">🌐</span>}
            />
            
            <FileFlowCard
              number="03"
              title="BLOCKCHAIN VERIFIED"
              description="Every upload is recorded on the Sui blockchain. Immutable timestamps prove when files were stored - perfect for compliance."
              features={[
                "Sui blockchain integration",
                "Immutable audit trail",
                "Cryptographic proofs"
              ]}
              delay={400}
              icon={<span className="card-emoji">⛓️</span>}
            />
            
            <FileFlowCard
              number="04"
              title="FLEXIBLE PAYMENTS"
              description="Pay with traditional methods via Stripe or use SUI tokens directly. Storage costs are transparent and predictable."
              features={[
                "Stripe card payments",
                "SUI token support",
                "Pay-per-epoch pricing"
              ]}
              delay={600}
              icon={<span className="card-emoji">💎</span>}
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="pricing-section">
        <div className="section-container">
          <div className="section-header">
            <span className="section-label">PRICING</span>
            <h2 className="section-title">Simple, Transparent Pricing</h2>
            <p className="section-subtitle">Pay only for what you use. No hidden fees.</p>
          </div>
          
          <div className="pricing-grid">
            <div className="pricing-card">
              <div className="pricing-header">
                <h3>Free</h3>
                <div className="price">$0<span>/month</span></div>
              </div>
              <ul className="pricing-features">
                <li><span className="check">✓</span> 1 GB storage</li>
                <li><span className="check">✓</span> End-to-end encryption</li>
                <li><span className="check">✓</span> 30-day file retention</li>
                <li><span className="check">✓</span> Basic sharing</li>
              </ul>
              <Link to="/join" className="pricing-cta">Get Started</Link>
            </div>
            
            <div className="pricing-card featured">
              <div className="pricing-badge">POPULAR</div>
              <div className="pricing-header">
                <h3>Pro</h3>
                <div className="price">$9<span>/month</span></div>
              </div>
              <ul className="pricing-features">
                <li><span className="check">✓</span> 100 GB storage</li>
                <li><span className="check">✓</span> End-to-end encryption</li>
                <li><span className="check">✓</span> 1-year file retention</li>
                <li><span className="check">✓</span> Advanced sharing + expiry</li>
                <li><span className="check">✓</span> Priority support</li>
              </ul>
              <Link to="/join" className="pricing-cta primary">Start Free Trial</Link>
            </div>
            
            <div className="pricing-card">
              <div className="pricing-header">
                <h3>Pay with SUI</h3>
                <div className="price sui-price">
                  <span className="sui-icon">◎</span>
                  <span>Per Epoch</span>
                </div>
              </div>
              <ul className="pricing-features">
                <li><span className="check">✓</span> Pay as you go</li>
                <li><span className="check">✓</span> Direct blockchain payment</li>
                <li><span className="check">✓</span> No subscription needed</li>
                <li><span className="check">✓</span> Full feature access</li>
              </ul>
              <Link to="/join" className="pricing-cta">Connect Wallet</Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-container">
          <div className="cta-content">
            <h2>Ready to take control of your data?</h2>
            <p>Join thousands who trust Infinity Storage. Start free—no credit card required.</p>
            <Link to="/join" className="btn-primary large">
              <span>Create Free Account</span>
              <span className="btn-arrow">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <Link to="/" className="footer-logo">
              <div className="footer-logo-icon">
                <svg viewBox="0 0 32 40">
                  <path d="M4 0 L22 0 L28 8 L28 36 C28 38 26 40 24 40 L4 40 C2 40 0 38 0 36 L0 4 C0 2 2 0 4 0 Z" fill="#4da2ff" />
                  <path d="M22 0 L22 8 L28 8 Z" fill="#003388" />
                </svg>
              </div>
              <span>Infinity Storage</span>
            </Link>
            <p>Secure, decentralized file storage powered by Walrus protocol on Sui blockchain.</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h4>Product</h4>
              <Link to="/join">Get Started</Link>
              <Link to="/login">Login</Link>
              <button onClick={() => scrollToSection('features')}>Features</button>
              <button onClick={() => scrollToSection('pricing')}>Pricing</button>
            </div>
            <div className="footer-column">
              <h4>Resources</h4>
              <a href="https://docs.walrus.site" target="_blank" rel="noopener noreferrer">Walrus Docs</a>
              <a href="https://sui.io" target="_blank" rel="noopener noreferrer">Sui Blockchain</a>
              <a href="https://stripe.com" target="_blank" rel="noopener noreferrer">Stripe Payments</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Infinity Storage · Built on Sui & Walrus</p>
        </div>
      </footer>
    </div>
  );
};