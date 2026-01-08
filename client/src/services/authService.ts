import { apiUrl } from '../config/api';

interface SignupData { username: string; password: string; }
interface LoginData { username: string; password: string; }
interface User { id: string; username: string; }
interface UsernameCheckResult { available: boolean; username: string; error?: string; }

export const authService = {
  async checkUsernameAvailability(username: string): Promise<UsernameCheckResult> {
    try {
      const response = await fetch(apiUrl(`/api/auth/check-username?username=${encodeURIComponent(username)}`));
      
      if (!response.ok) {
        const errorData = await response.json();
        return { 
          available: false, 
          username, 
          error: errorData.error || 'Failed to check username' 
        };
      }
      
      const data = await response.json();
      return data;
      
    } catch (error) {
      console.error('Username check failed:', error);
      return { 
        available: false, 
        username, 
        error: 'Unable to check username availability' 
      };
    }
  },

  async signup(data: SignupData): Promise<User> {
    const response = await fetch(apiUrl('/api/auth/signup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Signup failed');
    return result.user;
  },

  async login(data: LoginData): Promise<User> {
    const response = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Login failed');
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