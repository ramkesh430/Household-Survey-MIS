import './lib/i18n.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
import App from './App.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider><App /></AuthProvider>
      <UpdatePrompt />
    </BrowserRouter>
  </StrictMode>,
);
