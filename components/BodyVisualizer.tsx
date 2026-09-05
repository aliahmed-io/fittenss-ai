'use client';

import React, { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import {
  BodyModelConfig,
  ProcessedModelResult,
} from '@/lib/bodyModel/morphEngine';

import { generateMuscleHeatmapColors, MuscleFatigueState, WORKOUT_STRAIN_PRESETS } from '@/lib/bodyModel/muscleHeatmap';
import { loadGlbHumanModel, computeGLBMorphInfluences } from '@/lib/bodyModel/glbModelLoader';
import { createDynamicBodyMaterial, updateDynamicBodyMaterial } from '@/lib/bodyModel/dynamicPbrShader';
import { PoseController } from '@/lib/bodyModel/poseSystem';

export type CameraViewPreset = 'full' | 'torso' | 'lower' | 'profile' | 'back';
export type MaterialMode = 'hologram' | 'pbr' | 'sculpt' | 'athletic' | 'wireframe' | 'heatmap';

export interface BodyVisualizerProps {
  gender?: 'male' | 'female' | 'child';
  morphValues: Record<string, number>;
  materialMode?: MaterialMode;
  cameraView?: CameraViewPreset;
  showWireframe?: boolean;
  bodyFat?: number;
  muscleFatigue?: MuscleFatigueState;
  activePose?: string;
}

const CAMERA_POSITIONS: Record<CameraViewPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  full:    { pos: [0, 1.05, 3.45],  target: [0, 1.05, 0] },
  torso:   { pos: [0, 1.30, 1.85],  target: [0, 1.28, 0] },
  lower:   { pos: [0, 0.55, 2.20],  target: [0, 0.50, 0] },
  profile: { pos: [3.2, 1.10, 0.0], target: [0, 1.10, 0] },
  back:    { pos: [0, 1.10, -3.45], target: [0, 1.10, 0] },
};

