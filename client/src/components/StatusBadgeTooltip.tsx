import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

const TOOLTIP_OFFSET = 8;
const TOOLTIP_Z_INDEX = 9999;

/**
 * Wraps a status badge and shows a short description only when the user hovers
 * over the badge itself. Tooltip is rendered in a portal above all other content.
 */
export function StatusBadgeTooltip({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const showTooltip = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top - TOOLTIP_OFFSET,
      left: rect.left + rect.width / 2,
    });
    setVisible(true);
  }, []);

  const hideTooltip = useCallback(() => {
    setVisible(false);
  }, []);

  const tooltipEl =
    typeof document !== "undefined" &&
    visible && (
      <span
        className="fixed px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-800 rounded shadow-lg border border-gray-700 whitespace-nowrap pointer-events-none animate-in fade-in duration-150"
        style={{
          left: coords.left,
          top: coords.top,
          transform: "translate(-50%, -100%)",
          zIndex: TOOLTIP_Z_INDEX,
        }}
        role="tooltip"
      >
        {title}
      </span>
    );

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
      >
        {children}
      </span>
      {tooltipEl && createPortal(tooltipEl, document.body)}
    </>
  );
}

/** Tooltip copy for every status badge (single source of truth). */
export const STATUS_BADGE_TOOLTIPS = {
  pending: "Waiting to upload to Walrus storage nodes",
  failed: "Waiting to upload to Walrus storage nodes",
  decentralizing:
    "Currently being uploaded to Walrus storage nodes",
  processing:
    "Currently being uploaded to Walrus storage nodes",
  walrus: "Stored on Walrus storage nodes",
  s3: "Stored on S3 backup",
  encrypted: "File is end-to-end encrypted with your key",
} as const;
