// components/StatusBar.jsx
import { useChatStore } from '../stores/chatStore'

export default function StatusBar() {
  const { health, provider } = useChatStore()

  if (!health) return null

  return (
    <div className="status-bar">
      <span className={`status-pill ${health.providers?.ollama ? 'ok' : 'off'}`}>
        Ollama
      </span>
      <span className={`status-pill ${health.providers?.claude ? 'ok' : 'off'}`}>
        Claude
      </span>
      <span className={`status-pill ${health.providers?.openrouter ? 'ok' : 'off'}`}>
        OpenRouter
      </span>
      <span className="status-pill active-provider">
        Usando: <strong>{provider === 'ollama' ? 'local' : provider === 'openrouter' ? 'OpenRouter' : 'Claude API'}</strong>
      </span>
    </div>
  )
}
