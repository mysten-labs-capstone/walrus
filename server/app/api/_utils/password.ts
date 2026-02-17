import bcrypt from "bcryptjs";
import zxcvbn from "zxcvbn";

const SALT_ROUNDS = 12;

export function addPepper(input: string): string {
  const pepper = process.env.PEPPER_SECRET || "";
  return input + pepper;
}

/**
 * Hash auth_key for server storage
 * auth_key is already derived from password using Argon2id + HKDF on client
 */
export async function hashAuthKey(authKey: string): Promise<string> {
  const pepperedAuthKey = addPepper(authKey);
  return bcrypt.hash(pepperedAuthKey, SALT_ROUNDS);
}

/**
 * Verify auth_key against stored hash
 */
export async function verifyAuthKey(
  authKey: string,
  hash: string,
): Promise<boolean> {
  const pepperedAuthKey = addPepper(authKey);
  return bcrypt.compare(pepperedAuthKey, hash);
}

// DEPRECATED: Old password-based functions (for backward compatibility)
export async function hashPassword(password: string): Promise<string> {
  const pepperedPassword = addPepper(password);
  return bcrypt.hash(pepperedPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const pepperedPassword = addPepper(password);
  return bcrypt.compare(pepperedPassword, hash);
}

/** Minimum zxcvbn score considered "strong" (0-4 scale). 3 = strong, 4 = very strong. */
const MIN_STRONG_SCORE = 3;

export function validatePassword(
  password: string,
  userInputs: string[] = [],
): {
  valid: boolean;
  errors: string[];
  score?: number;
} {
  const errors: string[] = [];
  if (password.length < 8)
    errors.push("Password must be at least 8 characters");
  if (password.length > 72)
    errors.push("Password must be less than 72 characters");
  if (errors.length > 0) return { valid: false, errors };

  const result = zxcvbn(password, userInputs);
  if (result.score < MIN_STRONG_SCORE) {
    if (result.feedback?.warning) {
      errors.push(result.feedback.warning);
    } else {
      errors.push("Password is too weak. Choose a stronger password.");
    }
    if (result.feedback?.suggestions?.length) {
      errors.push(result.feedback.suggestions[0]);
    }
    return { valid: false, errors, score: result.score };
  }
  return { valid: true, errors: [], score: result.score };
}
