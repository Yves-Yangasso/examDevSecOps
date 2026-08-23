import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTracing } from './observability/tracing';
import { initWebVitals } from './observability/vitals';
import './styles/app.css';

initTracing();
initWebVitals();

const root = document.getElementById('root');
if (!root) throw new Error('Élément racine #root introuvable.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
