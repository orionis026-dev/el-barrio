import { useState, useRef, useEffect, useMemo } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useSceneStore } from '../stores/sceneStore'
import SceneEngine from '../scene/SceneEngine'

export default function ChatWindow() {
  const {
    agents,
    activeAgent,
    sendMessage,
    clearConversation,
    loading,
    error,
    provider,
    setProvider
  } = useChatStore()

  const [input, setInput] = useState('')
  const [showCameraTuner, setShowCameraTuner] = useState(false)
  const {
    setActiveCorner,
    setCues,
    sceneTheme,
    setSceneTheme,
    setEnteredCardId,
    cardPortalCamera,
    setCardPortalCamera,
    resetCardPortalCamera
  } = useSceneStore()

  const inputRef = useRef(null)

  const agent = activeAgent()
  const initials = (name = '') => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  useEffect(() => {
    inputRef.current?.focus()
  }, [agent?.id])

  useEffect(() => {
    if (!agent || !agents.length) return
    setActiveCorner(agent.id)
    setCues({ emotion: 'neutral', gesture: 'idle', sceneCue: null })
  }, [agent?.id, agents])

  const sceneStyle = useMemo(() => ({
    '--agent-color': agent?.color || '#ee9b00'
  }), [agent?.color])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    if (agent?.id) {
      setEnteredCardId(agent.id)
    }
    setInput('')
    await sendMessage(text)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleCameraOffset(group, axis, value) {
    const next = Number(value)
    if (group === 'camera') {
      setCardPortalCamera({ enteredCameraOffset: { [axis]: next } })
      return
    }
    setCardPortalCamera({ enteredFocusOffset: { [axis]: next } })
  }

  function handleCameraTuning(key, value) {
    setCardPortalCamera({ [key]: Number(value) })
  }

  if (!agent) {
    return (
      <div className="chat-window chat-empty">
        <p>Cargando escenas…</p>
      </div>
    )
  }

  return (
    <div className={`chat-window scene-theme-${sceneTheme} scene-variant-cards`} style={sceneStyle}>
      <SceneEngine
        agents={agents}
      />

      <div className="scene-vignette" />

      <div className="chat-overlay">
        <div className="chat-topbar">
          <div className="chat-avatar">{initials(agent.name)}</div>
          <div className="chat-agent-info">
            <span className="chat-agent-name">{agent.name}</span>
            <span className="chat-agent-sub">{agent.location} · Escena activa</span>
          </div>

          <div className="chat-controls">
            <div className="scene-variant-switch">
              <button
                className={`variant-btn ${sceneTheme === 'day' ? 'active' : ''}`}
                onClick={() => setSceneTheme('day')}
                title="Tema diurno"
              >
                Dia
              </button>
              <button
                className={`variant-btn ${sceneTheme === 'night' ? 'active' : ''}`}
                onClick={() => setSceneTheme('night')}
                title="Tema nocturno"
              >
                Noche
              </button>
            </div>
            <select
              className="provider-switch"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              title="Cambiar modelo"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama</option>
              <option value="claude">Claude</option>
            </select>
            <button
              className="btn-clear"
              onClick={clearConversation}
              title="Nueva conversación"
            >
              ↺
            </button>
            <button
              className={`btn-clear ${showCameraTuner ? 'btn-tool-active' : ''}`}
              onClick={() => setShowCameraTuner((prev) => !prev)}
              title="Ajustar camara dentro del portal"
            >
              Cam
            </button>
          </div>
        </div>

        {showCameraTuner && (
          <div className="camera-tuner">
            <div className="camera-tuner-head">
              <strong>Camera Tuner</strong>
              <button className="variant-btn" onClick={resetCardPortalCamera} title="Restaurar valores por defecto">
                Reset
              </button>
            </div>

            <div className="camera-tuner-group">
              <p className="camera-tuner-label">Posicion de camara al entrar</p>
              <label className="camera-tuner-row">
                <span>Cam X {cardPortalCamera.enteredCameraOffset.x.toFixed(2)}</span>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.01}
                  value={cardPortalCamera.enteredCameraOffset.x}
                  onChange={(e) => handleCameraOffset('camera', 'x', e.target.value)}
                />
              </label>
              <label className="camera-tuner-row">
                <span>Cam Y {cardPortalCamera.enteredCameraOffset.y.toFixed(2)}</span>
                <input
                  type="range"
                  min={-1}
                  max={2}
                  step={0.01}
                  value={cardPortalCamera.enteredCameraOffset.y}
                  onChange={(e) => handleCameraOffset('camera', 'y', e.target.value)}
                />
              </label>
              <label className="camera-tuner-row">
                <span>Cam Z {cardPortalCamera.enteredCameraOffset.z.toFixed(2)}</span>
                <input
                  type="range"
                  min={-1}
                  max={2}
                  step={0.01}
                  value={cardPortalCamera.enteredCameraOffset.z}
                  onChange={(e) => handleCameraOffset('camera', 'z', e.target.value)}
                />
              </label>
            </div>

            <div className="camera-tuner-group">
              <p className="camera-tuner-label">Punto al que mira la camara</p>
              <label className="camera-tuner-row">
                <span>Look X {cardPortalCamera.enteredFocusOffset.x.toFixed(2)}</span>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.01}
                  value={cardPortalCamera.enteredFocusOffset.x}
                  onChange={(e) => handleCameraOffset('focus', 'x', e.target.value)}
                />
              </label>
              <label className="camera-tuner-row">
                <span>Look Y {cardPortalCamera.enteredFocusOffset.y.toFixed(2)}</span>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.01}
                  value={cardPortalCamera.enteredFocusOffset.y}
                  onChange={(e) => handleCameraOffset('focus', 'y', e.target.value)}
                />
              </label>
              <label className="camera-tuner-row">
                <span>Look Z {cardPortalCamera.enteredFocusOffset.z.toFixed(2)}</span>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.01}
                  value={cardPortalCamera.enteredFocusOffset.z}
                  onChange={(e) => handleCameraOffset('focus', 'z', e.target.value)}
                />
              </label>
            </div>

            <div className="camera-tuner-group">
              <p className="camera-tuner-label">Orbit dentro del portal</p>
              <label className="camera-tuner-row">
                <span>Angulo X {cardPortalCamera.orbitAngleXDeg.toFixed(0)}°</span>
                <input
                  type="range"
                  min={20}
                  max={120}
                  step={1}
                  value={cardPortalCamera.orbitAngleXDeg}
                  onChange={(e) => handleCameraTuning('orbitAngleXDeg', e.target.value)}
                />
              </label>
              <label className="camera-tuner-row">
                <span>Angulo Y {cardPortalCamera.orbitAngleYDeg.toFixed(0)}°</span>
                <input
                  type="range"
                  min={10}
                  max={80}
                  step={1}
                  value={cardPortalCamera.orbitAngleYDeg}
                  onChange={(e) => handleCameraTuning('orbitAngleYDeg', e.target.value)}
                />
              </label>
              <label className="camera-tuner-row">
                <span>Damping {cardPortalCamera.mouseDamping.toFixed(1)}</span>
                <input
                  type="range"
                  min={1}
                  max={16}
                  step={0.1}
                  value={cardPortalCamera.mouseDamping}
                  onChange={(e) => handleCameraTuning('mouseDamping', e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        {error && <div className="msg-error">⚠ {error}</div>}
        <div className="chat-spacer" />

        <div className="chat-input-bar">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Escribe en la esquina de ${agent.name}...`}
            rows={1}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}
