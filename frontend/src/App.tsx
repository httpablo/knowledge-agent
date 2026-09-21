import { Route, Routes } from 'react-router-dom'

import LanguageSelector from './components/LanguageSelector'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

function App() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
        <div className="mt-8 border-t border-border pt-6">
          <LanguageSelector />
        </div>
      </div>
    </main>
  )
}

export default App
