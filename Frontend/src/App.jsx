import { Component, Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import JoinSelection from './pages/JoinSelection'
import OrientationGuard from './components/OrientationGuard'
import ProtectedRoute from './components/ProtectedRoute'
import DanmaBot from './components/DanmaBot'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Inventory = lazy(() => import('./pages/Inventory'))
const CharacterSelection = lazy(() => import('./pages/CharacterSelection'))
const LobbyBrowser = lazy(() => import('./pages/LobbyBrowser'))
const Game = lazy(() => import('./pages/Game'))

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(err) {
    const msg = String(err?.message || '')
    const isChunkError =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('Loading chunk')
    if (isChunkError && typeof sessionStorage !== 'undefined') {
      const key = 'danma_chunk_reload_once'
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="menu-page-container">
          <div className="menu-header">
            <h1 className="menu-title">DANMAKREW</h1>
            <h2 className="menu-subtitle">ERROR DE CARGA</h2>
          </div>
          <div className="menu-buttons-container">
            <button
              type="button"
              className="menu-btn"
              onClick={() => window.location.reload()}
            >
              RECARGAR
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <>
      <OrientationGuard />
      <DanmaBot />
      <RouteErrorBoundary>
        <Suspense fallback={<div className="dk-route-loading" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />

            {/* Rutas protegidas (Requieren login y token válido) */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
            <Route path="/join" element={<ProtectedRoute><JoinSelection /></ProtectedRoute>} />
            <Route path="/character-selection" element={<ProtectedRoute><CharacterSelection /></ProtectedRoute>} />
            <Route path="/lobby-browser" element={<ProtectedRoute><LobbyBrowser /></ProtectedRoute>} />
            <Route path="/game" element={<ProtectedRoute><Game /></ProtectedRoute>} />

            {/* Rutas directas para desarrollo / pruebas rápidas de niveles (sin backend ni login) */}
            <Route path="/sandbox" element={<Game isDevMode={true} />} />
            <Route path="/dev" element={<Game isDevMode={true} />} />
            <Route path="/test" element={<Game isDevMode={true} />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </>
  )
}

export default App