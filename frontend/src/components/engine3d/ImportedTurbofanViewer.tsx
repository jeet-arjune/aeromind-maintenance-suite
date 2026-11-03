import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Cable, Maximize2, Pause, Play, RadioTower, Rotate3D, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import './ImportedTurbofanViewer.css'

type Zone = 'fan' | 'compressor' | 'combustor' | 'turbine'
type AvailableSensor = { id: string; priority?: string; detectorCount?: number }

type Props = {
  selectedZone: string
  onSelectZone: (zone: string) => void
  selectedSensor?: string
  onSelectSensor?: (sensor: string) => void
  availableSensors?: AvailableSensor[]
  variant?: 'explorer' | 'hero'
}

const MODEL_PATH = '/models/turbofan/scene.gltf'
const sections: { id: Zone; label: string; description: string }[] = [
  { id: 'fan', label: 'Front / intake', description: 'Illustrative front intake and fan-side region' },
  { id: 'compressor', label: 'Compressor', description: 'Illustrative compression-stage region' },
  { id: 'combustor', label: 'Combustor', description: 'Illustrative combustion-system region' },
  { id: 'turbine', label: 'Turbine / exhaust', description: 'Illustrative rear turbine and exhaust region' },
]

// This model has material-grouped meshes, not a documented component hierarchy.
// These boundaries are visual interaction regions, NOT validated engineering coordinates.
function zoneAtX(x: number): Zone {
  if (x < -1.35) return 'fan'
  if (x < -0.25) return 'compressor'
  if (x < 0.95) return 'combustor'
  return 'turbine'
}

function channelNumber(id: string): number | null {
  const match = id.match(/(\d+)$/)
  return match ? Number(match[1]) : null
}

// Generate local studio reflections for the metallic glTF materials.
// This avoids external HDRI downloads and works offline.
function StudioEnvironment() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const room = new RoomEnvironment()
    const generator = new THREE.PMREMGenerator(gl)
    const reflection = generator.fromScene(room).texture
    const previous = scene.environment
    scene.environment = reflection
    return () => {
      scene.environment = previous
      reflection.dispose()
      generator.dispose()
      room.dispose()
    }
  }, [gl, scene])
  return null
}

type SensorPlacement = {
  channel: number
  zone: Zone
  position: THREE.Vector3
  outward: THREE.Vector3
}

function createPlacements(model: THREE.Group): SensorPlacement[] {
  model.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster()
  return Array.from({ length: 21 }, (_, index) => {
    const channel = index + 1
    // Distribute markers on the visible upper/front surface of the imported model.
    // These are conceptual channel markers; FD001 provides no GE90-style mounting coordinates.
    const x = -1.85 + (index % 7) * 0.62
    const angle = 0.25 + Math.floor(index / 7) * 0.34 + (index % 2) * 0.06
    const outward = new THREE.Vector3(0, Math.sin(angle), Math.cos(angle)).normalize()
    raycaster.set(new THREE.Vector3(x, outward.y * 3.2, outward.z * 3.2), outward.clone().negate())
    const hits = raycaster.intersectObject(model, true)
    const position = hits.length
      ? hits[0].point.clone().addScaledVector(outward, 0.07)
      : new THREE.Vector3(x, outward.y * 1.03, outward.z * 1.03)
    return { channel, zone: zoneAtX(x), position, outward }
  })
}

function SensorPin({ placement, selected, priority, onSelect }: {
  placement: SensorPlacement
  selected: boolean
  priority?: string
  onSelect: () => void
}) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), placement.outward
  ), [placement.outward])
  const color = selected ? '#008fe0' : priority === 'P1' ? '#e05e4d'
    : priority === 'P2' ? '#d59c3b' : '#3b9ab1'
  return (
    <group position={[placement.position.x, placement.position.y, placement.position.z]} quaternion={quaternion}
      onClick={event => { event.stopPropagation(); onSelect() }}>
      <mesh position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.055, 0.071, 0.09, 10]} />
        <meshStandardMaterial color="#a7b6c1" metalness={0.82} roughness={0.27} />
      </mesh>
      <mesh position={[0, 0.087, 0]}>
        <sphereGeometry args={[selected ? 0.079 : 0.057, 14, 12]} />
        <meshStandardMaterial color={color} emissive={color}
          emissiveIntensity={selected ? 0.65 : 0.23} roughness={0.35} />
      </mesh>
      {selected && (
        <Html center position={[0, 0.31, 0]} distanceFactor={8}
          style={{ pointerEvents: 'none' }}>
          <span className="ait-sensor-tag">S-{placement.channel}</span>
        </Html>
      )}
    </group>
  )
}

