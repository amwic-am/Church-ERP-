// The application entry point.
//
// One router serves both halves of the platform on one domain: the public site at
// `/` and the office at `/erp`. `AuthProvider` sits above it so a session refresh
// never remounts the tree, and `Toster` is the only toast surface the ERP uses.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';

import { App } from './App';
import { AuthProvider } from './components/auth/AuthProvider';
import { TooltipProvider } from './components/ui/overlay';
import { env } from './lib/env';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('የማስጀመሪያ ክፍሉ (id="root") አልተገኘም');

document.documentElement.lang = 'am';
document.title = env.appName;

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <TooltipProvider>
        <AuthProvider>
          <App />
          <Toaster position="bottom-right" richColors closeButton />
        </AuthProvider>
      </TooltipProvider>
    </BrowserRouter>
  </StrictMode>
);
