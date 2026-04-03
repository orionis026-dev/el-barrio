import { Box3, QuadraticBezierCurve3, Vector3 } from 'three'
import { Billboard, Clone, Html, useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { useChatStore } from '../../stores/chatStore'
import ComicSpeechBubble, { getPortalBubbleVariant } from '../components/ComicSpeechBubble'

function findDialogueAnchor(scene) {
  let bestCandidate = null

  scene.updateMatrixWorld(true)

  scene.traverse((node) => {
    if (!node || node === scene) return

    const name = String(node.name || '').toLowerCase()
    const isAnchorLike = /anchor|empty|target|socket/.test(name)
    const isDialogueLike = /bubble|dialogue|speech|talk|face|head/.test(name)

    if (!isAnchorLike || !isDialogueLike) return

    const position = new Vector3()
    node.getWorldPosition(position)

    let score = 10
    if (/face|head/.test(name)) score += 8
    if (/speech|dialogue|bubble/.test(name)) score += 6
    if (/left|right/.test(name)) score += 2

    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = {
        score,
        position,
        side: name.includes('left') ? 'left' : name.includes('right') ? 'right' : null
      }
    }
  })

  return bestCandidate
}

function findBubbleOffset(scene) {
  let bestCandidate = null

  scene.updateMatrixWorld(true)

  scene.traverse((node) => {
    if (!node || node === scene) return

    const name = String(node.name || '').toLowerCase()
    const isOffsetLike = /offset|label|balloon/.test(name)
    const isDialogueLike = /bubble|dialogue|speech|talk/.test(name)

    if (!isOffsetLike || !isDialogueLike) return

    const position = new Vector3()
    node.getWorldPosition(position)

    let score = 10
    if (/speech/.test(name)) score += 6
    if (/bubble/.test(name)) score += 4
    if (/left|right/.test(name)) score += 2

    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = {
        score,
        position,
        side: name.includes('left') ? 'left' : name.includes('right') ? 'right' : null
      }
    }
  })

  return bestCandidate
}

function pickFigureMesh(scene) {
  const candidates = []

  scene.traverse((node) => {
    if (!node?.isMesh) return

    const box = new Box3().setFromObject(node)
    const size = new Vector3()
    box.getSize(size)

    if (size.lengthSq() === 0) return

    const materials = Array.isArray(node.material) ? node.material : [node.material]
    const hasTransparentMaterial = materials.some((material) => {
      if (!material) return false
      return material.transparent || material.opacity < 1 || material.alphaTest > 0
    })

    const longest = Math.max(size.x, size.y, size.z, 0.0001)
    const shortest = Math.min(size.x, size.y, size.z, longest)
    const isFlatShape = shortest / longest < 0.12
    const looksLikeHelper = /sphere|helper|rig|armature/i.test(node.name || '')

    let score = size.x * size.y
    if (hasTransparentMaterial) score += 10
    if (isFlatShape) score += 6
    if (looksLikeHelper) score -= 12

    candidates.push({ box, score })
  })

  if (!candidates.length) return null

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].box
}

function WorldModel({ config, children }) {
  const {
    modelPath,
    modelScale,
    modelPosition,
    modelRotation
  } = config

  const { scene } = useGLTF(modelPath)

  const { center, fitScale, bubbleAnchor, bubbleSide, bubbleOffset } = useMemo(() => {
    const probe = scene.clone()
    const sceneBox = new Box3().setFromObject(probe)
    const size = new Vector3()
    const computedCenter = new Vector3()
    const figureBox = pickFigureMesh(probe) || sceneBox
    const dialogueAnchor = findDialogueAnchor(probe)
    const bubbleOffsetTarget = findBubbleOffset(probe)
    const figureSize = new Vector3()
    const anchorPoint = new Vector3()
    const bubblePoint = new Vector3()

    sceneBox.getSize(size)
    sceneBox.getCenter(computedCenter)
    figureBox.getSize(figureSize)

    const longestSide = Math.max(size.x, size.y, size.z, 0.001)
    const baseScale = Array.isArray(modelScale) ? modelScale[0] : modelScale
    const computedFitScale = (1.75 / longestSide) * (baseScale || 1)

    if (dialogueAnchor?.position) {
      anchorPoint.copy(dialogueAnchor.position)
    } else {
      anchorPoint.set(
        figureBox.max.x - figureSize.x * 0.12,
        figureBox.max.y - figureSize.y * 0.2,
        figureBox.max.z + Math.max(figureSize.z * 0.16, 0.08)
      )
    }

    if (bubbleOffsetTarget?.position) {
      bubblePoint.copy(bubbleOffsetTarget.position)
    } else {
      bubblePoint.set(
        anchorPoint.x + Math.max(figureSize.x * 0.16, 0.06),
        anchorPoint.y + Math.max(figureSize.y * 0.16, 0.08),
        anchorPoint.z + Math.max(figureSize.z * 0.04, 0.02)
      )
    }

    const computedBubbleSide =
      bubbleOffsetTarget?.side ||
      dialogueAnchor?.side ||
      (bubblePoint.x >= anchorPoint.x ? 'right' : 'left')

    return {
      center: computedCenter,
      fitScale: computedFitScale,
      bubbleAnchor: [
        (anchorPoint.x - computedCenter.x) * computedFitScale,
        (anchorPoint.y - computedCenter.y) * computedFitScale,
        (anchorPoint.z - computedCenter.z) * computedFitScale + 0.08
      ],
      bubbleSide: computedBubbleSide,
      bubbleOffset: [
        (bubblePoint.x - anchorPoint.x) * computedFitScale,
        (bubblePoint.y - anchorPoint.y) * computedFitScale,
        (bubblePoint.z - anchorPoint.z) * computedFitScale
      ]
    }
  }, [scene, modelScale])

  return (
    <group position={modelPosition} rotation={modelRotation}>
      {children && (
        <group position={bubbleAnchor}>
          {typeof children === 'function' ? children({ side: bubbleSide, bubbleOffset }) : children}
        </group>
      )}
      <group scale={[fitScale, fitScale, fitScale]}>
        <group position={[-center.x, -center.y, -center.z]}>
          <Clone object={scene} />
        </group>
      </group>
    </group>
  )
}

