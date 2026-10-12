import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AdminDashboard } from './components/AdminDashboard'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.endsWith('/admin-app.html') ? <AdminDashboard /> : <App />}
  </StrictMode>,
)
