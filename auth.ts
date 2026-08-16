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

/**
 * Le token a la forme "<payload base64>.<signature base64>".
 * Le front ne lit que le payload (pour connaître l'expiration) : la
 * signature n'est vérifiable que par le Worker, qui détient le secret.
 * L'ancien format sans signature reste lisible, le temps du déploiement.
 */
const decodeTokenPayload = (token: string): { expiresAt?: number } | null => {
  try {
    const separator = token.lastIndexOf('.');
    const payloadB64 = separator > 0 ? token.slice(0, separator) : token;
    return JSON.parse(atob(payloadB64));
  } catch {
    return null;
  }
};

export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem('session_token');
  if (!token) return false;

  const payload = decodeTokenPayload(token);
  if (typeof payload?.expiresAt !== 'number') return false;
  return Date.now() < payload.expiresAt;
};

export const getSessionToken = (): string | null => {
  return localStorage.getItem('session_token');
};