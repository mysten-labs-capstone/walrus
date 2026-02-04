import { apiUrl } from "../config/api";

interface SecurityQuestion {
  question: string;
  answer: string;
}
interface SignupData {
  username: string;
  authKey: string; // NEW: derived from password using Argon2id + HKDF
  salt: string; // NEW: deterministic salt for key derivation
  encryptedMasterKey?: string; // NEW: master key encrypted with enc_key
  encryptedRecoveryPhrase?: string; // DEPRECATED: old flow for backward compat
}
interface LoginData {
  username: string;
  authKey?: string; // NEW: derived from password (server verifies against hash)
  password?: string; // DEPRECATED: for backward compatibility
}
interface User {
  id: string;
  username: string;
  encryptedMasterKey?: string; // NEW
  encryptedRecoveryPhrase?: string; // DEPRECATED
  salt?: string; // NEW: returned for client-side key derivation verification
}
interface UsernameCheckResult {
  available: boolean;
  username: string;
  error?: string;
}

// Retry helper for cold start handling
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (i === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
  throw new Error("Max retries exceeded");
}

export const authService = {
  async checkUsernameAvailability(
    username: string,
  ): Promise<UsernameCheckResult> {
    try {
      const url = apiUrl(
        `/api/auth/check-username?username=${encodeURIComponent(username)}`,
      );
      console.debug(`[authService] Checking username at: ${url}`);
      const response = await fetchWithRetry(url);

      console.debug(
        `[authService] Username check response status: ${response.status}`,
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.debug(
          `[authService] Username check returned error: ${errorData.error}`,
        );
        return {
          available: false,
          username,
          error: errorData.error || "Failed to check username",
        };
      }

      const data = await response.json();
      console.debug(`[authService] Username check result: ${JSON.stringify(data)}`);
      return data;
    } catch (error) {
      console.error("[authService] Username check failed:", error);
      console.error(
        "[authService] Error details:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        available: false,
        username,
        error: "Unable to check username availability",
      };
    }
  },

  async signup(data: SignupData): Promise<User> {
    const response = await fetchWithRetry(apiUrl("/api/auth/signup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Signup failed");
    return result.user;
  },

  async login(data: LoginData): Promise<User> {
    const response = await fetchWithRetry(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Login failed");
    return result.user;
  },

  async requestRecovery(
    username: string,
  ): Promise<{ userId: string; questionId: string; question: string }> {
    const response = await fetch(apiUrl("/api/auth/request-recovery"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Recovery request failed");
    return result;
  },

  async verifyRecovery(payload: {
    userId: string;
    questionId: string;
    answer: string;
  }): Promise<{ token: string }> {
    const response = await fetch(apiUrl("/api/auth/verify-recovery"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Verification failed");
    return result;
  },

  async resetPassword(payload: {
    userId: string;
    token: string;
    newPassword: string;
  }): Promise<void> {
    const response = await fetch(apiUrl("/api/auth/reset-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Password reset failed");
    return;
  },

  saveUser(user: User): void {
    localStorage.setItem("walrus_user", JSON.stringify(user));
  },

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem("walrus_user");
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  logout(): void {
    localStorage.removeItem("walrus_user");
  },

  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  },
};
