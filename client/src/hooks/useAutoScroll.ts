import { useEffect, useRef } from "react";

interface UseAutoScrollOptions {
  enabled?: boolean;
  edgeDistance?: number;
  scrollSpeed?: number;
  scrollableElement?: HTMLElement | null;
}

/**
 * Hook that provides auto-scroll functionality during drag operations
 * Scrolls the page when the cursor approaches the edges while dragging
 */
export function useAutoScroll(options: UseAutoScrollOptions = {}) {
  const {
    enabled = true,
    edgeDistance = 60, // pixels from edge to trigger scroll
    scrollSpeed = 16, // pixels per frame to scroll
    scrollableElement = null,
  } = options;

  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTimeRef = useRef<number>(0);

  const startAutoScroll = (clientX: number, clientY: number) => {
    if (!enabled) return;

    // Clear any existing scroll
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
    }

    const element = scrollableElement || window;
    let scrollX = 0;
    let scrollY = 0;

    // Get viewport dimensions
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Determine scroll direction based on cursor position
    if (clientY < edgeDistance) {
      scrollY = -scrollSpeed;
    } else if (clientY > viewportHeight - edgeDistance) {
      scrollY = scrollSpeed;
    }

    if (clientX < edgeDistance) {
      scrollX = -scrollSpeed;
    } else if (clientX > viewportWidth - edgeDistance) {
      scrollX = scrollSpeed;
    }

    // Only set up interval if we need to scroll
    if (scrollX !== 0 || scrollY !== 0) {
      scrollIntervalRef.current = setInterval(() => {
        if (element === window) {
          // Scroll the document element (works across all browsers)
          window.scrollBy({
            left: scrollX,
            top: scrollY,
            behavior: "auto", // Instant scroll for smooth drag experience
          });
        } else if (element instanceof HTMLElement) {
          element.scrollLeft += scrollX;
          element.scrollTop += scrollY;
        }
      }, 16); // ~60fps
    }
  };

  const stopAutoScroll = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, []);

  return {
    startAutoScroll,
    stopAutoScroll,
  };
}
