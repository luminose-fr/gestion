import React, { useState } from 'react';
import { login } from '../auth';

export const LoginPage = ({ onLoginSuccess }: { onLoginSuccess: () => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await login(username, password);
    
    setLoading(false);

    if (success) {
      onLoginSuccess();
    } else {
      setError('Identifiants incorrects');
      setPassword(''); // Vider le password en cas d'erreur
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light dark:bg-dark-bg">
      <div className="bg-white dark:bg-dark-surface p-8 rounded-xl shadow-lg border border-brand-border dark:border-dark-sec-border max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center text-brand-main dark:text-white">
          🔐 Gestion Luminose
        </h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-brand-main dark:text-dark-text text-sm font-bold mb-2">
              Identifiant
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-bg text-brand-main dark:text-white rounded-lg focus:outline-none focus:border-brand-main dark:focus:border-brand-light"
              required
              autoComplete="username"
              disabled={loading}
            />
          </div>

          <div className="mb-6">
            <label className="block text-brand-main dark:text-dark-text text-sm font-bold mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-bg text-brand-main dark:text-white rounded-lg focus:outline-none focus:border-brand-main dark:focus:border-brand-light"
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-main hover:bg-brand-hover dark:bg-brand-light dark:text-brand-hover dark:hover:bg-white text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
};