// components/AgentSelector.jsx
import { useChatStore } from '../stores/chatStore'

export default function AgentSelector({ open = false, onSelect }) {
  const { agents, activeAgentId, setAgent } = useChatStore()
  const initials = (name = '') => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  function handleSelect(id) {
    setAgent(id)
    onSelect?.()
  }

  return (
    <aside id="scene-sidebar" className={`agent-selector ${open ? 'open' : ''}`}>
      <p className="selector-label">Escenas del barrio</p>
      <div className="agent-grid">
        {agents.map(agent => {
          return (
          <button
            key={agent.id}
            className={`agent-card ${activeAgentId === agent.id ? 'active' : ''}`}
            style={{ '--agent-color': agent.color }}
            title={`Entrar a la escena de ${agent.name}`}
            onClick={() => handleSelect(agent.id)}
          >
            <span className="agent-token">{initials(agent.name)}</span>
            <span className="agent-name">{agent.name}</span>
            <span className="agent-role">{agent.role}</span>
            <span className="agent-loc">{agent.location}</span>
          </button>
          )
        })}
      </div>
    </aside>
  )
}
