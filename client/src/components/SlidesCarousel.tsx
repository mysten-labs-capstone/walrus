import React, { useEffect, useRef, useState } from "react";

// ─── Slide SVG Visuals ────────────────────────────────────────────
const DecentralizedVisual: React.FC = () => (
  <svg viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="slide-visual-svg">
    <defs>
      <linearGradient id="sv-fileGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <filter id="sv-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    {/* Grid */}
    <g opacity="0.08">
      {[...Array(7)].map((_, i) => <line key={`h${i}`} x1="0" y1={i * 36} x2="320" y2={i * 36} stroke="#10b981" strokeWidth="0.5" />)}
      {[...Array(9)].map((_, i) => <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="220" stroke="#10b981" strokeWidth="0.5" />)}
    </g>
    {/* Central file */}
    <g className="sv-float" filter="url(#sv-glow)">
      <rect x="130" y="20" width="60" height="72" rx="7" fill="url(#sv-fileGrad)" />
      <path d="M170,20 L190,40 L170,40 Z" fill="#047857" />
      <rect x="140" y="48" width="40" height="4" rx="2" fill="rgba(255,255,255,0.6)" />
      <rect x="140" y="56" width="30" height="4" rx="2" fill="rgba(255,255,255,0.4)" />
      <rect x="140" y="64" width="35" height="4" rx="2" fill="rgba(255,255,255,0.4)" />
    </g>
    {/* Connection paths */}
    <path d="M160,95 Q100,140 60,165" stroke="#10b981" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.4" className="sv-dash" />
    <path d="M160,95 L160,165" stroke="#10b981" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.4" className="sv-dash" />
    <path d="M160,95 Q220,140 260,165" stroke="#10b981" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.4" className="sv-dash" />
    {/* Data particles */}
    {[0, 1, 2].map(i => {
      const paths = ["M160,95 Q100,140 60,165", "M160,95 L160,165", "M160,95 Q220,140 260,165"];
      return (
        <g key={i}>
          <circle r="4" fill="#10b981" filter="url(#sv-glow)">
            <animateMotion dur="2.5s" repeatCount="indefinite" begin={`${i * 0.8}s`} path={paths[i]} />
            <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle r="2" fill="#10b981" opacity="0.3">
            <animateMotion dur="2.5s" repeatCount="indefinite" begin={`${i * 0.8 + 0.15}s`} path={paths[i]} />
          </circle>
        </g>
      );
    })}
    {/* Storage nodes */}
    {[{ x: 30, y: 160 }, { x: 130, y: 165 }, { x: 230, y: 160 }].map((n, i) => (
      <g key={i}>
        <rect x={n.x} y={n.y} width="60" height="45" rx="6" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
        <rect x={n.x + 10} y={n.y + 10} width="16" height="10" rx="2" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.5" />
        <rect x={n.x + 30} y={n.y + 10} width="16" height="10" rx="2" fill="#10b981" opacity="0.25" stroke="#10b981" strokeWidth="1" className="sv-chunk" />
        <rect x={n.x + 10} y={n.y + 24} width="16" height="10" rx="2" fill="#10b981" opacity="0.2" stroke="#10b981" strokeWidth="1" className="sv-chunk" />
        <rect x={n.x + 30} y={n.y + 24} width="16" height="10" rx="2" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.5" />
        <circle cx={n.x + 30} cy={n.y + 42} r="2.5" fill="#10b981">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" begin={`${i * 0.5}s`} />
        </circle>
      </g>
    ))}
  </svg>
);

const EncryptionSlideVisual: React.FC = () => (
  <svg viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="slide-visual-svg">
    <defs>
      <filter id="sv-glow2" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <radialGradient id="sv-shieldGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
      </radialGradient>
    </defs>
    {/* Grid */}
    <g opacity="0.08">
      {[...Array(7)].map((_, i) => <line key={`h${i}`} x1="0" y1={i * 36} x2="320" y2={i * 36} stroke="#10b981" strokeWidth="0.5" />)}
      {[...Array(9)].map((_, i) => <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="220" stroke="#10b981" strokeWidth="0.5" />)}
    </g>
    {/* Shield glow */}
    <ellipse cx="160" cy="105" rx="70" ry="55" fill="url(#sv-shieldGrad)" className="sv-pulse" />
    {/* Outer diamond */}
    <polygon points="160,25 250,105 160,185 70,105" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.3" className="sv-layer l1" />
    {/* Middle diamond */}
    <polygon points="160,45 230,105 160,165 90,105" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.5" className="sv-layer l2" />
    {/* Inner diamond */}
    <polygon points="160,65 210,105 160,145 110,105" fill="rgba(16,185,129,0.15)" stroke="#10b981" strokeWidth="2" className="sv-layer l3" />
    {/* Lock */}
    <g filter="url(#sv-glow2)">
      <rect x="145" y="95" width="30" height="24" rx="4" fill="#0a0a0a" stroke="#10b981" strokeWidth="2" />
      <path d="M150,95 L150,86 A10,10 0 0,1 170,86 L170,95" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="160" cy="107" r="3.5" fill="#10b981" />
      <line x1="160" y1="107" x2="160" y2="113" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
    </g>
    {/* Corner nodes */}
    {[[160, 25], [250, 105], [160, 185], [70, 105]].map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r="5" fill="#10b981" filter="url(#sv-glow2)">
        <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite" begin={`${i * 0.5}s`} />
      </circle>
    ))}
    {/* Orbiting particles */}
    {[...Array(6)].map((_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      const cx = 160 + Math.cos(angle) * 90;
      const cy = 105 + Math.sin(angle) * 70;
      return (
        <circle key={i} cx={cx} cy={cy} r="2" fill="#10b981" opacity="0.5">
          <animate attributeName="opacity" values="0.5;0.15;0.5" dur="2s" repeatCount="indefinite" begin={`${i * 0.33}s`} />
          <animateTransform attributeName="transform" type="rotate" from="0 160 105" to="360 160 105" dur="12s" repeatCount="indefinite" />
        </circle>
      );
    })}
  </svg>
);

