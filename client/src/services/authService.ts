import { apiUrl } from '../config/api';

interface SecurityQuestion { question: string; answer: string }
interface SignupData { username: string; password: string; securityQuestions: SecurityQuestion[] }
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

  async requestRecovery(username: string): Promise<{ userId: string; questionId: string; question: string }> {
    const response = await fetch(apiUrl('/api/auth/request-recovery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Recovery request failed');
    return result;
  },

  async verifyRecovery(payload: { userId: string; questionId: string; answer: string }): Promise<{ token: string }> {
    const response = await fetch(apiUrl('/api/auth/verify-recovery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Verification failed');
    return result;
  },

  async resetPassword(payload: { userId: string; token: string; newPassword: string }): Promise<void> {
    const response = await fetch(apiUrl('/api/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Password reset failed');
    return;
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