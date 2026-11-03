import { WORKER_URL } from './constants';

export const login = async (username: string, password: string): Promise<boolean> => {
  const response = await fetch(`${WORKER_URL}/auth/login`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok && response.status !== 401) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? 'Connexion impossible. Réessayez.');
  }
  if (response.ok) localStorage.removeItem('session_token');
  return response.ok;
};

export const logout = async (): Promise<void> => {
  const res = await fetch(`${WORKER_URL}/auth/logout`, { method: 'POST', credentials: 'same-origin' });
  if (!res.ok && res.status !== 401) throw new Error('La déconnexion a échoué. Réessayez.');
  localStorage.removeItem('session_token');
};

/** Convertit une ancienne session en cookie avant d'en retirer la copie accessible à JavaScript. */
export const isAuthenticated = async (): Promise<boolean> => {
  try {
    const ancien = localStorage.getItem('session_token');
    const res = await fetch(`${WORKER_URL}/auth/session`, {
      credentials: 'same-origin', headers: ancien ? { 'X-Session-Token': ancien } : {},
    });
    if (res.ok || res.status === 401) localStorage.removeItem('session_token');
    return res.ok;
  } catch { return false; }
};

/** Compatibilité des appelants : la session voyage désormais dans le cookie HttpOnly. */
export const getSessionToken = (): null => null;
