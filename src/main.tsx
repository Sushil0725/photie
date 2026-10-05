import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useEditor } from './store/editor';
import './styles/app.css';

if (import.meta.env.DEV) (window as unknown as { __photie: unknown }).__photie = { useEditor };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
