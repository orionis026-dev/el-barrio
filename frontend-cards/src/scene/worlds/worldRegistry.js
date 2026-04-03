export const worldRegistry = {
  el_yoyo: {
    background: '#0b0e14',
    wallColor: '#233349',
    floorColor: '#151a22',
    glow: '#ffd8aa',
    accent: '#8aa6ff',
    modelPath: '/scene/worlds/41y42T.glb',
    modelScale: [2, 2, 2],
    modelPosition: [0, 0, -0.07],
    modelRotation: [0, Math.PI / 7, 0]
  },
  doña_marta: {
    background: '#0b0e14',
    wallColor: '#4a3a2a',
    floorColor: '#1b1a18',
    glow: '#ffd8aa',
    accent: '#d8b55b',
    modelPath: '/scene/worlds/carito.glb',
    modelScale: [1.4, 1.4, 1.4],
    modelPosition: [-0.12, -0.05, 0.2],
    modelRotation: [0, Math.PI / 1.6, 0]
  },
  yanelis: {
    background: '#0b0e14',
    wallColor: '#224036',
    floorColor: '#141a19',
    glow: '#ffd8aa',
    accent: '#7fd4b6',
    modelPath: '/scene/worlds/Trinidad.glb',
    modelScale: [2, 2, 2],
    modelPosition: [0, 0, 0],
    modelRotation: [0, 0, 0]
  },
  paco: {
    background: '#0b0e14',
    wallColor: '#2e3f57',
    floorColor: '#171c23',
    glow: '#ffd79d',
    accent: '#8bc2ff',
    modelPath: '/scene/worlds/paco.glb',
    modelScale: [1.7, 1.7, 1.7],
    modelPosition: [0.02, 0, -0.4],
    modelRotation: [0, -Math.PI / 1.2, 0]
  }
}

export function getWorldConfig(agentId) {
  return worldRegistry[agentId] || worldRegistry.el_yoyo
}
