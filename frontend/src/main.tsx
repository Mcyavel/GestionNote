import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Global fetch interceptor for API calls
const originalFetch = window.fetch;
window.fetch = async function () {
  let [resource, config] = arguments;
  if (typeof resource === 'string' && resource.includes('/api/')) {
    config = config || {};
    config.credentials = 'include';
    const csrfToken = localStorage.getItem('csrf_token');
    if (csrfToken && (!config.method || config.method.toUpperCase() !== 'GET')) {
      config.headers = {
        ...config.headers,
        'X-CSRF-Token': csrfToken
      };
    }
  }
  return originalFetch(resource, config);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