const BlockchainSlideVisual: React.FC = () => (
  <svg viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="slide-visual-svg">
    <defs>
      <filter id="sv-glow3" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    {/* Grid */}
    <g opacity="0.08">
      {[...Array(7)].map((_, i) => <line key={`h${i}`} x1="0" y1={i * 36} x2="320" y2={i * 36} stroke="#10b981" strokeWidth="0.5" />)}
      {[...Array(9)].map((_, i) => <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="220" stroke="#10b981" strokeWidth="0.5" />)}
    </g>
    {/* Block 1 */}
    <g>
      <rect x="15" y="65" width="70" height="55" rx="6" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
      <rect x="25" y="75" width="50" height="4" rx="1" fill="#10b981" opacity="0.3" />
      <rect x="25" y="83" width="35" height="4" rx="1" fill="#10b981" opacity="0.2" />
      <text x="50" y="108" fill="#10b981" fontSize="10" fontFamily="monospace" textAnchor="middle" opacity="0.6">#1</text>
    </g>
    {/* Chain link 1 */}
    <line x1="85" y1="92" x2="110" y2="92" stroke="#10b981" strokeWidth="2.5" className="sv-chain">
      <animate attributeName="opacity" values="0.8;0.4;0.8" dur="1.5s" repeatCount="indefinite" />
    </line>
    {/* Block 2 (center - verified) */}
    <g>
      <rect x="110" y="55" width="100" height="75" rx="6" fill="#0f172a" stroke="#10b981" strokeWidth="2" filter="url(#sv-glow3)" />
      <rect x="122" y="66" width="76" height="4" rx="1" fill="#10b981" opacity="0.4" />
      <rect x="122" y="74" width="55" height="4" rx="1" fill="#10b981" opacity="0.3" />
      <rect x="122" y="82" width="65" height="4" rx="1" fill="#10b981" opacity="0.25" />
      {/* Checkmark */}
      <circle cx="160" cy="110" r="10" fill="none" stroke="#10b981" strokeWidth="2" />
      <path d="M154,110 L158,114 L166,106" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    {/* Chain link 2 */}
    <line x1="210" y1="92" x2="235" y2="92" stroke="#10b981" strokeWidth="2.5" className="sv-chain">
      <animate attributeName="opacity" values="0.8;0.4;0.8" dur="1.5s" repeatCount="indefinite" begin="0.5s" />
    </line>
    {/* Block 3 */}
    <g>
      <rect x="235" y="65" width="70" height="55" rx="6" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
      <rect x="245" y="75" width="50" height="4" rx="1" fill="#10b981" opacity="0.3" />
      <rect x="245" y="83" width="38" height="4" rx="1" fill="#10b981" opacity="0.2" />
      <text x="270" y="108" fill="#10b981" fontSize="10" fontFamily="monospace" textAnchor="middle" opacity="0.6">#3</text>
    </g>
    {/* Sui badge */}
    <g className="sv-float">
      <circle cx="160" cy="170" r="16" fill="#0f172a" stroke="#10b981" strokeWidth="2" filter="url(#sv-glow3)" />
      <text x="160" y="176" fill="#10b981" fontSize="16" fontFamily="sans-serif" textAnchor="middle" fontWeight="bold">S</text>
    </g>
    {/* Connecting lines to badge */}
    <line x1="50" y1="120" x2="148" y2="160" stroke="#10b981" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.2" />
    <line x1="160" y1="130" x2="160" y2="154" stroke="#10b981" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.2" />
    <line x1="270" y1="120" x2="172" y2="160" stroke="#10b981" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.2" />
  </svg>
);

