import { create } from 'zustand'

const DEFAULT_CUES = {
  emotion: 'neutral',
  gesture: 'idle',
  sceneCue: null
}

const DEFAULT_CARD_PORTAL_CAMERA = {
  enteredCameraOffset: { x: 0.1, y: -0.3, z: 1.1},
  enteredFocusOffset: { x: 0.32, y: 0, z: 1 },
  orbitAngleXDeg: 95,
  orbitAngleYDeg: 45,
  mouseDamping: 3
}

export const useSceneStore = create((set) => ({
  activeCornerId: null,
  cues: DEFAULT_CUES,
  sceneTheme: 'night',
  enteredCardId: null,
  cardPortalCamera: DEFAULT_CARD_PORTAL_CAMERA,

  setActiveCorner: (id) => set({ activeCornerId: id }),
  setSceneTheme: (sceneTheme) => set({ sceneTheme }),
  setEnteredCardId: (enteredCardId) => set({ enteredCardId }),
  setCardPortalCamera: (patch) => set((state) => ({
    cardPortalCamera: {
      enteredCameraOffset: {
        ...state.cardPortalCamera.enteredCameraOffset,
        ...(patch?.enteredCameraOffset || {})
      },
      enteredFocusOffset: {
        ...state.cardPortalCamera.enteredFocusOffset,
        ...(patch?.enteredFocusOffset || {})
      },
      orbitAngleXDeg: patch?.orbitAngleXDeg ?? state.cardPortalCamera.orbitAngleXDeg,
      orbitAngleYDeg: patch?.orbitAngleYDeg ?? state.cardPortalCamera.orbitAngleYDeg,
      mouseDamping: patch?.mouseDamping ?? state.cardPortalCamera.mouseDamping
    }
  })),
  resetCardPortalCamera: () => set({ cardPortalCamera: DEFAULT_CARD_PORTAL_CAMERA }),
  setCues: (next = {}) => set((state) => ({ cues: { ...state.cues, ...next } })),
  resetCues: () => set({ cues: DEFAULT_CUES })
}))
