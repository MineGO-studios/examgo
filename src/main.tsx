import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './components/LanguageProvider'
import { HelpTipProvider } from './components/HelpTip'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <HelpTipProvider>
        <App />
      </HelpTipProvider>
    </LanguageProvider>
  </StrictMode>,
)
