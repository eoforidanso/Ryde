import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RydeProvider } from './store/RydeStore';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RydeProvider>
      <App />
    </RydeProvider>
  </StrictMode>,
);
