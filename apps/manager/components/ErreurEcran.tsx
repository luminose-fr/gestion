import React from 'react';
import { Bouton } from './ui';

/** Une erreur de rendu ne doit plus laisser une page blanche sans issue. */
export class ErreurEcran extends React.Component<React.PropsWithChildren, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() { return { erreur: true }; }
  componentDidCatch(erreur: Error) { console.error('Erreur de rendu :', erreur); }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text">
        <p className="text-lg font-bold">Cet écran n’a pas pu s’afficher.</p>
        <p className="text-sm">Rechargez l’application pour réessayer.</p>
        <Bouton intention="principale" onClick={() => window.location.reload()}>Recharger l’application</Bouton>
      </div>
    );
  }
}
