# Scene Foundation

Base actual:

- `CardDeckSceneEngine.jsx`: variante tarjetas-portal (unica variante en este clon).
- `worlds/worldRegistry.js`: config por personaje.
- `worlds/PortalWorld.jsx`: mundo genérico dentro del portal.
- `../stores/sceneStore.js`: foco y entrada en tarjeta.

## Como meter tus GLB

1. Pon el archivo en `frontend-cards/public/scene/worlds/`.

Ejemplo:

- `frontend-cards/public/scene/worlds/paco.glb`
- `frontend-cards/public/scene/worlds/yanelis.glb`

2. Edita `worlds/worldRegistry.js`.

Ejemplo:

```js
paco: {
  ...,
  modelPath: '/scene/worlds/paco.glb',
  modelScale: 1.15,
  modelPosition: [0, -1.02, -0.58],
  modelRotation: [0, Math.PI * 0.15, 0]
}
```

3. Ajusta solo estos campos:

- `modelPath`
- `modelScale`
- `modelPosition`
- `modelRotation`

Si `modelPath` es `null`, el portal muestra un placeholder.

## Objetivo de esta base

No rehacer motor cada vez.
Solo cambiar config y assets por personaje.
