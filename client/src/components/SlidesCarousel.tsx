import React, { useEffect, useRef, useState } from "react";

const slides = [
  {
    title: "No vendor lock‑in",
    subtitle: "Keep control of your backups",
    description:
      "Avoid provider shutdowns, price hikes, and policy changes that trap your data.",
  },
  {
    title: "Designed for long‑term access",
    subtitle: "Durable and portable backups",
    description:
      "Store backups in a way that remains accessible and auditable over time.",
  },
  {
    title: "Privacy-first security",
    subtitle: "End-to-end encryption by default",
    description:
      "Strong encryption keeps your data private from providers and regulators.",
  },
  {
    title: "Simple secure sharing",
    subtitle: "Expiring links with duration control",
    description:
      "Share files with time-limited links — easy, auditable, and revocable.",
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
              <div style={{ textAlign: "center", marginTop: "2rem" }}>
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
