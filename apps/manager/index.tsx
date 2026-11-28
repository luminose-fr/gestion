import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErreurEcran } from './components/ErreurEcran';
import { surveillerLesMorceaux } from './lib/rechargement';
import './index.css';
import { lireTheme, poserTheme } from './components/charte';

// Le thème choisi se pose avant le premier rendu, sans quoi la page clignote.
poserTheme(lireTheme());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

surveillerLesMorceaux();
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErreurEcran><App /></ErreurEcran>
  </React.StrictMode>
);
