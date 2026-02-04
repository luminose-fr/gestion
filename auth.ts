import { WORKER_URL } from "./constants";

export const login = async (username: string, password: string): Promise<boolean> => {
  try {
    const response = await fetch(`${WORKER_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      return false;
    }

    const { sessionToken } = await response.json();
    localStorage.setItem('session_token', sessionToken);
    return true;
  } catch (error) {
    console.error('Erreur login:', error);
    return false;
  }
};

export const logout = (): void => {
  localStorage.removeItem('session_token');
};

export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem('session_token');
  if (!token) return false;

  try {
    const tokenData = JSON.parse(atob(token));
    return Date.now() < tokenData.expiresAt;
  } catch {
    return false;
  }
};

export const getSessionToken = (): string | null => {
  return localStorage.getItem('session_token');
};