function CameraController({ view }: { view: CameraViewPreset }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const target = CAMERA_POSITIONS[view] ?? CAMERA_POSITIONS.full;
  const isTransitioningRef = useRef(false);

  useEffect(() => {
    isTransitioningRef.current = true;
  }, [view]);

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

function ScannerPedestal({ isHologram = false }: { isHologram?: boolean }) {
  const ringRef = useRef<THREE.Group>(null);
  const accentColor = isHologram ? '#00F0FF' : '#CBFF00';

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
  materialMode,
  showWireframe,
  bodyFat = 15,
  muscleFatigue,
  activePose = 'neutral',
}: {
  processedModel: ProcessedModelResult;
  config: BodyModelConfig;
  morphValues: Record<string, number>;
  materialMode: MaterialMode;
  showWireframe: boolean;
  bodyFat?: number;
  muscleFatigue?: MuscleFatigueState;
  activePose?: string;
}) {
  const targetInfluencesRef = useRef<number[]>([]);
  const meshRef = useRef<THREE.SkinnedMesh | null>(null);
  const isFemale = config.character.includes('female');
  const baseHeight = isFemale ? 1.631 : 1.702;

  // Pose Controller for procedural animations
  const poseController = useMemo(() => new PoseController(), []);

  useEffect(() => {
    meshRef.current = processedModel.skinnedMesh ?? null;
    if (processedModel.skeleton) {
      poseController.setSkeleton(processedModel.skeleton);
    }
  }, [processedModel, poseController]);

  useEffect(() => {
    poseController.setPose(activePose);
  }, [activePose, poseController]);

  // Primary material setup
  const primaryMaterial = useMemo(() => {
    if (materialMode === 'pbr' || materialMode === 'hologram') {
      const mat = createDynamicBodyMaterial({ isHologram: materialMode === 'hologram' });
      mat.wireframe = showWireframe;
      return mat;
    }

    if (materialMode === 'heatmap') {
      return new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.45,
        metalness: 0.08,
        wireframe: showWireframe,
      });
    }

    if (materialMode === 'sculpt') {
      return new THREE.MeshStandardMaterial({
        color: '#D8D4CC',
        roughness: 0.54,
        metalness: 0.02,
        wireframe: showWireframe,
      });
    }

    if (materialMode === 'athletic') {
      return new THREE.MeshStandardMaterial({
        color: '#151515',
        roughness: 0.32,
        metalness: 0.70,
        wireframe: showWireframe,
      });
    }

    return new THREE.MeshStandardMaterial({
      color: '#121212',
      roughness: 0.5,
      metalness: 0.2,
      wireframe: true,
    });
  }, [materialMode, showWireframe]);

  // Assign material to SkinnedMesh
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.material = primaryMaterial;
    }
  }, [primaryMaterial, processedModel]);

  // Heatmap vertex colors update
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh && materialMode === 'heatmap') {
      const geom = mesh.geometry;
      const positions = geom.attributes['position']?.array as Float32Array | undefined;
      const count = geom.attributes['position']?.count ?? 0;
      if (positions && count > 0) {
        const activeFatigue = muscleFatigue ?? WORKOUT_STRAIN_PRESETS[0]!.fatigue;
        const colors = generateMuscleHeatmapColors(positions, count, baseHeight, activeFatigue, true);
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
    }
  }, [materialMode, muscleFatigue, baseHeight, processedModel]);

  // Calculate target morph influences
  useEffect(() => {
    const morphMap = processedModel.morphMap;
    if (morphMap.has('Muscle') || morphMap.has('Waist_Cinch')) {
      const influences = computeGLBMorphInfluences(
        isFemale ? 'female' : 'male',
        morphMap,
        morphValues,
        bodyFat
      );
      targetInfluencesRef.current = influences;
    }
  }, [isFemale, processedModel, morphValues, bodyFat]);

  // Smooth frame updates: poses, morphs, shader uniforms
  useFrame((_, delta) => {
    poseController.update(delta);

    const activeMesh = meshRef.current;
    if (activeMesh?.morphTargetInfluences) {
      const targets = targetInfluencesRef.current;
      for (let i = 0; i < targets.length; i++) {
        const targetVal = targets[i];
        if (targetVal !== undefined && activeMesh.morphTargetInfluences[i] !== undefined) {
          activeMesh.morphTargetInfluences[i] = THREE.MathUtils.damp(
            activeMesh.morphTargetInfluences[i]!,
            targetVal,
            10,
            delta
          );
        }
      }
    }

    if (activeMesh) {
      const currentMat = activeMesh.material as THREE.Material;
      if (materialMode === 'pbr' || materialMode === 'hologram') {
        updateDynamicBodyMaterial(currentMat, {
          bodyFat,
          muscle: morphValues['Muscle'] ?? 50,
          isHologram: materialMode === 'hologram',
          deltaTime: delta,
        });
      }
    }
  });

  const targetHeightCm = morphValues['Height'] ?? (isFemale ? 165 : 178);
  const baseHeightCm = isFemale ? 163.1 : 170.2;
  const heightScaleY = THREE.MathUtils.clamp(targetHeightCm / baseHeightCm, 0.75, 1.35);
  const scaleXZ = Math.sqrt(heightScaleY);

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
  gender = 'female',
  morphValues,
  materialMode = 'hologram',
  cameraView = 'full',
  showWireframe = false,
  bodyFat = 15,
  muscleFatigue,
  activePose = 'neutral',
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
        camera={{ position: CAMERA_POSITIONS.full.pos, fov: 36, near: 0.1, far: 50 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
          powerPreference: 'high-performance',
        }}
        shadows
      >
        <Suspense fallback={null}>
          <CameraController view={cameraView} />

          <ambientLight intensity={materialMode === 'hologram' ? 0.35 : 0.85} />
          <directionalLight
            position={[2, 4, 3]}
            intensity={materialMode === 'hologram' ? 0.6 : 1.4}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight
            position={[-3, 2, -2]}
            intensity={materialMode === 'hologram' ? 0.4 : 0.8}
            color="#00F0FF"
          />

          <ScannerPedestal isHologram={materialMode === 'hologram'} />

          {processedModel && config && (
            <BodyMesh
              processedModel={processedModel}
              config={config}
              morphValues={morphValues}
              materialMode={materialMode}
              showWireframe={showWireframe}
              bodyFat={bodyFat}
              muscleFatigue={muscleFatigue}
              activePose={activePose}
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

          <Environment preset="city" environmentIntensity={materialMode === 'hologram' ? 0.25 : 0.75} />
        </Suspense>
      </Canvas>
    </div>
  );
}
