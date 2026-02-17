/**
 * Password strength using zxcvbn (https://github.com/dropbox/zxcvbn).
 * Replaces per-rule checks (uppercase, number, etc.) with a single "strong" requirement.
 */

import zxcvbn from "zxcvbn";

/** Minimum score (0-4) considered "strong" — matches server validation. */
export const MIN_STRONG_SCORE = 3;

export type PasswordStrengthResult = {
  score: number;
  isStrong: boolean;
  label: string;
  color: string;
  warning?: string;
  suggestion?: string;
};

const LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "Very weak", color: "status-red" },
  1: { label: "Weak", color: "status-red" },
  2: { label: "Fair", color: "status-yellow" },
  3: { label: "Strong", color: "status-green" },
  4: { label: "Very strong", color: "status-green" },
};

/**
 * Evaluate password strength with zxcvbn.
 * Pass userInputs (e.g. username, email) so passwords containing them are penalized.
 */
export function getPasswordStrength(
  password: string,
  userInputs: string[] = [],
): PasswordStrengthResult {
  if (!password || password.length < 8) {
    return {
      score: 0,
      isStrong: false,
      label: "Too short",
      color: "status-red",
    };
  }
  if (password.length > 72) {
    return {
      score: 0,
      isStrong: false,
      label: "Too long",
      color: "status-red",
    };
  }
  const result = zxcvbn(password, userInputs);
  const score = Math.min(result.score, 4);
  const { label, color } = LABELS[score] ?? LABELS[0];
  return {
    score,
    isStrong: score >= MIN_STRONG_SCORE,
    label,
    color,
    warning: result.feedback?.warning || undefined,
    suggestion: result.feedback?.suggestions?.[0],
  };
}
