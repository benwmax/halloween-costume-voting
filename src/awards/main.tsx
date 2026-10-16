import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AwardsApp from './AwardsApp'
import '../styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AwardsApp />
  </StrictMode>,
)