function ImportedEngine({ selectedZone, onSelectZone, selectedSensor,
  onSelectSensor, availableSensors, showSensors }: {
  selectedZone: string
  onSelectZone: (zone: string) => void
  selectedSensor: string
  onSelectSensor: (sensor: string) => void
  availableSensors: AvailableSensor[]
  showSensors: boolean
}) {
  const { scene } = useGLTF(MODEL_PATH)
  const model = useMemo(() => {
    // Clone the glTF so the original cached model remains unchanged.
    const copy = scene.clone(true)
    const bounds = new THREE.Box3().setFromObject(copy)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const scale = 5.65 / Math.max(size.x, 0.001)
    copy.scale.setScalar(scale)
    copy.position.copy(center).multiplyScalar(-scale)
    copy.updateMatrixWorld(true)
    return copy
  }, [scene])
  const placements = useMemo(() => createPlacements(model), [model])
  const selectedNumber = channelNumber(selectedSensor)
  const zone = sections.find(item => item.id === selectedZone) ?? sections[0]
  const zoneX = { fan: -2.03, compressor: -0.8, combustor: 0.37, turbine: 1.77 }[zone.id]

  return (
    <group>
      <primitive object={model} onClick={(event: { stopPropagation: () => void; point: THREE.Vector3 }) => {
        event.stopPropagation()
        onSelectZone(zoneAtX(event.point.x))
      }} />
      {/* Small section cue; not a physical engine boundary. */}
      <Html position={[zoneX, 1.52, 0]} center distanceFactor={10}
        style={{ pointerEvents: 'none' }}>
        <span className="ait-zone-tag">{zone.label}</span>
      </Html>
      {showSensors && placements.map(placement => {
        const evidence = availableSensors.find(item => channelNumber(item.id) === placement.channel)
        return (
          <SensorPin key={placement.channel} placement={placement}
            selected={selectedNumber === placement.channel}
            priority={evidence?.priority}
            onSelect={() => {
              onSelectSensor(evidence?.id ?? `s-${placement.channel}`)
              onSelectZone(placement.zone)
            }} />
        )
      })}
    </group>
  )
}

