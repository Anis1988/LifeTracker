import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppsPage } from './AppsPage';
import '../index.css';

// 📱 "My apps" (apps.html): a second page of the same site, built with the app (vite.config.ts).
createRoot(document.getElementById('root')!).render(<StrictMode><AppsPage /></StrictMode>);
