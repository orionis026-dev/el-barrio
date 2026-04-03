import { DoubleSide, MOUSE, MathUtils, Vector3 } from 'three'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Float, MeshPortalMaterial, OrbitControls, RoundedBox, Sky, Text, useCursor } from '@react-three/drei'
import { useChatStore } from '../stores/chatStore'
import { useSceneStore } from '../stores/sceneStore'
import PortalWorld from './worlds/PortalWorld'
import { getWorldConfig } from './worlds/worldRegistry'

function PortalCard({ agent, index, entered, onEnter }) {
  const frameRef = useRef(null)
  const portalRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  const token = useMemo(
    () => String(agent.name || '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    [agent.name]
  )
  const locationLabel = useMemo(() => String(agent.location || agent.id || '').slice(0, 24), [agent.location, agent.id])
  // Config visual/modelo del mundo interno para esta card.
  const worldConfig = useMemo(() => getWorldConfig(agent.id), [agent.id])

  useFrame((_, delta) => {
    if (!frameRef.current || !portalRef.current) return

    // Estado base (deck) vs estado "entrado" (doble click en la tarjeta).
    // targetX: separacion horizontal de cartas en el deck.
    const targetX = entered ? 0 : index * 1.15
    // targetY: inclinacion vertical sutil (las laterales bajan un poco).
    const targetY = entered ? 0 : Math.abs(index) * -0.03
    // targetZ: al entrar se acerca a camara; hover suma micro-zoom.
    const targetZ = entered ? 0.82 : -Math.abs(index) * 0.08 + (hovered ? 0.03 : 0)
    // targetRotY/targetRotZ: abanico de deck vs frontal al entrar.
    const targetRotY = entered ? 0 : index * -0.48
    const targetRotZ = entered ? 0 : index * -0.02
    // targetScale: escala principal; entered > hover > reposo.
    const targetScale = entered ? 1.46 : hovered ? 1.02 : 1
    // Blend del portal: 0 = cerrado, 1 = abierto.
    const targetBlend = entered ? 1 : 0

    // 5.2 controla la rapidez de transicion (mas alto = mas rapido).
    // Damping unificado para que posicion, rotacion y portal transicionen en bloque.
    frameRef.current.position.x = MathUtils.damp(frameRef.current.position.x, targetX, 5.2, delta)
    frameRef.current.position.y = MathUtils.damp(frameRef.current.position.y, targetY, 5.2, delta)
    frameRef.current.position.z = MathUtils.damp(frameRef.current.position.z, targetZ, 5.2, delta)
    frameRef.current.rotation.y = MathUtils.damp(frameRef.current.rotation.y, targetRotY, 5.2, delta)
    frameRef.current.rotation.z = MathUtils.damp(frameRef.current.rotation.z, targetRotZ, 5.2, delta)
    frameRef.current.scale.x = MathUtils.damp(frameRef.current.scale.x, targetScale, 5.2, delta)
    frameRef.current.scale.y = MathUtils.damp(frameRef.current.scale.y, targetScale, 5.2, delta)
    frameRef.current.scale.z = MathUtils.damp(frameRef.current.scale.z, 1, 5.2, delta)
    portalRef.current.blend = MathUtils.damp(portalRef.current.blend, targetBlend, 5.2, delta)
  })

  return (
    <group
      ref={frameRef}
      name={agent.id}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onEnter(agent.id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        setHovered(false)
      }}
    >
      <Text
        position={[-0.35, 0.71, 0.045]}
        fontSize={0.135}
        color="#eef4ff"
        anchorX="left"
        anchorY="top"
        lineHeight={0.82}
        maxWidth={0.7}
        outlineWidth={0.012}
        outlineColor="#0a0d14"
        renderOrder={10}
        material-toneMapped={false}
      >
        {agent.name}
      </Text>
      <Text
        position={[0.39, -0.67, 0.045]}
        fontSize={0.072}
        color="#d7e0f4"
        anchorX="right"
        anchorY="bottom"
        outlineWidth={0.01}
        outlineColor="#0a0d14"
        renderOrder={10}
        material-toneMapped={false}
      >
        /{token}
      </Text>
      <Text
        position={[0, -0.685, 0.045]}
        fontSize={0.04}
        color="#d7e0f4"
        anchorX="right"
        anchorY="bottom"
        maxWidth={0.55}
        outlineWidth={0.008}
        outlineColor="#0a0d14"
        renderOrder={10}
        material-toneMapped={false}
      >
        {locationLabel}
      </Text>

      <RoundedBox args={[1, 1.618, 0.02]} radius={0.115} smoothness={6} castShadow receiveShadow>
        {/* events={entered}: el mundo interno solo recibe eventos cuando la card esta activa. */}
        <MeshPortalMaterial ref={portalRef} side={DoubleSide} events={entered}>
          <PortalWorld config={worldConfig} agentId={agent.id} entered={entered} />
        </MeshPortalMaterial>
      </RoundedBox>

      <RoundedBox args={[1.03, 1.648, 0.012]} radius={0.12} smoothness={6} position={[0, 0, -0.018]} receiveShadow>
        <meshStandardMaterial color="#c5ccd8" roughness={0.72} metalness={0.02} />
      </RoundedBox>
    </group>
  )
}

