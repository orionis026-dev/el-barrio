import { lazy, Suspense } from 'react'

const CardDeckSceneEngine = lazy(() => import('./CardDeckSceneEngine'))

export default function SceneEngine(props) {
  return (
    <Suspense fallback={null}>
      <CardDeckSceneEngine {...props} />
    </Suspense>
  )
}
