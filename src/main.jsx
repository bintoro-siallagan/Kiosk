import { installOffline } from './offline.js'
installOffline();   // patch fetch buat mode offline — sebelum app render
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MenuProvider } from './MenuContext.jsx'
import { PinGateProvider } from './components/ManagerPinGate.jsx'
import { UiKitProvider } from './components/uiKit.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MenuProvider>
      <PinGateProvider>
        <UiKitProvider>
          <App />
        </UiKitProvider>
      </PinGateProvider>
    </MenuProvider>
  </StrictMode>,
)