function Rig({ enteredCardId }) {
  const controls = useRef(null)
  const { camera, scene } = useThree()
  const {
    enteredCameraOffset,
    enteredFocusOffset,
    orbitAngleXDeg,
    orbitAngleYDeg,
    mouseDamping
  } = useSceneStore((state) => state.cardPortalCamera)
  // Camara por defecto ANTES de doble click en una card.
  const defaultPos = useMemo(() => new Vector3(0, 0.12, 5.9), [])
  const defaultTarget = useMemo(() => new Vector3(0, -0.04, 0), [])
  // Buffers reutilizados para no crear Vector3 cada render.
  const cameraPosition = useMemo(() => new Vector3(), [])
  const focusTarget = useMemo(() => new Vector3(), [])
  const baseAzimuthRef = useRef(0)
  const basePolarRef = useRef(Math.PI / 2)

  useEffect(() => {
    if (!enteredCardId) {
      // Escena principal: quitamos el paneo por mover el mouse.
      // La camara se mueve solo con drag y con un angulo moderado.
      camera.position.copy(defaultPos)
      if (controls.current) {
        controls.current.target.copy(defaultTarget)
        controls.current.minAzimuthAngle = MathUtils.degToRad(-26)
        controls.current.maxAzimuthAngle = MathUtils.degToRad(26)
        controls.current.minPolarAngle = MathUtils.degToRad(72)
        controls.current.maxPolarAngle = MathUtils.degToRad(102)
        controls.current.enableRotate = true
        controls.current.update()
      }
      return
    }

    const activeCard = scene.getObjectByName(enteredCardId)
    if (!activeCard || !controls.current) return

    // Posicion/target base del portal; OrbitControls orbita alrededor de este target.
    activeCard.localToWorld(
      cameraPosition.set(enteredCameraOffset.x, enteredCameraOffset.y, enteredCameraOffset.z)
    )
    activeCard.localToWorld(
      focusTarget.set(enteredFocusOffset.x, enteredFocusOffset.y, enteredFocusOffset.z)
    )
    camera.position.copy(cameraPosition)
    controls.current.target.copy(focusTarget)
    controls.current.update()

    // Dentro del portal dejamos drag, pero con mas angulo en X que en Y.
    baseAzimuthRef.current = controls.current.getAzimuthalAngle()
    basePolarRef.current = controls.current.getPolarAngle()

    const halfAngleXRad = MathUtils.degToRad(Math.max(1, orbitAngleXDeg) * 0.5)
    const halfAngleYRad = MathUtils.degToRad(Math.max(1, orbitAngleYDeg) * 0.5)
    controls.current.minAzimuthAngle = baseAzimuthRef.current - halfAngleXRad
    controls.current.maxAzimuthAngle = baseAzimuthRef.current + halfAngleXRad
    controls.current.minPolarAngle = Math.max(0.01, basePolarRef.current - halfAngleYRad)
    controls.current.maxPolarAngle = Math.min(Math.PI - 0.01, basePolarRef.current + halfAngleYRad)
    controls.current.enableRotate = true
    controls.current.update()
  }, [
    enteredCardId,
    camera,
    scene,
    defaultPos,
    defaultTarget,
    cameraPosition,
    focusTarget,
    enteredCameraOffset.x,
    enteredCameraOffset.y,
    enteredCameraOffset.z,
    enteredFocusOffset.x,
    enteredFocusOffset.y,
    enteredFocusOffset.z,
    orbitAngleXDeg,
    orbitAngleYDeg,
    mouseDamping
  ])

  const dampingFactor = MathUtils.clamp(mouseDamping / 100, 0.02, 0.2)

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableZoom={false}
      enableRotate
      enableDamping
      dampingFactor={dampingFactor}
      rotateSpeed={0.65}
      mouseButtons={{
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.ROTATE
      }}
    />
  )
}

