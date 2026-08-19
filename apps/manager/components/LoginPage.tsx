import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { login } from '../auth';

export const LoginPage = ({ onLoginSuccess }: { onLoginSuccess: () => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light dark:bg-dark-bg px-4">
      <div className="w-full max-w-md">
        {/* Logo + Title */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-main to-brand-hover flex items-center justify-center shadow-lg shadow-brand-main/30 mb-4">
            <span className="font-display italic text-white text-2xl leading-none">L</span>
          </div>
          <h1 className="font-display italic text-3xl text-brand-main dark:text-white">
            Gestion Luminose
          </h1>
          <p className="text-sm text-brand-main/60 dark:text-dark-text/60 mt-1">
            Connectez-vous pour accéder à votre studio
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-xl shadow-brand-main/5 border border-brand-border dark:border-dark-sec-border p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* Username */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-main/70 dark:text-dark-text/70 mb-2">
                Identifiant
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-bg text-brand-main dark:text-white placeholder:text-brand-main/30 dark:placeholder:text-dark-text/30 focus:outline-none focus:border-brand-main focus:ring-2 focus:ring-brand-main/15 transition-all"
                placeholder="florent"
                required
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-main/70 dark:text-dark-text/70 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-bg text-brand-main dark:text-white placeholder:text-brand-main/30 dark:placeholder:text-dark-text/30 focus:outline-none focus:border-brand-main focus:ring-2 focus:ring-brand-main/15 transition-all"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-brand-main/50 dark:text-dark-text/50 hover:text-brand-main dark:hover:text-white hover:bg-brand-light dark:hover:bg-dark-bg transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full flex items-center justify-center gap-2 bg-brand-main hover:bg-brand-hover dark:bg-brand-light dark:text-brand-hover dark:hover:bg-white text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-brand-main/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connexion...
                </>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-brand-main/40 dark:text-dark-text/40 mt-6">
          © {new Date().getFullYear()} Luminose Studio
        </p>
      </div>
    </div>
  );
};
