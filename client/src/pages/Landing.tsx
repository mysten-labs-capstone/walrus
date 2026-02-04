import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import "./css/Landing.css";

// ============================================
// INTRO LOADER - File Upload Animation
// ============================================
const IntroLoader: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState(0);
  const [phase, setPhase] = useState<"uploading" | "complete" | "fade">(
    "uploading",
  );
  const files = ["contracts.pdf", "photos.zip", "backup.tar", "secrets.key"];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setPhase("complete");
          setTimeout(() => setPhase("fade"), 150);
          setTimeout(onComplete, 300);
          return 100;
        }
        if (prev === 25 || prev === 50 || prev === 75) {
          setCurrentFile((f) => Math.min(f + 1, files.length - 1));
        }
        return prev + 1;
      });
    }, 12);
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
            <div
              key={i}
              className={`stacked-file file-${i}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <svg viewBox="0 0 60 75" className="file-svg">
                <defs>
                  <linearGradient
                    id={`stackGrad${i}`}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#14b8a6" />
                  </linearGradient>
                </defs>
                <path
                  d="M5 0 L40 0 L55 15 L55 70 C55 73 52 75 50 75 L5 75 C2 75 0 73 0 70 L0 5 C0 2 2 0 5 0 Z"
                  fill={`url(#stackGrad${i})`}
                  opacity={1 - i * 0.25}
                />
                <path
                  d="M40 0 L40 15 L55 15 Z"
                  fill="#003388"
                  opacity={0.8 - i * 0.2}
                />
                <rect
                  x="10"
                  y="25"
                  width="30"
                  height="3"
                  rx="1"
                  fill="rgba(255,255,255,0.5)"
                />
                <rect
                  x="10"
                  y="32"
                  width="22"
                  height="3"
                  rx="1"
                  fill="rgba(255,255,255,0.3)"
                />
                <rect
                  x="10"
                  y="39"
                  width="26"
                  height="3"
                  rx="1"
                  fill="rgba(255,255,255,0.3)"
                />
              </svg>
            </div>
          ))}

          {/* Upload arrow animation */}
          <div className="upload-arrow">
            <svg viewBox="0 0 40 60" className="arrow-svg">
              <path
                d="M20 55 L20 10 M5 25 L20 5 L35 25"
                stroke="#059669"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Particle effects */}
          <div className="upload-particles">
            {[...Array(16)].map((_, i) => (
              <div
                key={i}
                className="upload-particle"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  left: `${30 + Math.random() * 40}%`,
                }}
              />
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
              {[25, 50, 75, 100].map((mark) => (
                <div
                  key={mark}
                  className={`marker ${progress >= mark ? "active" : ""}`}
                  style={{ left: `${mark}%` }}
                />
              ))}
            </div>
          </div>
          <div className="progress-info">
            <span className="progress-percent">{progress}%</span>
            <span className="progress-status">
              {progress < 100 ? "Encrypting & distributing..." : "Secured!"}
            </span>
          </div>
        </div>

        <div className="intro-footer">
          <span>Powered by</span>
          <div className="powered-logos">
            <span className="sui-logo">◎ Sui</span>
            <span className="walrus-logo">Walrus</span>
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
        const progress = Math.min(
          1,
          Math.max(
            0,
            (windowHeight - sectionTop) / (windowHeight + sectionHeight * 0.5),
          ),
        );
        setScrollProgress(progress);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const words = [
    { text: "A platform where your ", highlight: false },
    { text: "files", highlight: true, icon: "" },
    { text: ", ", highlight: false },
    { text: "encryption keys", highlight: true, icon: "" },
    { text: ", and ", highlight: false },
    { text: "access controls", highlight: true, icon: "" },
    {
      text: " are truly owned by you, not by a company or its servers. The result? ",
      highlight: false,
    },
    { text: "Strong security", highlight: true, icon: "" },
    { text: ", ", highlight: false },
    { text: "minimal trust required", highlight: true, icon: "" },
    { text: ", and ", highlight: false },
    {
      text: "data that's protected, not exploited.",
      highlight: true,
      icon: "",
    },
  ];

  return (
    <div ref={sectionRef} className="scroll-highlight-section">
      <div className="highlight-label">The future of file storage</div>
      <div className="highlight-text">
        {words.map((word, i) => {
          const wordProgress = Math.min(
            1,
            Math.max(0, (scrollProgress * 18 - i) * 2),
          );
          return (
            <span
              key={i}
              className={`highlight-word ${word.highlight ? "highlightable" : ""}`}
              style={{
                opacity: word.highlight ? 0.3 + wordProgress * 0.7 : 1,
                background:
                  word.highlight && wordProgress > 0.5
                    ? "#059669"
                    : "transparent",
                color:
                  word.highlight && wordProgress > 0.5
                    ? "#000"
                    : word.highlight
                      ? "rgba(255,255,255,0.4)"
                      : "#fff",
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
// FILE FLOW CARD - Sui-inspired animated cards
// ============================================

// Card 01: Encryption - Lock with expanding shield layers
const EncryptionVisual: React.FC = () => (
  <svg
    viewBox="0 0 200 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: "100%", height: "100%" }}
  >
    {/* Grid background */}
    <g opacity="0.2">
      {[...Array(5)].map((_, i) => (
        <line
          key={`h${i}`}
          x1="20"
          y1={30 + i * 25}
          x2="180"
          y2={30 + i * 25}
          stroke="#059669"
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />
      ))}
      {[...Array(7)].map((_, i) => (
        <line
          key={`v${i}`}
          x1={20 + i * 27}
          y1="30"
          x2={20 + i * 27}
          y2="130"
          stroke="#059669"
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />
      ))}
    </g>
    {/* Outer diamond */}
    <polygon
      points="100,20 160,80 100,140 40,80"
      fill="none"
      stroke="#059669"
      strokeWidth="1"
      opacity="0.4"
      className="iso-layer layer-1"
    />
    {/* Middle diamond */}
    <polygon
      points="100,35 145,80 100,125 55,80"
      fill="none"
      stroke="#059669"
      strokeWidth="1.5"
      opacity="0.6"
      className="iso-layer layer-2"
    />
    {/* Inner diamond with fill */}
    <polygon
      points="100,50 130,80 100,110 70,80"
      fill="rgba(5,150,105,0.2)"
      stroke="#059669"
      strokeWidth="2"
      className="iso-layer layer-3"
    />
    {/* Lock icon */}
    <rect
      x="88"
      y="72"
      width="24"
      height="20"
      rx="3"
      fill="#0a0a0a"
      stroke="#059669"
      strokeWidth="1.5"
    />
    <path
      d="M93,72 L93,65 A7,7 0 0,1 107,65 L107,72"
      fill="none"
      stroke="#059669"
      strokeWidth="2"
    />
    <circle cx="100" cy="82" r="3" fill="#059669" />
    {/* Corner nodes */}
    <circle cx="100" cy="20" r="4" fill="#059669" className="corner-node" />
    <circle cx="160" cy="80" r="4" fill="#059669" className="corner-node" />
    <circle cx="40" cy="80" r="4" fill="#059669" className="corner-node" />
    <circle cx="100" cy="140" r="4" fill="#059669" className="corner-node" />
    {/* Connection lines */}
    <line
      x1="100"
      y1="20"
      x2="160"
      y2="80"
      stroke="#059669"
      strokeWidth="1"
      opacity="0.5"
      className="beam"
    />
    <line
      x1="100"
      y1="20"
      x2="40"
      y2="80"
      stroke="#059669"
      strokeWidth="1"
      opacity="0.5"
      className="beam"
    />
  </svg>
);

// Card 02: Distributed Storage - 3D cube grid
const StorageVisual: React.FC = () => (
  <svg
    viewBox="0 0 200 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: "100%", height: "100%" }}
  >
    {/* Floor grid */}
    <polygon
      points="100,130 160,100 100,70 40,100"
      fill="none"
      stroke="#059669"
      strokeWidth="0.5"
      strokeDasharray="4 4"
      opacity="0.3"
    />
    {/* 3D Cube */}
    <g className="cube-group">
      {/* Back face */}
      <polygon
        points="60,30 140,30 140,90 60,90"
        fill="none"
        stroke="#059669"
        strokeWidth="1"
        opacity="0.3"
      />
      {/* Left face */}
      <polygon
        points="60,30 60,90 40,105 40,45"
        fill="none"
        stroke="#059669"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* Right face */}
      <polygon
        points="140,30 140,90 160,105 160,45"
        fill="none"
        stroke="#059669"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* Top face */}
      <polygon
        points="60,30 140,30 160,45 100,60 40,45"
        fill="rgba(5,150,105,0.15)"
        stroke="#059669"
        strokeWidth="1.5"
      />
      {/* Front face */}
      <polygon
        points="60,90 140,90 160,105 100,120 40,105"
        fill="none"
        stroke="#059669"
        strokeWidth="1.5"
      />
      {/* Inner lines */}
      <line
        x1="100"
        y1="30"
        x2="100"
        y2="90"
        stroke="#059669"
        strokeWidth="0.5"
        opacity="0.3"
      />
      <line
        x1="60"
        y1="60"
        x2="140"
        y2="60"
        stroke="#059669"
        strokeWidth="0.5"
        opacity="0.3"
      />
      {/* Data blocks */}
      <rect
        x="65"
        y="35"
        width="15"
        height="20"
        fill="#059669"
        opacity="0.4"
        className="block b1"
      />
      <rect
        x="85"
        y="35"
        width="15"
        height="20"
        fill="#059669"
        opacity="0.6"
        className="block b2"
      />
      <rect
        x="105"
        y="35"
        width="15"
        height="20"
        fill="#059669"
        opacity="0.3"
        className="block b3"
      />
      <rect
        x="65"
        y="60"
        width="15"
        height="20"
        fill="#059669"
        opacity="0.5"
        className="block b4"
      />
      <rect
        x="85"
        y="60"
        width="15"
        height="20"
        fill="#059669"
        opacity="0.7"
        className="block b5"
      />
      <rect
        x="105"
        y="60"
        width="15"
        height="20"
        fill="#059669"
        opacity="0.4"
        className="block b1"
      />
    </g>
    {/* Size label */}
    <rect
      x="20"
      y="75"
      width="35"
      height="16"
      fill="#0a0a0a"
      stroke="#059669"
      strokeWidth="1"
    />
    <text
      x="37"
      y="87"
      fill="#059669"
      fontSize="9"
      fontFamily="monospace"
      textAnchor="middle"
    >
      4.2MB
    </text>
    {/* Pointer */}
    <polygon points="55,83 62,80 62,86" fill="#059669" className="pointer" />
  </svg>
);

// Card 03: Blockchain - Chain links with verification
const BlockchainVisual: React.FC = () => (
  <svg
    viewBox="0 0 200 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: "100%", height: "100%" }}
  >
    {/* Dashed cross lines */}
    <line
      x1="30"
      y1="140"
      x2="170"
      y2="30"
      stroke="#059669"
      strokeWidth="0.5"
      strokeDasharray="4 4"
      opacity="0.2"
    />
    <line
      x1="170"
      y1="140"
      x2="30"
      y2="30"
      stroke="#059669"
      strokeWidth="0.5"
      strokeDasharray="4 4"
      opacity="0.2"
    />
    {/* Block 1 */}
    <g className="chain-block">
      <rect
        x="25"
        y="60"
        width="40"
        height="30"
        fill="#0a0a0a"
        stroke="#059669"
        strokeWidth="1.5"
        rx="2"
      />
      <rect x="30" y="65" width="30" height="3" fill="#059669" opacity="0.3" />
      <rect x="30" y="71" width="20" height="3" fill="#059669" opacity="0.3" />
      <text
        x="45"
        y="85"
        fill="#059669"
        fontSize="8"
        fontFamily="monospace"
        textAnchor="middle"
        opacity="0.6"
      >
        #1
      </text>
    </g>
    {/* Chain link 1 */}
    <line
      x1="65"
      y1="75"
      x2="80"
      y2="75"
      stroke="#059669"
      strokeWidth="2"
      className="chain-link"
    />
    {/* Block 2 (center - larger) */}
    <g className="chain-block">
      <rect
        x="80"
        y="55"
        width="40"
        height="45"
        fill="#0a0a0a"
        stroke="#059669"
        strokeWidth="2"
        rx="2"
      />
      <rect x="85" y="60" width="30" height="3" fill="#059669" opacity="0.5" />
      <rect x="85" y="66" width="25" height="3" fill="#059669" opacity="0.4" />
      <rect x="85" y="72" width="30" height="3" fill="#059669" opacity="0.3" />
      {/* Checkmark */}
      <circle
        cx="100"
        cy="88"
        r="6"
        fill="none"
        stroke="#059669"
        strokeWidth="1.5"
      />
      <path
        d="M96,88 L99,91 L104,85"
        fill="none"
        stroke="#059669"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    {/* Chain link 2 */}
    <line
      x1="120"
      y1="75"
      x2="135"
      y2="75"
      stroke="#059669"
      strokeWidth="2"
      className="chain-link"
    />
    {/* Block 3 */}
    <g className="chain-block">
      <rect
        x="135"
        y="60"
        width="40"
        height="30"
        fill="#0a0a0a"
        stroke="#059669"
        strokeWidth="1.5"
        rx="2"
      />
      <rect x="140" y="65" width="30" height="3" fill="#059669" opacity="0.3" />
      <rect x="140" y="71" width="22" height="3" fill="#059669" opacity="0.3" />
      <text
        x="155"
        y="85"
        fill="#059669"
        fontSize="8"
        fontFamily="monospace"
        textAnchor="middle"
        opacity="0.6"
      >
        #3
      </text>
    </g>
    {/* Sui badge */}
    <g className="sui-badge">
      <circle
        cx="100"
        cy="130"
        r="10"
        fill="none"
        stroke="#059669"
        strokeWidth="1.5"
      />
      <text
        x="100"
        y="134"
        fill="#059669"
        fontSize="10"
        fontFamily="sans-serif"
        textAnchor="middle"
        fontWeight="bold"
      >
        S
      </text>
    </g>
  </svg>
);

// Card 04: Payments - Credit card with coin flow
const PaymentsVisual: React.FC = () => (
  <svg
    viewBox="0 0 200 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: "100%", height: "100%" }}
  >
    {/* Background grid */}
    <g opacity="0.1">
      {[...Array(4)].map((_, i) => (
        <line
          key={i}
          x1="20"
          y1={40 + i * 30}
          x2="180"
          y2={40 + i * 30}
          stroke="#059669"
          strokeWidth="1"
        />
      ))}
    </g>
    {/* Credit card */}
    <g className="credit-card">
      <rect
        x="20"
        y="40"
        width="100"
        height="65"
        rx="6"
        fill="#0a0a0a"
        stroke="#059669"
        strokeWidth="1.5"
      />
      <rect
        x="20"
        y="52"
        width="100"
        height="10"
        fill="#059669"
        opacity="0.3"
      />
      {/* Chip */}
      <rect
        x="30"
        y="68"
        width="20"
        height="14"
        rx="2"
        fill="none"
        stroke="#059669"
        strokeWidth="1"
        opacity="0.6"
      />
      <line
        x1="30"
        y1="75"
        x2="50"
        y2="75"
        stroke="#059669"
        strokeWidth="0.5"
        opacity="0.4"
      />
      <line
        x1="40"
        y1="68"
        x2="40"
        y2="82"
        stroke="#059669"
        strokeWidth="0.5"
        opacity="0.4"
      />
      {/* Card number dots */}
      <g>
        {[0, 1, 2, 3].map((i) => (
          <circle
            key={i}
            cx={30 + i * 7}
            cy="95"
            r="2"
            fill="#059669"
            opacity="0.5"
          />
        ))}
      </g>
    </g>
    {/* SUI coins */}
    <g className="sui-coins">
      <g className="coin coin-1">
        <circle
          cx="150"
          cy="55"
          r="15"
          fill="#0a0a0a"
          stroke="#059669"
          strokeWidth="2"
        />
        <text
          x="150"
          y="60"
          fill="#059669"
          fontSize="12"
          fontFamily="sans-serif"
          textAnchor="middle"
          fontWeight="bold"
        >
          S
        </text>
      </g>
      <g className="coin coin-2">
        <circle
          cx="165"
          cy="90"
          r="12"
          fill="#0a0a0a"
          stroke="#059669"
          strokeWidth="1.5"
        />
        <text
          x="165"
          y="94"
          fill="#059669"
          fontSize="10"
          fontFamily="sans-serif"
          textAnchor="middle"
          fontWeight="bold"
        >
          S
        </text>
      </g>
      <g className="coin coin-3">
        <circle cx="145" cy="115" r="9" fill="#059669" opacity="0.3" />
        <circle
          cx="145"
          cy="115"
          r="9"
          fill="none"
          stroke="#059669"
          strokeWidth="1"
        />
      </g>
    </g>
    {/* Arrow flow */}
    <path
      d="M120,70 Q135,60 145,55"
      fill="none"
      stroke="#059669"
      strokeWidth="1.5"
      strokeDasharray="4 2"
      className="flow-arrow"
    />
    <polygon
      points="147,52 142,58 149,57"
      fill="#059669"
      className="flow-arrow"
    />
  </svg>
);

// Card 05: S3 Caching - Cloud storage with cache layers
const S3CachingVisual: React.FC = () => (
  <svg
    viewBox="0 0 200 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: "100%", height: "100%" }}
  >
    {/* Background grid */}
    <g opacity="0.15">
      {[...Array(4)].map((_, i) => (
        <circle
          key={i}
          cx="100"
          cy="80"
          r={20 + i * 20}
          stroke="#059669"
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />
      ))}
    </g>
    {/* Cloud layers */}
    <g className="cloud-layers">
      {/* Back cloud */}
      <ellipse
        cx="100"
        cy="60"
        rx="60"
        ry="30"
        fill="none"
        stroke="#059669"
        strokeWidth="1"
        opacity="0.3"
        className="cloud-layer-1"
      />
      {/* Middle cloud */}
      <ellipse
        cx="100"
        cy="75"
        rx="50"
        ry="25"
        fill="rgba(5,150,105,0.1)"
        stroke="#059669"
        strokeWidth="1.5"
        opacity="0.6"
        className="cloud-layer-2"
      />
      {/* Front cloud */}
      <ellipse
        cx="100"
        cy="90"
        rx="40"
        ry="20"
        fill="rgba(5,150,105,0.2)"
        stroke="#059669"
        strokeWidth="2"
        className="cloud-layer-3"
      />
    </g>
    {/* S3 bucket */}
    <g className="s3-bucket">
      <rect
        x="80"
        y="75"
        width="40"
        height="30"
        rx="3"
        fill="#0a0a0a"
        stroke="#059669"
        strokeWidth="1.5"
      />
      <text
        x="100"
        y="93"
        fill="#059669"
        fontSize="10"
        fontFamily="sans-serif"
        textAnchor="middle"
        fontWeight="bold"
      >
        S3
      </text>
    </g>
    {/* Cache indicator */}
    <g className="cache-indicator">
      <rect
        x="70"
        y="115"
        width="60"
        height="20"
        rx="2"
        fill="none"
        stroke="#059669"
        strokeWidth="1"
        strokeDasharray="3 2"
      />
      <rect
        x="75"
        y="119"
        width="15"
        height="4"
        fill="#059669"
        opacity="0.6"
        className="cache-bar-1"
      />
      <rect
        x="93"
        y="119"
        width="15"
        height="4"
        fill="#059669"
        opacity="0.6"
        className="cache-bar-2"
      />
      <rect
        x="111"
        y="119"
        width="15"
        height="4"
        fill="#059669"
        opacity="0.6"
        className="cache-bar-3"
      />
      <text
        x="100"
        y="131"
        fill="#059669"
        fontSize="7"
        fontFamily="monospace"
        textAnchor="middle"
        opacity="0.7"
      >
        CACHE
      </text>
    </g>
    {/* Upload/Download arrows */}
    <path
      d="M100,45 L100,60"
      stroke="#059669"
      strokeWidth="2"
      className="s3-upload-arrow"
    />
    <polygon
      points="100,43 95,50 105,50"
      fill="#059669"
      className="s3-upload-arrow"
    />
    <path
      d="M130,80 L155,80"
      stroke="#059669"
      strokeWidth="2"
      strokeDasharray="3 2"
      className="s3-download-arrow"
    />
    <polygon
      points="157,80 150,75 150,85"
      fill="#059669"
      className="s3-download-arrow"
    />
  </svg>
);

// Card 06: File Sharing - Users sharing files
const FileSharingVisual: React.FC = () => (
  <svg
    viewBox="0 0 200 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: "100%", height: "100%" }}
  >
    {/* Connection lines */}
    <g>
      <line
        x1="50"
        y1="60"
        x2="100"
        y2="80"
        stroke="#059669"
        strokeWidth="1"
        strokeDasharray="4 4"
        className="share-connection-1"
      />
      <line
        x1="150"
        y1="60"
        x2="100"
        y2="80"
        stroke="#059669"
        strokeWidth="1"
        strokeDasharray="4 4"
        className="share-connection-2"
      />
      <line
        x1="100"
        y1="110"
        x2="100"
        y2="80"
        stroke="#059669"
        strokeWidth="1"
        strokeDasharray="4 4"
        className="share-connection-3"
      />
    </g>
    {/* Central file */}
    <g transform="translate(75, 65)" className="share-file">
      <rect
        x="0"
        y="0"
        width="50"
        height="30"
        rx="3"
        fill="rgba(5,150,105,0.2)"
        stroke="#059669"
        strokeWidth="2"
      />
      <rect
        x="8"
        y="8"
        width="34"
        height="3"
        rx="1"
        fill="#059669"
        opacity="0.6"
      />
      <rect
        x="8"
        y="14"
        width="25"
        height="3"
        rx="1"
        fill="#059669"
        opacity="0.4"
      />
      <rect
        x="8"
        y="20"
        width="30"
        height="3"
        rx="1"
        fill="#059669"
        opacity="0.4"
      />
    </g>
    {/* User 1 - Top Left */}
    <g className="share-user-1">
      <circle
        cx="50"
        cy="40"
        r="12"
        fill="#0a0a0a"
        stroke="#059669"
        strokeWidth="1.5"
      />
      <circle cx="50" cy="37" r="4" fill="#059669" />
      <path
        d="M43,48 Q50,45 57,48"
        stroke="#059669"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
    {/* User 2 - Top Right */}
    <g className="share-user-2">
      <circle
        cx="150"
        cy="40"
        r="12"
        fill="#0a0a0a"
        stroke="#059669"
        strokeWidth="1.5"
      />
      <circle cx="150" cy="37" r="4" fill="#059669" />
      <path
        d="M143,48 Q150,45 157,48"
        stroke="#059669"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
    {/* User 3 - Bottom */}
    <g className="share-user-3">
      <circle
        cx="100"
        cy="130"
        r="12"
        fill="#0a0a0a"
        stroke="#059669"
        strokeWidth="1.5"
      />
      <circle cx="100" cy="127" r="4" fill="#059669" />
      <path
        d="M93,138 Q100,135 107,138"
        stroke="#059669"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
    {/* Share icon */}
    <g transform="translate(160, 75)" className="share-icon">
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="#059669"
        strokeWidth="1.5"
      />
      <path
        d="M10,6 L10,14 M7,9 L13,9"
        stroke="#059669"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </g>
  </svg>
);

const FileFlowCard: React.FC<{
  number: string;
  title: string;
  description: string;
  features: string[];
  delay: number;
  visualType:
    | "encryption"
    | "storage"
    | "blockchain"
    | "payments"
    | "s3caching"
    | "filesharing";
}> = ({ number, title, description, features, delay, visualType }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const visibleTimeoutRef = useRef<number | null>(null);
  const expandedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (visibleTimeoutRef.current) {
            window.clearTimeout(visibleTimeoutRef.current);
          }
          if (expandedTimeoutRef.current) {
            window.clearTimeout(expandedTimeoutRef.current);
          }
          visibleTimeoutRef.current = window.setTimeout(
            () => setIsVisible(true),
            delay,
          );
          expandedTimeoutRef.current = window.setTimeout(
            () => setIsExpanded(true),
            delay + 400,
          );
        } else {
          if (visibleTimeoutRef.current) {
            window.clearTimeout(visibleTimeoutRef.current);
          }
          if (expandedTimeoutRef.current) {
            window.clearTimeout(expandedTimeoutRef.current);
          }
          setIsExpanded(false);
          setIsVisible(false);
        }
      },
      { threshold: 0.2 },
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => {
      observer.disconnect();
      if (visibleTimeoutRef.current) {
        window.clearTimeout(visibleTimeoutRef.current);
      }
      if (expandedTimeoutRef.current) {
        window.clearTimeout(expandedTimeoutRef.current);
      }
    };
  }, [delay]);

  const renderVisual = () => {
    switch (visualType) {
      case "encryption":
        return <EncryptionVisual />;
      case "storage":
        return <StorageVisual />;
      case "blockchain":
        return <BlockchainVisual />;
      case "payments":
        return <PaymentsVisual />;
      case "s3caching":
        return <S3CachingVisual />;
      case "filesharing":
        return <FileSharingVisual />;
    }
  };

  return (
    <div
      ref={cardRef}
      className={`file-flow-card sui-style ${isVisible ? "visible" : ""} ${isExpanded ? "expanded" : ""}`}
    >
      {/* Card frame with corner accent */}
      <div className="card-frame">
        <div className="frame-corner top-left" />
        <div className="frame-line left" />
        <div className="frame-line bottom" />
      </div>

      {/* Header with number box */}
      <div className="card-header-sui">
        <div className="number-box">
          <span>{number}</span>
        </div>
        <h3 className="card-title-sui">{title}</h3>
      </div>

      {/* Visual area */}
      <div className="card-visual-area">{renderVisual()}</div>

      {/* Description and features */}
      <div className="card-content-sui">
        <p className="card-description-sui">{description}</p>
        <div className="card-features-sui">
          {features.map((f, i) => (
            <div
              key={i}
              className="feature-item"
              style={{ animationDelay: `${delay + 600 + i * 100}ms` }}
            >
              <span className="feature-dot" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================
// ANIMATED FILE NETWORK - Hero visual
// ============================================
const FileNetworkAnimation: React.FC = () => {
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);

  return (
    <div className="file-network">
      <svg viewBox="0 0 500 400" className="network-svg">
        <defs>
          <linearGradient id="fileGradMain" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowHover">
            <feGaussianBlur stdDeviation="5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Connection lines */}
        <g className="connections">
          {[
            [250, 120, 100, 200],
            [250, 120, 400, 200],
            [250, 120, 250, 300],
            [100, 200, 250, 300],
            [400, 200, 250, 300],
          ].map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#059669"
              strokeWidth={hoveredElement === `node-${i}` ? "2" : "1"}
              opacity={hoveredElement === `node-${i}` ? "0.6" : "0.3"}
              className={`conn-${i} interactive-line`}
            />
          ))}
        </g>

        {/* Central large file */}
        <g
          className="main-file interactive-element"
          transform="translate(220, 70)"
          onMouseEnter={() => setHoveredElement("main-file")}
          onMouseLeave={() => setHoveredElement(null)}
          style={{ cursor: "pointer" }}
        >
          <rect
            x="0"
            y="0"
            width="60"
            height="75"
            rx="5"
            fill="url(#fileGradMain)"
            filter={
              hoveredElement === "main-file" ? "url(#glowHover)" : "url(#glow)"
            }
          />
          <path d="M40 0 L60 20 L40 20 Z" fill="#003399" />
          <rect
            x="10"
            y="30"
            width="40"
            height="4"
            rx="2"
            fill="rgba(255,255,255,0.6)"
          />
          <rect
            x="10"
            y="38"
            width="30"
            height="4"
            rx="2"
            fill="rgba(255,255,255,0.4)"
          />
          <rect
            x="10"
            y="46"
            width="35"
            height="4"
            rx="2"
            fill="rgba(255,255,255,0.4)"
          />
          <rect
            x="10"
            y="54"
            width="25"
            height="4"
            rx="2"
            fill="rgba(255,255,255,0.3)"
          />
          {hoveredElement === "main-file" && (
            <text
              x="30"
              y="-5"
              fill="#14b8a6"
              fontSize="10"
              fontFamily="monospace"
              textAnchor="middle"
              fontWeight="600"
            >
              Your File
            </text>
          )}
        </g>

        {/* Distributed nodes */}
        {[
          { x: 70, y: 170, size: 40, label: "Node" },
          { x: 370, y: 170, size: 40, label: "Node" },
          { x: 220, y: 270, size: 40, label: "Node" },
        ].map((node, i) => (
          <g
            key={i}
            className={`node-${i} interactive-element`}
            transform={`translate(${node.x}, ${node.y})`}
            onMouseEnter={() => setHoveredElement(`node-${i}`)}
            onMouseLeave={() => setHoveredElement(null)}
            style={{ cursor: "pointer" }}
          >
            <rect
              x="0"
              y="0"
              width={node.size}
              height={node.size * 1.25}
              rx="4"
              fill="#1a3a5c"
              stroke="#059669"
              strokeWidth={hoveredElement === `node-${i}` ? "2" : "1"}
              filter={
                hoveredElement === `node-${i}` ? "url(#glowHover)" : "none"
              }
            />
            <rect
              x="8"
              y="15"
              width={node.size - 16}
              height="3"
              rx="1"
              fill="#059669"
              opacity={hoveredElement === `node-${i}` ? "0.8" : "0.5"}
            />
            <rect
              x="8"
              y="22"
              width={node.size - 20}
              height="3"
              rx="1"
              fill="#059669"
              opacity={hoveredElement === `node-${i}` ? "0.6" : "0.3"}
            />
            <circle
              cx={node.size / 2}
              cy={node.size * 1.25 + 10}
              r={hoveredElement === `node-${i}` ? "5" : "4"}
              fill="#059669"
              className="pulse-dot"
            />
            {hoveredElement === `node-${i}` && (
              <text
                x={node.size / 2}
                y="-5"
                fill="#14b8a6"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="middle"
                fontWeight="600"
              >
                {node.label}
              </text>
            )}
          </g>
        ))}

        {/* Floating data particles */}
        {[...Array(8)].map((_, i) => (
          <circle
            key={i}
            r="3"
            fill="#059669"
            className="data-particle"
            style={{ animationDelay: `${i * 0.5}s` }}
          >
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

// ============================================
// CTA CARD - Final call to action with scroll animation
// ============================================
const CTACard: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const visibleTimeoutRef = useRef<number | null>(null);
  const expandedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (visibleTimeoutRef.current) {
            window.clearTimeout(visibleTimeoutRef.current);
          }
          if (expandedTimeoutRef.current) {
            window.clearTimeout(expandedTimeoutRef.current);
          }
          visibleTimeoutRef.current = window.setTimeout(
            () => setIsVisible(true),
            200,
          );
          expandedTimeoutRef.current = window.setTimeout(
            () => setIsExpanded(true),
            600,
          );
        } else {
          if (visibleTimeoutRef.current) {
            window.clearTimeout(visibleTimeoutRef.current);
          }
          if (expandedTimeoutRef.current) {
            window.clearTimeout(expandedTimeoutRef.current);
          }
          setIsExpanded(false);
          setIsVisible(false);
        }
      },
      { threshold: 0.2 },
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => {
      observer.disconnect();
      if (visibleTimeoutRef.current) {
        window.clearTimeout(visibleTimeoutRef.current);
      }
      if (expandedTimeoutRef.current) {
        window.clearTimeout(expandedTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className={`cta-card-wrapper ${isVisible ? "visible" : ""} ${isExpanded ? "expanded" : ""}`}
    >
      {/* Decorative background elements */}
      <div className="cta-decorations">
        <div className="cta-circle cta-circle-1"></div>
        <div className="cta-circle cta-circle-2"></div>
        <div className="cta-circle cta-circle-3"></div>
        <div className="cta-line cta-line-1"></div>
        <div className="cta-line cta-line-2"></div>
        <div className="cta-particle cta-particle-1"></div>
        <div className="cta-particle cta-particle-2"></div>
        <div className="cta-particle cta-particle-3"></div>
        <div className="cta-particle cta-particle-4"></div>
        <div className="cta-particle cta-particle-5"></div>
        <div className="cta-particle cta-particle-6"></div>
      </div>

      <div className="cta-content">
        {/* CTA Visual */}
        <div className="cta-visual">
          <svg
            viewBox="0 0 200 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Center shield/lock icon */}
            <g className="cta-shield">
              <path
                d="M100,20 L85,25 L85,45 Q85,60 100,70 Q115,60 115,45 L115,25 Z"
                fill="rgba(5,150,105,0.2)"
                stroke="#059669"
                strokeWidth="2"
              />
              <circle
                cx="100"
                cy="45"
                r="8"
                fill="none"
                stroke="#059669"
                strokeWidth="2"
              />
              <rect x="97" y="47" width="6" height="10" rx="1" fill="#059669" />
            </g>
            {/* Orbiting data particles */}
            <circle
              className="cta-orbit-particle cta-orbit-1"
              cx="70"
              cy="60"
              r="4"
              fill="#14b8a6"
            />
            <circle
              className="cta-orbit-particle cta-orbit-2"
              cx="130"
              cy="60"
              r="4"
              fill="#059669"
            />
            <circle
              className="cta-orbit-particle cta-orbit-3"
              cx="100"
              cy="90"
              r="4"
              fill="#10b981"
            />
            <circle
              className="cta-orbit-particle cta-orbit-4"
              cx="85"
              cy="35"
              r="3"
              fill="#14b8a6"
              opacity="0.7"
            />
            <circle
              className="cta-orbit-particle cta-orbit-5"
              cx="115"
              cy="35"
              r="3"
              fill="#059669"
              opacity="0.7"
            />
            {/* Connection lines */}
            <line
              x1="70"
              y1="60"
              x2="85"
              y2="50"
              stroke="#059669"
              strokeWidth="1"
              opacity="0.3"
              className="cta-connect-line"
            />
            <line
              x1="130"
              y1="60"
              x2="115"
              y2="50"
              stroke="#059669"
              strokeWidth="1"
              opacity="0.3"
              className="cta-connect-line"
            />
            <line
              x1="100"
              y1="90"
              x2="100"
              y2="70"
              stroke="#059669"
              strokeWidth="1"
              opacity="0.3"
              className="cta-connect-line"
            />
          </svg>
        </div>

        <h2>Ready to take control of your data?</h2>
        <Link to="/join" className="btn-primary large">
          <span>Get Started</span>
          <span className="btn-arrow">→</span>
        </Link>
      </div>
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
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showIntro]);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";

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

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.documentElement.style.scrollBehavior = "auto";
    };
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setShowIntro(true);
    window.scrollTo(0, 0);
  };

  return (
    <div className="landing-page">
      {/* Subtle grid background */}
      <div className="grid-background">
        {[...Array(30)].map((_, i) => (
          <div
            key={`h${i}`}
            className="grid-line-h"
            style={{ top: `${i * 3.33}%` }}
          />
        ))}
        {[...Array(30)].map((_, i) => (
          <div
            key={`v${i}`}
            className="grid-line-v"
            style={{ left: `${i * 3.33}%` }}
          />
        ))}
      </div>

      <div className={`landing-content ${showIntro ? "loading" : "loaded"}`}>
        {/* Navigation */}
        <nav
          className={`landing-nav ${navVisible ? "visible" : "hidden"} ${scrollY > 50 ? "scrolled" : ""}`}
        >
          <div className="nav-container">
            <Link to="/" className="nav-logo" onClick={handleLogoClick}>
              <img
                src="/logo+text.svg"
                alt="Logo"
                className="logo-icon"
                style={{ height: "40px", width: "auto" }}
              />
            </Link>
            <div className="nav-links">
              <button onClick={() => scrollToSection("manifesto")}>
                Why Us
              </button>
              <button onClick={() => scrollToSection("features")}>
                Features
              </button>
            </div>
            <div className="nav-actions">
              <Link to="/login" className="nav-login">
                Login
              </Link>
              <Link to="/join" className="nav-cta">
                Get Started →
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-text">
              <h1 className="hero-title">
                <span className="title-line">Your Files.</span>
                <span className="title-line">Your Keys.</span>
                <span className="title-line gradient-text">Your Control.</span>
              </h1>
              <p className="hero-description">
                Decentralized storage with true end-to-end encryption. Files are
                split, encrypted, and distributed across a global network of
                independent storage nodes. Not even we can decrypt your data.
              </p>
              <div className="hero-buttons">
                <Link to="/join" className="btn-primary">
                  <span>Start Storing </span>
                  <span className="btn-arrow">→</span>
                </Link>
                <button
                  onClick={() => scrollToSection("features")}
                  className="btn-secondary"
                >
                  <span>Learn More</span>
                </button>
              </div>
              <div className="hero-trust">
                <div className="trust-item">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.6)"
                    strokeWidth="1"
                    className="trust-icon-svg"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  <span>End-to-End Encrypted</span>
                </div>
                <div className="trust-item">
                  <span className="trust-icon">◎</span>
                  <span>Sui Blockchain</span>
                </div>
                <div className="trust-item">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.6)"
                    strokeWidth="1"
                    className="trust-icon-svg"
                  >
                    <rect x="1" y="4" width="22" height="16" rx="2" />
                    <path d="M1 10h22" />
                  </svg>
                  <span>Stripe Payments</span>
                </div>
              </div>
            </div>
            <div className="hero-visual">
              <FileNetworkAnimation />
            </div>
          </div>
          <div
            className="scroll-indicator"
            onClick={() => scrollToSection("manifesto")}
          >
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
            <div className="section-header scroll-animate">
              <h2 className="section-title">How Your Data Stays Yours</h2>
            </div>

            <div className="file-flow-container">
              <FileFlowCard
                number="01"
                title="END-TO-END ENCRYPTION"
                description="Your files are encrypted in your browser before upload using AES-256-GCM. Encryption keys are derived locally from your password with Argon2id, and only a hashed authentication verifier is stored on our server."
                features={[
                  "Client-side encryption",
                  "Zero-knowledge architecture",
                  "BIP39 recovery phrase backup",
                ]}
                delay={0}
                visualType="encryption"
              />

              <FileFlowCard
                number="02"
                title="WALRUS STORAGE NODES"
                description="Files are split into erasure-coded chunks and distributed across the Walrus network. No single node holds your complete file."
                features={[
                  "Decentralized global storage network",
                  "Automatic redundancy",
                  "Resilient by design",
                ]}
                delay={200}
                visualType="storage"
              />

              <FileFlowCard
                number="03"
                title="BLOCKCHAIN VERIFIED"
                description="Every upload’s metadata and proofs are recorded on the Sui blockchain, creating a tamper-evident audit trail that cryptographically verifies your data’s integrity and availability."
                features={[
                  "Sui blockchain metadata logging",
                  "Immutable audit trail of storage proofs",
                  "Cryptographic integrity proofs",
                ]}
                delay={400}
                visualType="blockchain"
              />

              <FileFlowCard
                number="04"
                title="SIMPLE PAYMENTS"
                description="Pay with traditional card payments via Stripe. Top up your account in advance, then pay only for the storage you actually use."
                features={[
                  "Stripe card payments",
                  "Prepaid storage balance",
                  "Pay-per-epoch pricing",
                ]}
                delay={600}
                visualType="payments"
              />

              <FileFlowCard
                number="05"
                title="S3 CACHING"
                description="Fast uploads and retrieval powered by an AWS S3 caching layer. Your encrypted files are cached for instant access while maintaining zero-knowledge security."
                features={[
                  "Amazon S3 integration",
                  "Fast uploads and downloads",
                  "Automatic cache management",
                ]}
                delay={100}
                visualType="s3caching"
              />

              <FileFlowCard
                number="06"
                title="FILE SHARING"
                description="Share encrypted files with anyone using secure, time-limited links. Recipients can access files without needing an account."
                features={[
                  "Shareable encrypted links",
                  "Expiration controls",
                  "No account required for recipients",
                ]}
                delay={300}
                visualType="filesharing"
              />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta-section">
          <div className="cta-container-wide">
            <CTACard />
          </div>
        </section>

        {/* Footer */}
        <footer className="landing-footer">
          <div className="footer-container">
            <div className="footer-brand">
              <Link to="/" className="footer-logo">
                <img
                  src="/logo+text.svg"
                  alt="Logo"
                  className="footer-logo-icon"
                  style={{ height: "30px", width: "auto" }}
                />
              </Link>
              <p>
                Secure, decentralized file storage powered by Walrus protocol on
                Sui blockchain.
              </p>
            </div>
            <div className="footer-links">
              <div className="footer-column">
                <h4>Product</h4>
                <Link to="/join">Get Started</Link>
                <Link to="/login">Login</Link>
                <button onClick={() => scrollToSection("features")}>
                  Features
                </button>
              </div>
              <div className="footer-column">
                <h4>Resources</h4>
                <a
                  href="https://docs.wal.app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Walrus Docs
                </a>
                <a
                  href="https://sui.io"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Sui Blockchain
                </a>
                <a
                  href="https://stripe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Stripe Payments
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Intro loader overlay */}
      {showIntro && <IntroLoader onComplete={handleIntroComplete} />}
    </div>
  );
};
