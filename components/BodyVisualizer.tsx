'use client';

import React, { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Lightformer, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { generateMuscleHeatmapColors, MuscleFatigueState, WORKOUT_STRAIN_PRESETS } from '@/lib/bodyModel/muscleHeatmap';
import {
  loadGlbHumanModel,
  computeGLBMorphInfluences,
  type BodyModelConfig,
  type ProcessedModelResult,
} from '@/lib/bodyModel/glbModelLoader';
import { LimbController } from '@/lib/bodyModel/limbController';
import { buildMassGeometry } from '@/lib/bodyModel/bodyMass';
import { fitBodyCamera } from '@/lib/bodyModel/cameraFraming';
import { computeLimbRatios } from '@/lib/bodyModel/limbScaling';

export type CameraViewPreset = 'full' | 'torso' | 'lower' | 'profile' | 'back';
export type MaterialMode = 'sculpt' | 'heatmap';

export interface BodyVisualizerProps {
  gender?: 'male' | 'female';
  morphValues: Record<string, number>;
  weightKg: number;
  materialMode?: MaterialMode;
  cameraView?: CameraViewPreset;
  showWireframe?: boolean;
  bodyFat?: number;
  muscleFatigue?: MuscleFatigueState;
}

const CAMERA_POSITIONS: Record<CameraViewPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  full:    { pos: [0, 1.05, 3.45],  target: [0, 1.05, 0] },
  torso:   { pos: [0, 1.30, 1.85],  target: [0, 1.28, 0] },
  lower:   { pos: [0, 0.55, 2.20],  target: [0, 0.50, 0] },
  profile: { pos: [3.2, 1.10, 0.0], target: [0, 1.10, 0] },
  back:    { pos: [0, 1.10, -3.45], target: [0, 1.10, 0] },
};

function CameraController({ view, height }: { view: CameraViewPreset; height: number }) {
  const size = useThree(state => state.size);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const target = useMemo(() => {
    if (view === 'full' || view === 'profile') return fitBodyCamera(height, size.width, size.height, view);
    return CAMERA_POSITIONS[view];
  }, [view, height, size.width, size.height]);
  const isTransitioningRef = useRef(false);

  useEffect(() => {
    isTransitioningRef.current = true;
    const resetView = () => { isTransitioningRef.current = true; };
    window.addEventListener('visualizer:view', resetView);
    return () => window.removeEventListener('visualizer:view', resetView);
  }, [view, target]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const stopTransition = () => {
      isTransitioningRef.current = false;
    };

    const domElement = controls.domElement;
    if (!domElement) return;

    domElement.addEventListener('pointerdown', stopTransition);
    domElement.addEventListener('wheel', stopTransition);
    domElement.addEventListener('touchstart', stopTransition);

    return () => {
      domElement.removeEventListener('pointerdown', stopTransition);
      domElement.removeEventListener('wheel', stopTransition);
      domElement.removeEventListener('touchstart', stopTransition);
    };
  }, []);

  useEffect(() => {
    const handleZoom = (e: Event) => {
      const customEvt = e as CustomEvent<{ delta: number }>;
      const delta = customEvt.detail?.delta ?? 0;
      isTransitioningRef.current = false;
      const controls = controlsRef.current;
      if (!controls) return;

      const cam = controls.object as THREE.PerspectiveCamera;
      if (!cam) return;

      const targetLookAt = controls.target;
      const offset = cam.position.clone().sub(targetLookAt);
      const factor = delta > 0 ? 0.75 : 1.33;
      offset.multiplyScalar(factor);
      const newDist = offset.length();

      if (newDist >= 0.6 && newDist <= 8.0) {
        cam.position.copy(targetLookAt).add(offset);
        controls.update();
      }
    };

    window.addEventListener('visualizer:zoom', handleZoom);
    return () => window.removeEventListener('visualizer:zoom', handleZoom);
  }, []);

  useFrame((state, delta) => {
    if (!isTransitioningRef.current) return;

    const cam = state.camera;
    const targetPos = target.pos;
    const targetLookAt = target.target;

    cam.position.x = THREE.MathUtils.damp(cam.position.x, targetPos[0], 5, delta);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, targetPos[1], 5, delta);
    cam.position.z = THREE.MathUtils.damp(cam.position.z, targetPos[2], 5, delta);

    if (controlsRef.current) {
      controlsRef.current.target.x = THREE.MathUtils.damp(controlsRef.current.target.x, targetLookAt[0], 5, delta);
      controlsRef.current.target.y = THREE.MathUtils.damp(controlsRef.current.target.y, targetLookAt[1], 5, delta);
      controlsRef.current.target.z = THREE.MathUtils.damp(controlsRef.current.target.z, targetLookAt[2], 5, delta);
      controlsRef.current.update();
    }

    const distSq =
      Math.pow(cam.position.x - targetPos[0], 2) +
      Math.pow(cam.position.y - targetPos[1], 2) +
      Math.pow(cam.position.z - targetPos[2], 2);

    if (distSq < 0.001) {
      isTransitioningRef.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={true}
      screenSpacePanning={true}
      panSpeed={1.0}
      enableZoom={true}
      zoomSpeed={1.2}
      enableDamping={true}
      dampingFactor={0.08}
      rotateSpeed={0.8}
      minDistance={0.5}
      maxDistance={8.0}
      minPolarAngle={Math.PI * 0.05}
      maxPolarAngle={Math.PI * 0.55}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
    />
  );
}

