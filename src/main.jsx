import "./auto-zoom.css";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MenuProvider } from './MenuContext.jsx'
import { PinGateProvider } from './components/ManagerPinGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MenuProvider><PinGateProvider><App /></PinGateProvider></MenuProvider>
  </StrictMode>,
)
