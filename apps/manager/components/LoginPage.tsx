import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { login } from '../auth';
import { EnCours } from './Feedback';
import { Bouton, CLASSES_CHAMP } from './ui';

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
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-main to-brand-hover flex items-center justify-center shadow-lg shadow-brand-main/30 mb-4">
            <span className="font-display italic text-white text-lg leading-none">L</span>
          </div>
          <h1 className="font-display italic text-lg text-brand-main dark:text-white">
            Gestion Luminose
          </h1>
          <p className="text-sm text-brand-main/60 dark:text-dark-text/60 mt-1">
            Connectez-vous pour accéder à votre studio
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-brand-border dark:border-dark-sec-border p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-erreur/10 border border-erreur/30 text-erreur text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="font-semibold">{error}</span>
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
                className={CLASSES_CHAMP}
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
                  className={`${CLASSES_CHAMP} pr-11`}
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
            <Bouton
              type="submit"
              disabled={loading || !username || !password}
              intention="principale"
              posee
              className="w-full"
            >
              {loading ? <EnCours label="Connexion…" taille="md" /> : 'Se connecter'}
            </Bouton>
          </form>
        </div>

        <p className="text-center text-xs text-brand-main/40 dark:text-dark-text/40 mt-6">
          © {new Date().getFullYear()} Luminose Studio
        </p>
      </div>
    </div>
  );
};
