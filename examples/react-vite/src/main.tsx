import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initGrabby } from '@githumbi/grabby';
import { App } from './App';
import './styles.css';

if (import.meta.env.DEV) initGrabby();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