function ScannerPedestal() {
  const ringRef = useRef<THREE.Group>(null);
  const accentColor = '#CBFF00';

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.25;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh rotation={[-Math.PI * 0.5, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <circleGeometry args={[0.9, 64]} />
        <meshStandardMaterial
          color="#0a0a0a"
          roughness={0.8}
          metalness={0.2}
        />
      </mesh>

      <group ref={ringRef} rotation={[-Math.PI * 0.5, 0, 0]}>
        <mesh position={[0, 0, 0.001]}>
          <ringGeometry args={[0.86, 0.865, 64]} />
          <meshBasicMaterial color="#333333" />
        </mesh>
        <mesh position={[0, 0, 0.001]}>
          <ringGeometry args={[0.55, 0.553, 48]} />
          <meshBasicMaterial color="#222222" />
        </mesh>
        <mesh position={[0, 0, 0.001]}>
          <ringGeometry args={[0.88, 0.885, 32, 1, 0, Math.PI * 0.35]} />
          <meshBasicMaterial color={accentColor} transparent opacity={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.001]}>
          <ringGeometry args={[0.88, 0.885, 32, 1, Math.PI, Math.PI * 0.35]} />
          <meshBasicMaterial color={accentColor} transparent opacity={0.6} />
        </mesh>
      </group>
    </group>
  );
}

function BodyMesh({
  processedModel,
  config,
  morphValues,
  weightKg,
  materialMode,
  showWireframe,
  bodyFat = 15,
  muscleFatigue,
}: {
  processedModel: ProcessedModelResult;
  config: BodyModelConfig;
  morphValues: Record<string, number>;
  weightKg: number;
  materialMode: MaterialMode;
  showWireframe: boolean;
  bodyFat?: number;
  muscleFatigue?: MuscleFatigueState;
}) {
  const meshRef = useRef<THREE.SkinnedMesh | null>(null);
  const isFemale = config.character.includes('female');
  const baseHeight = useMemo(() => { const position = processedModel.geometry.getAttribute('position'); let height = 0; for (let i = 0; i < position.count; i++) height = Math.max(height, position.getY(i)); return height; }, [processedModel]);

  // Neutral skeleton controller retains limb-length adjustments.
  const limbController = useMemo(() => new LimbController(), []);
  const sceneRef = useRef<THREE.Group | null>(null);

  const limbRatios = useMemo(
    () => computeLimbRatios(isFemale ? 'female' : 'male', morphValues),
    [isFemale, morphValues]
  );

  useEffect(() => {
    limbController.setLimbRatios(limbRatios.arm, limbRatios.lowerLeg);
  }, [limbController, limbRatios]);

  useEffect(() => {
    meshRef.current = processedModel.skinnedMesh ?? null;
    sceneRef.current = processedModel.scene ?? null;
    if (processedModel.skeleton) {
      limbController.setSkeleton(processedModel.skeleton);
    }
  }, [processedModel, limbController]);

  // Primary material setup
  const primaryMaterial = useMemo(() => {
    if (materialMode === 'heatmap') {
      return new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.45,
        metalness: 0.08,
        wireframe: showWireframe,
      });
    }

    return new THREE.MeshStandardMaterial({
        color: '#D8D4CC',
        roughness: 0.54,
        metalness: 0.02,
        wireframe: showWireframe,
      });
  }, [materialMode, showWireframe]);

  useEffect(() => () => primaryMaterial.dispose(), [primaryMaterial]);

  // Assign material to SkinnedMesh
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.material = primaryMaterial;
    }
  }, [primaryMaterial, processedModel]);

  const renderGeometry = useMemo(() => {
    const mesh = processedModel.skinnedMesh;
    if (!mesh) return null;
    const influences = computeGLBMorphInfluences(isFemale ? 'female' : 'male', processedModel.morphMap, morphValues, bodyFat, weightKg);
    return buildMassGeometry(mesh, processedModel.geometry, influences, { gender: isFemale ? 'female' : 'male', weightKg, heightCm: morphValues.Height ?? (isFemale ? 165 : 178), bodyFatPct: bodyFat });
  }, [processedModel, isFemale, morphValues, bodyFat, weightKg]);

  useEffect(() => {
    const mesh = processedModel.skinnedMesh;
    if (!mesh || !renderGeometry) return;
    mesh.geometry = renderGeometry;
    mesh.morphTargetInfluences = [];
    mesh.morphTargetDictionary = {};
    return () => { renderGeometry.dispose(); };
  }, [processedModel, renderGeometry]);

  useEffect(() => {
    if (!renderGeometry || materialMode !== 'heatmap') return;
    const positions = renderGeometry.getAttribute('position');
    renderGeometry.setAttribute('color', new THREE.BufferAttribute(generateMuscleHeatmapColors(positions.array as Float32Array, positions.count, baseHeight, muscleFatigue ?? WORKOUT_STRAIN_PRESETS[0]!.fatigue, true), 3));
  }, [renderGeometry, materialMode, muscleFatigue, baseHeight]);

  useFrame(() => {
    limbController.update();
    if (sceneRef.current) sceneRef.current.position.y = limbController.getGroundOffset();
  });

  const targetHeightCm = morphValues['Height'] ?? (isFemale ? 165 : 178);
  const baseHeightCm = baseHeight * 100;
  const heightScaleY = THREE.MathUtils.clamp(targetHeightCm / baseHeightCm, 0.5, 1.6);
  const scaleXZ = heightScaleY;

  if (processedModel.scene) {
    return (
      <group scale={[scaleXZ, heightScaleY, scaleXZ]} position={[0, 0, 0]}>
        <primitive object={processedModel.scene} />
      </group>
    );
  }

  return null;
}

