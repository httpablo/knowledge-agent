import { Route, Routes } from 'react-router-dom'

import CenteredPanel from './components/CenteredPanel'
import GuestOnlyRoute from './components/GuestOnlyRoute'
import RequireAuth from './components/RequireAuth'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import WorkspacePage from './pages/WorkspacePage'

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth>
            <WorkspacePage />
          </RequireAuth>
        }
      />
      <Route
        path="/login"
        element={
          <GuestOnlyRoute>
            <CenteredPanel>
              <LoginPage />
            </CenteredPanel>
          </GuestOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnlyRoute>
            <CenteredPanel>
              <RegisterPage />
            </CenteredPanel>
          </GuestOnlyRoute>
        }
      />
    </Routes>
  )
}

export default App
