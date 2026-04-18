import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Espone la chiave Gemini per il CalcoloDrawer
(window as any).__GEMINI_KEY__ = process.env.API_KEY || '';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);