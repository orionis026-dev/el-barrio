// App.jsx — La Esquina · Componente raíz
import { useEffect, useState } from 'react'
import { useChatStore } from './stores/chatStore'
import AgentSelector from './components/AgentSelector'
import ChatWindow from './components/ChatWindow'
import StatusBar from './components/StatusBar'
import './App.css'

export default function App() {
  const { fetchAgents, fetchHealth } = useChatStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    fetchAgents()
    fetchHealth()
    // Polling de salud cada 30s
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="app">
      <div className="grain" />
      <div className="flag-bar" />

      <header className="app-header">
        <div className="header-left">
          <button
            className="hash-toggle"
            onClick={() => setSidebarOpen(v => !v)}
            aria-expanded={sidebarOpen}
            aria-controls="scene-sidebar"
            title="Abrir escenas"
          >
            #
          </button>
          <div className="logo">
            La <span>Esquina</span>
          </div>
        </div>
        <StatusBar />
      </header>

      <main className="app-main">
        <AgentSelector open={sidebarOpen} onSelect={() => setSidebarOpen(false)} />
        <ChatWindow />
      </main>
    </div>
  )
}