export default function BodyVisualizer({
  gender = 'male',
  morphValues,
  weightKg,
  materialMode = 'sculpt',
  cameraView = 'full',
  showWireframe = false,
  bodyFat = 15,
  muscleFatigue,
}: BodyVisualizerProps) {
  const [config, setConfig] = useState<BodyModelConfig | null>(null);
  const [processedModel, setProcessedModel] = useState<ProcessedModelResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (gender === 'male' || gender === 'female') {
          const { processed, config: glbConfig } = await loadGlbHumanModel(gender);
          if (isMounted) {
            setConfig(glbConfig);
            setProcessedModel(processed);
            setLoading(false);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load humanoid anatomical model';
          setError(msg);
          setLoading(false);
        }
      }
    };

    load();
    return () => { isMounted = false; };
  }, [gender]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at 50% 60%, #0d1218 0%, #030608 100%)',
        overflow: 'hidden',
      }}
    >
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(3, 6, 8, 0.85)',
            zIndex: 10,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '2px solid var(--ft-rule)',
                borderTopColor: 'var(--ft-accent-cyan, #00F0FF)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 12px',
              }}
            />
            <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--ft-muted)' }}>
              SYNCHRONIZING ANATOMICAL MESH
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            color: 'var(--ft-accent-crimson)',
            fontSize: '12px',
            background: 'rgba(3,6,8,0.9)',
          }}
        >
          {error}
        </div>
      )}

      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        camera={{ position: CAMERA_POSITIONS.full.pos, fov: 36, near: 0.1, far: 50 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 1.5]}
        fallback={<div role="status" style={{ padding: 32 }}>3D requires WebGL. Your fitness tracking remains available.</div>}
        shadows
      >
        <Suspense fallback={null}>
          <CameraController view={cameraView} height={(morphValues.Height ?? (gender === 'male' ? 178 : 165)) / 100} />

          <ambientLight intensity={0.85} />
          <directionalLight
            position={[2, 4, 3]}
            intensity={1.4}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight
            position={[-3, 2, -2]}
            intensity={0.8}
            color="#00F0FF"
          />

          <ScannerPedestal />

          {processedModel && config && (
            <BodyMesh
              processedModel={processedModel}
              config={config}
              morphValues={morphValues}
              weightKg={weightKg}
              materialMode={materialMode}
              showWireframe={showWireframe}
              bodyFat={bodyFat}
              muscleFatigue={muscleFatigue}
            />
          )}

          <ContactShadows
            position={[0, -0.01, 0]}
            opacity={0.65}
            scale={2.2}
            blur={2.4}
            far={1.5}
            color="#000000"
          />

          <Environment resolution={128} environmentIntensity={0.65}>
            <Lightformer position={[3, 3, 2]} intensity={3} scale={[3, 5, 1]} />
            <Lightformer position={[-3, 2, 1]} intensity={2} color="#c4deee" scale={[2, 4, 1]} />
            <Lightformer position={[0, 3, -3]} intensity={4} scale={[3, 3, 1]} />
          </Environment>
        </Suspense>
      </Canvas>
    </div>
  );
}
