import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import OrientationGuard from './components/OrientationGuard'
import ProtectedRoute from './components/ProtectedRoute'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Inventory = lazy(() => import('./pages/Inventory'))
const JoinSelection = lazy(() => import('./pages/JoinSelection'))
const CharacterSelection = lazy(() => import('./pages/CharacterSelection'))
const LobbyBrowser = lazy(() => import('./pages/LobbyBrowser'))
const Game = lazy(() => import('./pages/Game'))

function App() {
  useEffect(() => {
    const tryAutoFullscreenInLandscape = () => {
      if (typeof window === 'undefined') return;
      const isLandscape = window.innerWidth > window.innerHeight && window.innerHeight <= 700;
      if (isLandscape && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };

    window.addEventListener('orientationchange', tryAutoFullscreenInLandscape);
    window.addEventListener('resize', tryAutoFullscreenInLandscape);
    window.addEventListener('touchstart', tryAutoFullscreenInLandscape, { passive: true });
    window.addEventListener('pointerdown', tryAutoFullscreenInLandscape, { passive: true });
    window.addEventListener('click', tryAutoFullscreenInLandscape, { passive: true });

    return () => {
      window.removeEventListener('orientationchange', tryAutoFullscreenInLandscape);
      window.removeEventListener('resize', tryAutoFullscreenInLandscape);
      window.removeEventListener('touchstart', tryAutoFullscreenInLandscape);
      window.removeEventListener('pointerdown', tryAutoFullscreenInLandscape);
      window.removeEventListener('click', tryAutoFullscreenInLandscape);
    };
  }, []);

  return (
    <>
      <OrientationGuard />
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
    </>
  )
}

export default App