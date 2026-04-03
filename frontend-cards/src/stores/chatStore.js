// stores/chatStore.js — Estado global con Zustand
// CAMBIOS EN ESTE ARCHIVO:
//   + sendMessage() ahora usa fetch() con ReadableStream en lugar de axios
//   + los tokens llegan uno a uno y se van añadiendo a la burbuja en tiempo real
//   + lógica de fallback si el stream falla (respuesta completa sin stream)

import { create } from 'zustand'

// Usamos fetch nativo en lugar de axios porque axios no soporta streaming en browser
const BASE = '/api'

export const useChatStore = create((set, get) => ({
  // ─── STATE — sin cambios ────────────────────────────────────────
  agents: [],
  activeAgentId: 'yanelis',
  conversations: {},
  loading: false,
  error: null,
  provider: 'openrouter',
  health: null,
  userId: 'default_user', // [2026-03-11] añadido userId para memoria
  visitorMode: false,
  unlockedAgentIds: [],

  // ─── GETTERS — sin cambios ──────────────────────────────────────
  activeAgent: () => {
    const { agents, activeAgentId } = get()
    return agents.find(a => a.id === activeAgentId) || null
  },

  activeMessages: () => {
    const { conversations, activeAgentId } = get()
    return conversations[activeAgentId] || []
  },

  // ─── fetchAgents — sin cambios ──────────────────────────────────
  fetchAgents: async () => {
    try {
      const res = await fetch(`${BASE}/agents`)
      const data = await res.json()
      const convs = {}
      data.forEach(a => { convs[a.id] = [] })
      const defaultAgentId = data.some(a => a.id === 'yanelis')
        ? 'yanelis'
        : (data[0]?.id || null)

      set(state => ({
        agents: data,
        conversations: convs,
        activeAgentId: defaultAgentId || state.activeAgentId
      }))
    } catch {
      set({ error: 'No se pudo conectar con el backend' })
    }
  },

  // ─── fetchHealth — sin cambios ──────────────────────────────────
  fetchHealth: async () => {
    try {
      const res = await fetch(`${BASE}/health`)
      const data = await res.json()
      set({ health: data })
    } catch { }
  },

  setAgent: (agentId) => {
    set({ activeAgentId: agentId, error: null })
  },
  setProvider: (provider) => set({ provider }),

  // ─── sendMessage — MODIFICADO ───────────────────────────────────
  // ANTES: axios.post() esperaba la respuesta completa → res.json({ reply })
  // AHORA: fetch() con ReadableStream → lee tokens SSE uno a uno
  //
  // Flujo:
  //   1. Añade mensaje del usuario al estado (UX optimista)
  //   2. Añade burbuja vacía del asistente
  //   3. Abre stream con fetch()
  //   4. Lee tokens → va rellenando la burbuja en tiempo real
  //   5. Al terminar, marca loading=false
  sendMessage: async (content) => {
    const { activeAgentId, conversations, provider, userId } = get() // [2026-03-11] añadido userId
    const history = conversations[activeAgentId] || []

    // 1. Añadir mensaje del usuario inmediatamente
    const userMsg = { role: 'user', content }
    const withUser = [...history, userMsg]

    // 2. Añadir burbuja vacía del asistente (se irá llenando con tokens)
    const withEmpty = [...withUser, { role: 'assistant', content: '' }]

    set({
      conversations: { ...conversations, [activeAgentId]: withEmpty },
      loading: true,
      error: null
    })

    try {
      // 3. Abrir conexión con el backend — fetch() soporta streaming nativo
      const response = await fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: activeAgentId,
          messages: withUser,   // ← mandamos el historial SIN la burbuja vacía
          provider,
          userId  // [2026-03-11] enviar userId en cada request
        })
      })

      if (!response.ok) {
        throw new Error(`Backend respondió ${response.status}`)
      }

      // 4. Leer el stream token a token
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullReply = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine) continue

          // Caso 1: Es una línea de SSE (flujo estándar)
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6).trim()
            if (data === '[DONE]') break

            try {
              const { token } = JSON.parse(data)
              if (token) {
                fullReply += token
                updateLastMessage(fullReply)
              }
            } catch (e) {
              console.warn('[chat] error parseando token SSE:', e)
            }
          }
          // Caso 2: Es un JSON completo (fallback de Ollama/Claude o error)
          else if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
            try {
              const { reply } = JSON.parse(trimmedLine)
              if (reply) {
                fullReply = reply
                updateLastMessage(fullReply)
              }
            } catch (e) {
              console.warn('[chat] error parseando JSON directo:', e)
            }
          }
        }
      }

      // Helper para actualizar el estado
      function updateLastMessage(content) {
        set(state => {
          const msgs = [...(state.conversations[activeAgentId] || [])]
          if (msgs.length > 0) {
            msgs[msgs.length - 1] = { role: 'assistant', content }
          }
          return {
            conversations: { ...state.conversations, [activeAgentId]: msgs }
          }
        })
      }

      // 5. Stream terminado
      set({ loading: false })

    } catch (err) {
      console.error('[chat] stream error:', err.message)

      // Si el stream falla, limpiar la burbuja vacía y mostrar error
      set(state => ({
        loading: false,
        error: 'No se pudo conectar con el modelo. ¿Está el backend corriendo?',
        // Quitar la burbuja vacía del asistente y el mensaje del usuario
        conversations: {
          ...state.conversations,
          [activeAgentId]: history   // restaurar al estado anterior
        }
      }))
    }
  },

  // ─── clearConversation — sin cambios ────────────────────────────
  clearConversation: () => {
    const { activeAgentId, conversations } = get()
    set({ conversations: { ...conversations, [activeAgentId]: [] } })
  }
}))
