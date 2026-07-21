import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BadgeQueueProvider } from './components/Badgequeueprovider'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BadgeQueueProvider>
      <App />
    </BadgeQueueProvider>
  </StrictMode>,
)
