# El barrio

Aplicacion con backend Node/Express y frontend React/Vite para conversar con personajes cubanos en escenas 3D.

El proyecto mezcla:
- chat con personalidades definidas por avatar
- streaming de respuestas token a token
- memoria por usuario
- RAG local con LanceDB
- escenas 3D con `three`, `@react-three/fiber` y `@react-three/drei`

## Estado actual

Personajes activos:
- Don Paco
- Dona Marta
- Yanelis
- Alina

Nota importante:
- El `agentId` interno de Alina sigue siendo `el_yoyo` por compatibilidad con rutas, memoria y fallback del backend.

## Estructura

```text
El barrio/
├── backend/
│   ├── agents/
│   ├── memory/
│   ├── providers/
│   ├── rag/
│   ├── scripts/
│   └── server.js
├── frontend-cards/
│   ├── public/
│   ├── src/
│   └── vite.config.js
└── README.md
```

## Requisitos

- Node.js 18 o superior
- npm
- Una fuente de modelo configurada:
  - OpenRouter
  - Ollama local
  - Anthropic

## Instalacion

Instala dependencias por separado:

```bash
cd backend
npm install

cd ../frontend-cards
npm install
```

## Variables de entorno

Crea `backend/.env` con algo parecido a esto:

```env
PORT=3001
FRONTEND_URL=http://localhost:5173

MODEL_PROVIDER=openrouter

OPENROUTER_API_KEY=tu_api_key
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct

OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-haiku-4-5-20251001

LANCEDB_PATH=./data/lancedb
EMBEDDINGS_MODEL=Xenova/multilingual-e5-small
```

Variables utiles opcionales del backend:

```env
MEMORY_SEARCH_MODE=hybrid
MEMORY_VECTOR_WEIGHT=0.7
MEMORY_TEXT_WEIGHT=0.3
MEMORY_FLUSH_ENABLED=true
MEMORY_SOFT_THRESHOLD_TOKENS=4000
CONTEXT_RESERVE_TOKENS_FLOOR=40000
```

## Desarrollo

Levanta backend y frontend en dos terminales.

Backend:

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend-cards
npm run dev
```

Por defecto:
- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`

El frontend habla con el backend por `/api`.

## Build del frontend

```bash
cd frontend-cards
npm run build
npm run preview
```

## Scripts

Backend:

```bash
npm run dev
npm start
npm run ingest
npm run scrape
```

Frontend:

```bash
npm run dev
npm run build
npm run preview
```

## Endpoints principales

Backend:

- `GET /agents`
- `GET /health`
- `GET /models`
- `POST /chat`
- `POST /memoria`
- `GET /memoria/:userId`
- `POST /memory/search`
- `GET /memory/get`
- `POST /ingest`

## Chat, memoria y RAG

- `POST /chat` construye el prompt final combinando:
  - prompt del personaje
  - estilo de dialogo
  - contexto RAG
  - memoria relevante del usuario
- La memoria vive en `backend/memoria/usuarios/`
- El corpus vectorial vive en `backend/data/lancedb/`
- Ambos directorios estan ignorados en git por defecto

## Escenas 3D y burbujas

Los modelos 3D del frontend viven en:

- `frontend-cards/public/scene/worlds/`

La configuracion de escenas esta en:

- `frontend-cards/src/scene/worlds/worldRegistry.js`
- `frontend-cards/src/scene/worlds/PortalWorld.jsx`

Para controlar mejor la burbuja desde Blender, el sistema reconoce empties como estos:

- `speech_anchor`
- `dialogue_anchor`
- `face_anchor`
- `head_anchor_left`
- `head_anchor_right`
- `speech_bubble_offset`

Convencion actual:

- `speech_anchor` marca el punto del rostro al que debe apuntar la cola
- `speech_bubble_offset` marca el punto base donde se engancha la burbuja

Si no existen empties, el frontend usa una heuristica sobre el GLB.

## Notas

- Los nombres de los paquetes siguen usando `la-esquina-*`; eso no rompe nada, pero se puede renombrar despues si quieres unificar branding.
- `frontend-cards/dist/`, `node_modules/`, `backend/data/` y `backend/memoria/` no se versionan.
