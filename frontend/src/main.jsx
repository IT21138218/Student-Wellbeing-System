import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './pages/App'
import { ThemeSettingsProvider } from './contexts/ThemeSettingsProvider'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeSettingsProvider>
      <App />
    </ThemeSettingsProvider>
  </React.StrictMode>,
)
