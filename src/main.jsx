import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MenuProvider } from './MenuContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MenuProvider><App /></MenuProvider>
  </StrictMode>,
)
