import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { LazorWalletProvider } from './components/LazorWalletProvider';
import { Buffer } from 'buffer';
window.Buffer = Buffer;

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LazorWalletProvider>
      <App />
    </LazorWalletProvider>
  </React.StrictMode>
);