const SharingSlideVisual: React.FC = () => (
  <svg viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="slide-visual-svg">
    <defs>
      <filter id="sv-glow4" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <linearGradient id="sv-linkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
      </linearGradient>
    </defs>
    {/* Grid */}
    <g opacity="0.08">
      {[...Array(7)].map((_, i) => <line key={`h${i}`} x1="0" y1={i * 36} x2="320" y2={i * 36} stroke="#10b981" strokeWidth="0.5" />)}
      {[...Array(9)].map((_, i) => <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="220" stroke="#10b981" strokeWidth="0.5" />)}
    </g>
    {/* Sender node */}
    <g>
      <circle cx="60" cy="90" r="28" fill="#0f172a" stroke="#10b981" strokeWidth="2" filter="url(#sv-glow4)" />
      <rect x="47" y="76" width="26" height="32" rx="4" fill="none" stroke="#10b981" strokeWidth="1.5" />
      <rect x="52" y="86" width="16" height="3" rx="1" fill="#10b981" opacity="0.5" />
      <rect x="52" y="92" width="12" height="3" rx="1" fill="#10b981" opacity="0.3" />
      <rect x="52" y="98" width="14" height="3" rx="1" fill="#10b981" opacity="0.3" />
    </g>
    {/* Link beam */}
    <line x1="90" y1="90" x2="230" y2="90" stroke="url(#sv-linkGrad)" strokeWidth="2" strokeDasharray="8 4" className="sv-dash" />
    {/* Flowing particles along link */}
    {[0, 1, 2, 3].map(i => (
      <circle key={i} r="3" fill="#10b981" opacity="0.8">
        <animateMotion dur="2s" repeatCount="indefinite" begin={`${i * 0.5}s`} path="M90,90 L230,90" />
        <animate attributeName="opacity" values="0.8;0.3;0.8" dur="1s" repeatCount="indefinite" />
      </circle>
    ))}
    {/* Receiver node */}
    <g>
      <circle cx="260" cy="90" r="28" fill="#0f172a" stroke="#10b981" strokeWidth="2" filter="url(#sv-glow4)" />
      {/* Person icon */}
      <circle cx="260" cy="80" r="8" fill="none" stroke="#10b981" strokeWidth="1.5" />
      <path d="M246,105 A14,14 0 0,1 274,105" fill="none" stroke="#10b981" strokeWidth="1.5" />
    </g>
    {/* Timer / Expiry */}
    <g className="sv-float">
      <rect x="130" y="135" width="60" height="30" rx="15" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
      {/* Clock icon */}
      <circle cx="148" cy="150" r="7" fill="none" stroke="#10b981" strokeWidth="1.5" />
      <line x1="148" y1="146" x2="148" y2="150" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="148" y1="150" x2="151" y2="152" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
      <text x="170" y="154" fill="#10b981" fontSize="10" fontFamily="monospace" textAnchor="middle">24h</text>
    </g>
    {/* Lock badge on link */}
    <g>
      <circle cx="160" cy="75" r="10" fill="#0f172a" stroke="#10b981" strokeWidth="1" />
      <rect x="155" y="76" width="10" height="8" rx="2" fill="none" stroke="#10b981" strokeWidth="1" />
      <path d="M157,76 L157,73 A3,3 0 0,1 163,73 L163,76" fill="none" stroke="#10b981" strokeWidth="1" strokeLinecap="round" />
    </g>
  </svg>
);

// ─── Slide Data ───────────────────────────────────────────────────
const slides = [
  {
    title: "Decentralized Storage",
    subtitle: "Powered by Walrus",
    description:
      "Your files are split into erasure-coded chunks and distributed across 100+ storage nodes worldwide. No single point of failure.",
    Visual: DecentralizedVisual,
  },
  {
    title: "Zero-Knowledge Security",
    subtitle: "End-to-end encrypted",
    description:
      "AES-256-GCM encryption with Argon2id key derivation. Your files are encrypted in-browser before upload — we never see your data.",
    Visual: EncryptionSlideVisual,
  },
  {
    title: "Blockchain Verified",
    subtitle: "Immutable on Sui",
    description:
      "Every upload is recorded on the Sui blockchain. Tamper-proof timestamps prove when files were stored — perfect for compliance.",
    Visual: BlockchainSlideVisual,
  },
  {
    title: "Secure Sharing",
    subtitle: "Time-limited links",
    description:
      "Share files with encrypted, expiring links. Set download limits, revoke access anytime — full control over who sees your data.",
    Visual: SharingSlideVisual,
  },
];

export default function SlidesCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isShowingSlide, setIsShowingSlide] = useState(true);
  const currentSlideRef = useRef<number>(0);

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
    await wait(blankDuration);
    setCurrentSlide(target);
    currentSlideRef.current = target;
    await wait(30);
    setIsShowingSlide(true);
  };

  const CurrentVisual = slides[currentSlide].Visual;

  return (
    <div className="login-right">
      <div className="login-grid-overlay" />

      <div className="carousel-wrap">
        <div className="relative">
          <div
            key={currentSlide}
            className={`slide ${isShowingSlide ? "visible" : "hidden"}`}
          >
            <div className="slide-card">
              <div style={{ textAlign: "center" }}>
                <div className="slide-visual-wrap">
                  <CurrentVisual />
                </div>
                <h2 className="slide-title">{slides[currentSlide].title}</h2>
                <h3 className="slide-subtitle">
                  {slides[currentSlide].subtitle}
                </h3>
                <p className="slide-desc">{slides[currentSlide].description}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dots">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => changeSlideTo(index)}
            className={`dot ${index === currentSlide ? "active" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

export { slides };
