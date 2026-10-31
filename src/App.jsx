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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Hub />} />
        <Route path="/workout" element={<Workout />} />
        <Route path="/workout/gym" element={<GymWorkout />} />
        <Route path="/diet" element={<Diet />} />
        <Route path="/fitness" element={<Fitness />} />
        <Route path="/fitness/workout" element={<WorkoutPlayer />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/achievements" element={<Achievements />} />
      </Route>
    </Routes>
  )
}