function DialogueTail({ target, side = 'right', faded = false }) {
  const dots = useMemo(() => {
    const end = new Vector3(...target)
    const control = new Vector3(
      target[0] * 0.48 + (side === 'right' ? 0.03 : -0.03),
      target[1] * 0.54 + Math.max(0.08, Math.abs(target[1]) * 0.15),
      target[2] * 0.34
    )
    const curve = new QuadraticBezierCurve3(new Vector3(0, 0, 0), control, end)
    const length = Math.max(end.length(), 0.001)
    const endScale = Math.max(0.032, Math.min(0.06, length * 0.16))

    return [
      { point: curve.getPoint(0.26).toArray(), radius: endScale * 0.34 },
      { point: curve.getPoint(0.54).toArray(), radius: endScale * 0.56 },
      { point: curve.getPoint(0.82).toArray(), radius: endScale * 0.88 }
    ]
  }, [side, target])

  return (
    <group renderOrder={30}>
      {dots.map(({ point, radius }, index) => (
        <Billboard key={`${point.join(':')}-${radius}-${index}`} position={point} follow renderOrder={30 + index}>
          <group>
            <mesh renderOrder={30 + index}>
              <circleGeometry args={[radius, 28]} />
              <meshBasicMaterial
                color="#2a2f39"
                transparent
                opacity={faded ? 0 : 0.34}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 0, 0.001]} renderOrder={31 + index}>
              <circleGeometry args={[radius * 0.78, 28]} />
              <meshBasicMaterial
                color="#f7f1e6"
                transparent
                opacity={faded ? 0 : 0.72}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          </group>
        </Billboard>
      ))}
    </group>
  )
}

function PortalDialogue({ agentId, accent, glow, side = 'right', bubbleOffset = [0, 0, 0] }) {
  const { conversations, loading, activeAgentId } = useChatStore()
  const [isFaded, setIsFaded] = useState(false)

  const { latestUser, latestAssistant, variant } = useMemo(() => {
    const messages = conversations?.[agentId] || []
    let user = null
    let assistant = null

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (!user && messages[i]?.role === 'user') user = messages[i]?.content || ''
      if (!assistant && messages[i]?.role === 'assistant') assistant = messages[i]?.content || ''
      if (user && assistant) break
    }

    const trim = (text, max = 160) => {
      if (!text) return null
      return text.length > max ? `${text.slice(0, max - 1)}…` : text
    }

    return {
      latestUser: trim(user, 120),
      latestAssistant: trim(assistant, 220),
      variant: getPortalBubbleVariant(agentId)
    }
  }, [conversations, agentId])

  const typing = loading && activeAgentId === agentId
  const assistantText = latestAssistant || (typing ? 'Escribiendo…' : null)
  const bubbleSignature = `${latestUser || ''}::${assistantText || ''}::${typing ? 'typing' : 'idle'}`

  useEffect(() => {
    if (!latestUser && !assistantText) return

    setIsFaded(false)

    if (typing) return

    const fadeTimer = window.setTimeout(() => {
      setIsFaded(true)
    }, 6500)

    return () => {
      window.clearTimeout(fadeTimer)
    }
  }, [bubbleSignature, latestUser, assistantText, typing])

  if (!latestUser && !assistantText) return null

  return (
    <group>
      <DialogueTail target={bubbleOffset} side={side} faded={isFaded} />
      <group position={bubbleOffset}>
        <Html
          transform
          sprite
          distanceFactor={1.12}
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
        >
          <ComicSpeechBubble
            userText={latestUser}
            assistantText={assistantText}
            variant={variant}
            accent={accent}
            glow={glow}
            side={side}
            faded={isFaded}
          />
        </Html>
      </group>
    </group>
  )
}

export default function PortalWorld({ config, agentId, entered }) {
  const {
    background,
    wallColor,
    floorColor,
    glow,
    accent,
    modelPath,
    modelScale,
    modelPosition,
    modelRotation
  } = config

  return (
    <>
      <color attach="background" args={[background]} />
      <ambientLight intensity={0.6} />
      <pointLight position={[0, 2, 1]} intensity={1.5} color={glow} />
      <pointLight position={[-1.6, 1.2, -1.4]} intensity={0.35} color={accent} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.08, -0.8]} receiveShadow>
        <planeGeometry args={[7.5, 7.5]} />
        <meshStandardMaterial color={floorColor || '#171c23'} roughness={1} />
      </mesh>

      <mesh position={[0, 0.04, -5.8]} receiveShadow>
        <planeGeometry args={[7.2, 4.8]} />
        <meshStandardMaterial color={wallColor || '#2b425d'} roughness={0.95} />
      </mesh>

      {modelPath && (
        <WorldModel config={config}>
          {({ side, bubbleOffset }) =>
            entered && agentId ? (
              <PortalDialogue
                agentId={agentId}
                accent={accent}
                glow={glow}
                side={side}
                bubbleOffset={bubbleOffset}
              />
            ) : null
          }
        </WorldModel>
      )}
      {!modelPath && entered && agentId && <PortalDialogue agentId={agentId} accent={accent} glow={glow} />}
    </>
  )
}
