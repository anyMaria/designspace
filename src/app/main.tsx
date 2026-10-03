import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/design/global.css';
import { App } from './App';
import { installPageZoomGuard } from './pageZoomGuard';

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');

installPageZoomGuard(); // before anything renders: only the map zooms, never the page

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
