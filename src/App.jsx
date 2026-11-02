import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Hub from './pages/Hub'
import Diet from './pages/Diet'
import Fitness from './pages/Fitness'
import WorkoutPlayer from './pages/WorkoutPlayer'
import Analytics from './pages/Analytics'
import Assistant from './pages/Assistant'
import Profile from './pages/Profile'
import Achievements from './pages/Achievements'
import Workout from './pages/Workout'
import GymWorkout from './pages/GymWorkout'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Hub />} />
        <Route path="/workout" element={<Workout />} />
        <Route path="/workout/gym" element={<ProtectedRoute><GymWorkout /></ProtectedRoute>} />
        <Route path="/diet" element={<ProtectedRoute><Diet /></ProtectedRoute>} />
        <Route path="/fitness" element={<ProtectedRoute><Fitness /></ProtectedRoute>} />
        <Route path="/fitness/workout" element={<ProtectedRoute><WorkoutPlayer /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/assistant" element={<ProtectedRoute><Assistant /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/achievements" element={<ProtectedRoute><Achievements /></ProtectedRoute>} />
      </Route>
    </Routes>
  )
}
