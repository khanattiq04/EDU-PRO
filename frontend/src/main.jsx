import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './styles.css';
import './app-overrides.css';
import './quiz-status.css';
import './homepage-managed.css';
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
