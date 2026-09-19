import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './app-overrides.css';
createRoot(document.getElementById('root')).render(<App />);
