import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';

if (import.meta.env.DEV) {
  import('./dev/testkit').then(({ testkit }) => ((window as unknown as { __t: unknown }).__t = testkit));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
