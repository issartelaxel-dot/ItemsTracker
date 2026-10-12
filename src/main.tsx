import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AdminAnnouncements } from './components/Announcements'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.endsWith('/admin-app.html') ? <AdminAnnouncements /> : <App />}
  </StrictMode>,
)
