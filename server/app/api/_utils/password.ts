import bcrypt from "bcryptjs";

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

export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (password.length < 8)
    errors.push("Password must be at least 8 characters");
  if (password.length > 72)
    errors.push("Password must be less than 72 characters");
  if (!/[a-z]/.test(password))
    errors.push("Password must contain lowercase letter");
  if (!/[A-Z]/.test(password))
    errors.push("Password must contain uppercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain number");
  if (!/[^a-zA-Z0-9]/.test(password))
    errors.push("Password must contain special character");
  return { valid: errors.length === 0, errors };
}