export default function ImportedTurbofanViewer({ selectedZone, onSelectZone,
  selectedSensor = '', onSelectSensor = () => {}, availableSensors = [], variant = 'explorer' }: Props) {
  const [showSensors, setShowSensors] = useState(true)
  const [autoOrbit, setAutoOrbit] = useState(false)
  const [cameraVersion, setCameraVersion] = useState(0)
  const selected = sections.find(item => item.id === selectedZone) ?? sections[0]
  const controlsRef = useRef<any>(null)
  const previousFocus = useRef('')
  useEffect(() => {
    if (variant === 'hero' || !selectedSensor || !controlsRef.current) return
    if (previousFocus.current === selectedSensor) return
    previousFocus.current = selectedSensor
    const channel = channelNumber(selectedSensor)
    if (!channel) return
    // Approximate inspection focus: actual channel mounting coordinates are unknown.
    const x = -1.85 + ((channel - 1) % 7) * 0.62
    const target = new THREE.Vector3(x, 0.2, 0)
    controlsRef.current.target.copy(target)
    controlsRef.current.object.position.copy(target.clone().add(new THREE.Vector3(-2.0, 1.45, 4.25)))
    controlsRef.current.update()
  }, [selectedSensor, variant])

  return (
    <div className={`ait-root ${variant === 'hero' ? 'ait-hero' : 'ait-explorer'}`}>
      {variant !== 'hero' && <div className="ait-toolbar">
        <span className="ait-status"><span className="ait-status-dot" /> IMPORTED 3D TURBOFAN</span>
        <div className="ait-actions">
          <button type="button" onClick={() => setShowSensors(value => !value)}
            aria-pressed={showSensors} title="Show or hide illustrative sensor markers">
            <RadioTower size={15} /><span>{showSensors ? 'Hide sensors' : 'Show sensors'}</span>
          </button>
          <button type="button" onClick={() => setAutoOrbit(value => !value)}
            aria-pressed={autoOrbit} title="Rotate the camera around the engine">
            {autoOrbit ? <Pause size={15} /> : <Play size={15} />}
            <span>{autoOrbit ? 'Pause orbit' : 'Auto orbit'}</span>
          </button>
          <button type="button" onClick={() => {
            setAutoOrbit(false)
            setCameraVersion(value => value + 1)
          }} title="Reset the camera"><RotateCcw size={15} /><span>Reset view</span></button>
        </div>
      </div>}

      <div className="ait-canvas" aria-label="Interactive 3D turbofan engine with conceptual sensor markers">
        <Canvas key={cameraVersion}
          camera={{ position: [-3.9, 2.15, 6.5], fov: 35, near: 0.1, far: 90 }}
          dpr={[1, 1.7]} gl={{ antialias: true }}>
          <color attach="background" args={['#f4f8fc']} />
          <StudioEnvironment />
          <ambientLight intensity={0.52} />
          <hemisphereLight args={['#ffffff', '#7c94a8', 1.0]} />
          <directionalLight position={[-4, 7, 6]} intensity={2.25} />
          <directionalLight position={[5, 2, -5]} intensity={1.65} />
          <directionalLight position={[0, 4, -3]} intensity={0.8} />
          <gridHelper args={[12, 24, '#d8e6ef', '#e9f1f6']} position={[0, -1.48, 0]} />
          <Suspense fallback={<Html center><span className="ait-loading">Loading detailed engine…</span></Html>}>
            <ImportedEngine selectedZone={selectedZone} onSelectZone={onSelectZone}
              selectedSensor={selectedSensor} onSelectSensor={onSelectSensor}
              availableSensors={availableSensors} showSensors={variant !== 'hero' && showSensors} />
          </Suspense>
          <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.075}
            enablePan={false} autoRotate={variant === 'hero' || autoOrbit} autoRotateSpeed={0.45}
            minDistance={3.0} maxDistance={14}
            minPolarAngle={0.15} maxPolarAngle={Math.PI - 0.15} />
        </Canvas>
        {variant !== 'hero' && <div className="ait-hint"><Rotate3D size={15} /> Drag to rotate · Scroll to zoom · Click pins or engine</div>}
      </div>

      {variant !== 'hero' && <div className="ait-footer">
        <div className="ait-zone-list" aria-label="Select illustrative engine region">
          {sections.map(section => (
            <button key={section.id} type="button"
              className={selectedZone === section.id ? 'ait-zone-active' : ''}
              onClick={() => onSelectZone(section.id)}
              aria-pressed={selectedZone === section.id}>{section.label}</button>
          ))}
        </div>
        <div className="ait-selection">
          <Maximize2 size={15} /> <span><strong>{selected.label}</strong> — {selected.description}</span>
        </div>
        <div className="ait-details">
          <span><Cable size={13} /> Imported mechanical and pipe details</span>
          <span><RadioTower size={13} /> 21 illustrative C-MAPSS sensor markers</span>
        </div>
        <p className="ait-note">
          This is a generic artistic turbofan model, not a GE90 or certified engine CAD model.
          Model parts are not rigged for accurate fan rotation or exploded assembly.
          Sensor pins and section boundaries are illustrative, not verified installation points.
          NASA C-MAPSS FD001 provides simulated turbofan data, not telemetry from this model.
        </p>
        <p className="ait-credit">
          3D model: <a href="https://sketchfab.com/3d-models/turbine-turbofan-engine-jet-engine-74c6aceed86b4a41aaad3b93afc3e262"
            target="_blank" rel="noopener noreferrer">Turbine | Turbofan Engine | Jet Engine</a>
          {' '}by <a href="https://sketchfab.com/blenderbirb" target="_blank" rel="noopener noreferrer">blenderbirb</a>,
          {' '}licensed under <a href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.
        </p>
      </div>}
    </div>
  )
}

