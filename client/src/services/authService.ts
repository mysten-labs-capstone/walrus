import { apiGet, apiPost } from '../lib/http';

interface SignupData { username: string; password: string; }
interface LoginData { username: string; password: string; }
interface User { id: string; username: string; }
interface UsernameCheckResult { available: boolean; username: string; error?: string; }

const API_BASE = '/api/auth';

export const authService = {
  async checkUsernameAvailability(username: string): Promise<UsernameCheckResult> {
    try {
      const data = await apiGet(`${API_BASE}/check-username?username=${encodeURIComponent(username)}`);
      return data;
    } catch (error) {
      console.error('Username check failed:', error);
      return {
        available: false,
        username,
        error: 'Unable to check username availability',
      };
    }
  },

  async signup(data: SignupData): Promise<User> {
    const result = await apiPost(`${API_BASE}/signup`, data);
    if (!result?.user) throw new Error(result.error || 'Signup failed');
    return result.user;
  },

  async login(data: LoginData): Promise<User> {
    const result = await apiPost(`${API_BASE}/login`, data);
    if (!result?.user) throw new Error(result.error || 'Login failed');
    return result.user;
  },

  saveUser(user: User): void {
    localStorage.setItem('walrus_user', JSON.stringify(user));
  },

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('walrus_user');
    if (!userStr) return null;
    try { return JSON.parse(userStr); } catch { return null; }
  },

  logout(): void {
    localStorage.removeItem('walrus_user');
  },

  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  },
};