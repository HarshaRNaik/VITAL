import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Hub = lazy(() => import('./pages/Hub'))
const Diet = lazy(() => import('./pages/Diet'))
const Fitness = lazy(() => import('./pages/Fitness'))
const WorkoutPlayer = lazy(() => import('./pages/WorkoutPlayer'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Profile = lazy(() => import('./pages/Profile'))
const Achievements = lazy(() => import('./pages/Achievements'))
const Workout = lazy(() => import('./pages/Workout'))
const GymWorkout = lazy(() => import('./pages/GymWorkout'))
const Coach = lazy(() => import('./pages/Coach'))
const LandingPage = lazy(() => import('./pages/LandingPage'))

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-sm text-gray-400" role="status">Loading VITAL Fitness…</div>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<ProtectedRoute><Hub /></ProtectedRoute>} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/coach" element={<ProtectedRoute><Coach /></ProtectedRoute>} />
          <Route path="/workout/gym" element={<ProtectedRoute><GymWorkout /></ProtectedRoute>} />
          <Route path="/diet" element={<ProtectedRoute><Diet /></ProtectedRoute>} />
          <Route path="/fitness" element={<ProtectedRoute><Fitness /></ProtectedRoute>} />
          <Route path="/fitness/workout" element={<ProtectedRoute><WorkoutPlayer /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/achievements" element={<ProtectedRoute><Achievements /></ProtectedRoute>} />
        </Route>
      </Routes>
    </Suspense>
  )
}
