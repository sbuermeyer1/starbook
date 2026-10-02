import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext'
import { TrackingProvider } from './tracking/TrackingProvider'
import { FriendsProvider } from './friends/FriendsProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <TrackingProvider>
        <FriendsProvider>
          <App />
        </FriendsProvider>
      </TrackingProvider>
    </AuthProvider>
  </StrictMode>,
)
