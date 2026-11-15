import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './lib/auth'
import { keepAppUpdated } from './lib/updates'
import '@fontsource-variable/inter/index.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

// A file of the app failed to load (the phone had an old copy): reload once to get the new one
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('reloaded-for-update')) {
    sessionStorage.setItem('reloaded-for-update', '1')
    window.location.reload()
  }
})

keepAppUpdated()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