function GalleryShell({ sceneTheme }) {
  const isDay = sceneTheme === 'day'

  if (isDay) {
    return (
      <>
        <color attach="background" args={['#e6edf7']} />
        <fog attach="fog" args={['#e6edf7', 7, 42]} />
        <Sky
          distance={180}
          sunPosition={[4, 6, -5]}
          turbidity={7}
          rayleigh={2.1}
          mieCoefficient={0.018}
          mieDirectionalG={0.78}
        />
        <ambientLight intensity={0.78} />
        <hemisphereLight intensity={0.72} color="#f8fbff" groundColor="#c0ccdf" />
        <directionalLight position={[5.5, 9, 4.5]} intensity={1.2} castShadow shadow-bias={-0.0001} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
          <circleGeometry args={[20, 96]} />
          <meshStandardMaterial color="#d9e2ee" roughness={1} metalness={0} />
        </mesh>

        <ContactShadows
          renderOrder={-1}
          position={[0, -1.34, 0]}
          opacity={0.2}
          blur={2.8}
          far={7}
          scale={9}
          color="#3b4a63"
        />
      </>
    )
  }

  return (
    <>
      <color attach="background" args={['#07090f']} />
      <fog attach="fog" args={['#07090f', 8, 22]} />
      <ambientLight intensity={0.38} />
      <hemisphereLight intensity={0.5} color="#d8e5ff" groundColor="#090b11" />
      <spotLight
        position={[0, 8, 5]}
        angle={0.34}
        penumbra={1}
        intensity={1.25}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0001}
      />
      <spotLight position={[-6, 4, 1]} angle={0.45} penumbra={1} intensity={0.36} color="#7ea6ff" />
      <spotLight position={[6, 4, 1]} angle={0.45} penumbra={1} intensity={0.32} color="#ffd1a2" />

      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 2.4, -8.5]} receiveShadow>
        <cylinderGeometry args={[9.5, 9.5, 13, 96, 1, true, Math.PI * 0.21, Math.PI * 0.58]} />
        <meshStandardMaterial color="#10141d" side={DoubleSide} roughness={1} metalness={0.02} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <circleGeometry args={[9.5, 96]} />
        <meshStandardMaterial color="#0c1017" roughness={1} metalness={0.04} />
      </mesh>

      <mesh position={[0, -1.54, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[4.9, 5.6, 0.36, 96]} />
        <meshStandardMaterial color="#141a24" roughness={0.94} metalness={0.05} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.34, 0]}>
        <ringGeometry args={[4.15, 5.35, 96]} />
        <meshBasicMaterial color="#2f3746" transparent opacity={0.58} />
      </mesh>

      <RoundedBox args={[0.34, 4.8, 0.3]} radius={0.08} smoothness={4} position={[-5.8, 0.55, -3.5]} rotation={[0, 0.18, 0]}>
        <meshStandardMaterial color="#171c27" roughness={0.94} metalness={0.03} />
      </RoundedBox>
      <RoundedBox args={[0.34, 4.8, 0.3]} radius={0.08} smoothness={4} position={[5.8, 0.55, -3.5]} rotation={[0, -0.18, 0]}>
        <meshStandardMaterial color="#171c27" roughness={0.94} metalness={0.03} />
      </RoundedBox>

      <Float speed={1.2} rotationIntensity={0.18} floatIntensity={0.45} position={[-2.8, 2.7, -2.6]}>
        <mesh>
          <torusGeometry args={[0.58, 0.035, 18, 72]} />
          <meshStandardMaterial color="#8aaeff" emissive="#8aaeff" emissiveIntensity={0.85} roughness={0.4} metalness={0.08} />
        </mesh>
      </Float>
      <Float speed={1} rotationIntensity={0.14} floatIntensity={0.38} position={[2.9, 2.3, -2.2]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.44, 0.03, 18, 72]} />
          <meshStandardMaterial color="#ffc48b" emissive="#ffc48b" emissiveIntensity={0.8} roughness={0.42} metalness={0.08} />
        </mesh>
      </Float>

      <ContactShadows
        renderOrder={-1}
        position={[0, -1.34, 0]}
        opacity={0.55}
        blur={2.6}
        far={8}
        scale={12}
        color="#000000"
      />
    </>
  )
}

function DeckScene({ agents, enteredCardId, onEnter, sceneTheme }) {
  return (
    <>
      <GalleryShell sceneTheme={sceneTheme} />

      {agents.map((agent, idx) => {
        const stackIndex = idx - (agents.length - 1) / 2
        return (
          <PortalCard
            key={agent.id}
            agent={agent}
            index={stackIndex}
            entered={enteredCardId === agent.id}
            onEnter={onEnter}
          />
        )
      })}

      <Rig enteredCardId={enteredCardId} />
    </>
  )
}

export default function CardDeckSceneEngine({ agents, onPointerMove, onPointerLeave }) {
  const { setAgent } = useChatStore()
  const { enteredCardId, setEnteredCardId, sceneTheme } = useSceneStore()

  function handleEnter(agentId) {
    // Doble click:
    // 1) cambia el agente activo del chat
    // 2) toggle de entrada/salida de la card
    setAgent(agentId)
    setEnteredCardId(enteredCardId === agentId ? null : agentId)
  }

  return (
    <div className="scene-shell scene-shell-cards" onMouseMove={onPointerMove} onMouseLeave={onPointerLeave}>
      <Canvas
        flat
        shadows
        // Estado inicial de camara del canvas (Rig lo ajusta dinamicamente luego).
        camera={{ fov: 50, position: [0, 0.06, 6.2] }}
        onPointerMissed={() => {
          // Click fuera de cards: cerrar portal activo y volver a vista deck.
          if (enteredCardId) setEnteredCardId(null)
        }}
      >
        <Suspense fallback={null}>
          <DeckScene
            agents={agents}
            enteredCardId={enteredCardId}
            sceneTheme={sceneTheme}
            onEnter={handleEnter}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
