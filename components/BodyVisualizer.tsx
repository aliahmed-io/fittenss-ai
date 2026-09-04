'use client';

import React, { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import {
  buildParametricBodyGeometry,
  BodyModelConfig,
  RawModelJson,
  ProcessedModelResult,
} from '@/lib/bodyModel/morphEngine';

import { getProceduralMuscleNormalMap, calculateDynamicNormalScale } from '@/lib/bodyModel/normalShaderEngine';
import { generateMuscleHeatmapColors, MuscleFatigueState, WORKOUT_STRAIN_PRESETS } from '@/lib/bodyModel/muscleHeatmap';
import { loadGlbHumanModel, computeGLBMorphInfluences } from '@/lib/bodyModel/glbModelLoader';

export type CameraViewPreset = 'full' | 'torso' | 'lower' | 'profile' | 'back';
export type MaterialMode = 'hologram' | 'sculpt' | 'athletic' | 'wireframe' | 'heatmap';

export interface BodyVisualizerProps {
  gender?: 'male' | 'female' | 'child';
  morphValues: Record<string, number>;
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

/**
 * Animated camera controller that smoothly glides to selected view presets,
 * then yields 100% control to OrbitControls for uninterrupted mouse wheel zoom, rotation, and pan.
 */
function CameraController({ view }: { view: CameraViewPreset }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const target = CAMERA_POSITIONS[view] ?? CAMERA_POSITIONS.full;
  const isTransitioningRef = useRef(false);

  // Trigger smooth glide only when preset changes
  useEffect(() => {
    isTransitioningRef.current = true;
  }, [view]);

  // When user interacts with OrbitControls (wheel scroll, drag, touch), instantly stop programmatic override
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const stopTransition = () => {
      isTransitioningRef.current = false;
    };

    controls.addEventListener('start', stopTransition);
    return () => {
      controls.removeEventListener('start', stopTransition);
    };
  }, []);

  // Listen for toolbar Zoom In / Zoom Out button clicks
  useEffect(() => {
    const handleZoom = (e: Event) => {
      const customEvent = e as CustomEvent<{ delta: number }>;
      const delta = customEvent.detail?.delta ?? 0;
      const controls = controlsRef.current;
      if (!controls) return;

      isTransitioningRef.current = false;
      const cam = controls.object;
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

    // Stop transitioning once arrived within close threshold
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

/**
 * Renders the circular scanner pedestal with subtle concentric rings and technical scanline.
 */
function ScannerPedestal({ isHologram = false }: { isHologram?: boolean }) {
  const ringRef = useRef<THREE.Group>(null);
  const accentColor = isHologram ? '#00F0FF' : '#CBFF00';

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.y += delta * 0.15; // Slow rotation of technical markings
    }
  });

  return (
    <group position={[0, -0.001, 0]}>
      {/* Base disc */}
      <mesh receiveShadow rotation={[-Math.PI * 0.5, 0, 0]}>
        <circleGeometry args={[0.9, 64]} />
        <meshStandardMaterial
          color="#0a0a0a"
          roughness={0.8}
          metalness={0.2}
        />
      </mesh>

      {/* Rotating concentric technical rings */}
      <group ref={ringRef} rotation={[-Math.PI * 0.5, 0, 0]}>
        {/* Outer perimeter ring */}
        <mesh position={[0, 0, 0.001]}>
          <ringGeometry args={[0.86, 0.865, 64]} />
          <meshBasicMaterial color="#333333" />
        </mesh>
        {/* Inner metric ring */}
        <mesh position={[0, 0, 0.001]}>
          <ringGeometry args={[0.55, 0.553, 48]} />
          <meshBasicMaterial color="#222222" />
        </mesh>
        {/* Accent tick marks */}
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

/**
 * 3D parametric human body mesh component with GPU morph interpolation.
 */
function BodyMesh({
  processedModel,
  config,
  morphValues,
  materialMode,
  showWireframe,
  bodyFat = 20,
  muscleFatigue,
}: {
  processedModel: ProcessedModelResult;
  config: BodyModelConfig;
  morphValues: Record<string, number>;
  materialMode: MaterialMode;
  showWireframe: boolean;
  bodyFat?: number;
  muscleFatigue?: MuscleFatigueState;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireframeRef = useRef<THREE.Mesh>(null);
  const targetInfluencesRef = useRef<number[]>([]);

  // Procedural normal map and dynamic striations based on body fat
  const normalMap = useMemo(() => getProceduralMuscleNormalMap(), []);
  const normalScale = useMemo(() => calculateDynamicNormalScale(bodyFat), [bodyFat]);

  const isFemale = config.character.includes('female');
  const baseHeight = isFemale ? 1.631 : 1.702;

  // Derive active mesh geometry and attach vertex colors for heatmap mode in useMemo
  const meshGeometry = useMemo(() => {
    const geom = processedModel.geometry.clone();
    if (materialMode === 'heatmap') {
      const positions = geom.attributes.position!.array as Float32Array;
      const count = geom.attributes.position!.count;
      const activeFatigue = muscleFatigue ?? WORKOUT_STRAIN_PRESETS[0]!.fatigue;
      const colors = generateMuscleHeatmapColors(positions, count, baseHeight, activeFatigue, true);
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    return geom;
  }, [processedModel, materialMode, muscleFatigue, baseHeight]);

  // Ensure morphTargetInfluences are initialized on both meshes immediately
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.updateMorphTargets();
    }
    if (wireframeRef.current) {
      wireframeRef.current.updateMorphTargets();
    }
  }, [meshGeometry]);

  // Calculate target morph influences based on config limits
  useEffect(() => {
    const morphMap = processedModel.morphMap;

    // Check if this is our modern GLB model (has baked shape keys like 'Waist_Cinch' or 'Muscle')
    if (morphMap.has('Muscle') || morphMap.has('Waist_Cinch')) {
      const isFemale = config.character.includes('female');
      const influences = computeGLBMorphInfluences(
        isFemale ? 'female' : 'male',
        morphMap,
        morphValues,
        bodyFat
      );
      targetInfluencesRef.current = influences;
      return;
    }

    // Legacy JSON fallback
    const influences: number[] = [];
    config.morphs.forEach((name, i) => {
      const morphIndex = morphMap.get(name);
      if (morphIndex !== undefined) {
        const val = morphValues[name] ?? config.morphslimit[i] ?? 50;
        const low = config.morphslowlimit[i] ?? 0;
        const high = config.morphshighlimit[i] ?? 100;
        const range = Math.max(0.0001, high - low);
        // Normalized 0 to 1 influence
        const norm = THREE.MathUtils.clamp((val - low) / range, 0, 1);
        influences[morphIndex] = norm;
      }
    });

    targetInfluencesRef.current = influences;
  }, [config, morphValues, processedModel, bodyFat]);

  // Material setup matching brand design tokens
  const primaryMaterial = useMemo(() => {
    if (materialMode === 'hologram') {
      // High-End Sci-Fi Biometric Blue Hologram Shader
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color('#021428') },
          uGlowColor: { value: new THREE.Color('#0077B6') },
          uRimColor: { value: new THREE.Color('#00F0FF') },
        },
        vertexShader: `
          #include <morphtarget_pars_vertex>
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          varying vec3 vWorldPosition;

          void main() {
            #include <begin_vertex>
            #include <morphtarget_vertex>
            #include <project_vertex>

            vNormal = normalize(normalMatrix * normal);
            vViewPosition = -mvPosition.xyz;
            vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform vec3 uGlowColor;
          uniform vec3 uRimColor;
          uniform float uTime;

          varying vec3 vNormal;
          varying vec3 vViewPosition;
          varying vec3 vWorldPosition;

          void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);

            // Fresnel edge grazing falloff (highlights anatomical perimeter)
            float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 2.6);
            float innerGlow = pow(1.0 - max(0.0, dot(normal, viewDir)), 1.4);

            // Key anatomical light to accentuate muscle relief (pecs, abs, delts)
            vec3 lightDir = normalize(vec3(0.15, 0.4, 0.85));
            float diff = max(0.0, dot(normal, lightDir));
            float muscleRelief = pow(diff, 1.6) * 0.55;

            // Scanning laser biometric beam passing vertically
            float beamDist = abs(fract(vWorldPosition.y * 0.55 - uTime * 0.22) - 0.5) * 1.8;
            float scanBeam = smoothstep(0.08, 0.0, beamDist) * 0.45;

            // Animated subtle scanlines
            float scanline = 0.90 + 0.10 * sin(vWorldPosition.y * 140.0 - uTime * 2.5);

            // Subtle topographic elevation contour
            float topo = 0.94 + 0.06 * sin(vWorldPosition.y * 80.0);

            // Holographic color composite
            vec3 col = mix(uColor, uGlowColor, innerGlow * 0.60 + muscleRelief);
            col = mix(col, uRimColor, fresnel * 0.85 + scanBeam);
            col *= (scanline * topo);

            float alpha = clamp(0.78 + fresnel * 0.22, 0.0, 1.0);
            gl_FragColor = vec4(col, alpha);
          }
        `,
        transparent: true,
        depthWrite: true,
        side: THREE.FrontSide,
      });
    }

    if (materialMode === 'heatmap') {
      return new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.45,
        metalness: 0.08,
        normalMap: normalMap ?? undefined,
        normalScale,
        flatShading: false,
      });
    }

    if (materialMode === 'sculpt') {
      // Editorial matte alabaster sculpt with dynamic micro-striation normal map
      return new THREE.MeshStandardMaterial({
        color: '#D8D4CC',
        roughness: 0.54,
        metalness: 0.02,
        normalMap: normalMap ?? undefined,
        normalScale,
        flatShading: false,
      });
    }

    if (materialMode === 'athletic') {
      // Athletic obsidian metallic with dynamic micro-striation normal map
      return new THREE.MeshStandardMaterial({
        color: '#151515',
        roughness: 0.32,
        metalness: 0.70,
        normalMap: normalMap ?? undefined,
        normalScale,
        flatShading: false,
      });
    }

    // Default wireframe mode
    return new THREE.MeshStandardMaterial({
      color: '#121212',
      roughness: 0.5,
      metalness: 0.2,
      wireframe: true,
    });
  }, [materialMode, normalMap, normalScale]);

  const wireframeMaterial = useMemo(() => {
    if (materialMode === 'hologram') {
      return new THREE.MeshBasicMaterial({
        color: '#00F0FF',
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      });
    }
    return new THREE.MeshBasicMaterial({
      color: '#CBFF00',
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
  }, [materialMode]);

  // Smooth frame-rate independent interpolation (damp) of morph influences on the GPU
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.morphTargetInfluences) return;

    const targets = targetInfluencesRef.current;
    for (let i = 0; i < targets.length; i++) {
      const targetVal = targets[i];
      if (targetVal !== undefined && mesh.morphTargetInfluences[i] !== undefined) {
        mesh.morphTargetInfluences[i] = THREE.MathUtils.damp(
          mesh.morphTargetInfluences[i]!,
          targetVal,
          10,
          delta
        );
      }
    }

    if (wireframeRef.current?.morphTargetInfluences && mesh.morphTargetInfluences) {
      for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
        wireframeRef.current.morphTargetInfluences[i] = mesh.morphTargetInfluences[i]!;
      }
    }

    // Animate hologram scanlines via mesh material reference
    if (mesh.material && (mesh.material as THREE.ShaderMaterial).uniforms?.['uTime']) {
      const uTime = (mesh.material as THREE.ShaderMaterial).uniforms['uTime'];
      if (uTime) {
        uTime.value += delta;
      }
    }
  });

  // Dynamic height scaling anchored at grounded feet (Y = 0)
  const targetHeightCm = morphValues['Height'] ?? (isFemale ? 165 : 178);
  const baseHeightCm = isFemale ? 163.1 : 170.2;
  const heightScaleY = THREE.MathUtils.clamp(targetHeightCm / baseHeightCm, 0.75, 1.35);
  // Human anthropometric scaling: transverse cross-section scales at square root of stature
  const scaleXZ = Math.sqrt(heightScaleY);

  return (
    <group scale={[scaleXZ, heightScaleY, scaleXZ]} position={[0, 0, 0]}>
      {/* Primary body mesh with constructor args to guarantee morphTargetInfluences initialization */}
      <mesh
        ref={meshRef}
        args={[meshGeometry, primaryMaterial]}
        castShadow
        receiveShadow
      />

      {/* Optional technical wireframe overlay */}
      {(showWireframe || materialMode === 'wireframe') && (
        <mesh
          ref={wireframeRef}
          args={[meshGeometry, wireframeMaterial]}
        />
      )}
    </group>
  );
}

export default function BodyVisualizer({
  gender = 'female',
  morphValues,
  materialMode = 'sculpt',
  cameraView = 'full',
  showWireframe = false,
  bodyFat = 20,
  muscleFatigue,
}: BodyVisualizerProps) {
  const [config, setConfig] = useState<BodyModelConfig | null>(null);
  const [processedModel, setProcessedModel] = useState<ProcessedModelResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load configuration and model
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (gender === 'male' || gender === 'female') {
          try {
            const { processed, config: glbConfig } = await loadGlbHumanModel(gender);
            if (isMounted) {
              setConfig(glbConfig);
              setProcessedModel(processed);
              setLoading(false);
              return;
            }
          } catch (glbErr) {
            console.warn('GLB load failed, falling back to legacy generator:', glbErr);
          }
        }

        let configPath = '/models/skinned/femaleconfig.json';
        if (gender === 'male') configPath = '/models/skinned/testconfig.json';
        if (gender === 'child') configPath = '/models/skinned/childconfig.json';

        const configRes = await fetch(configPath);
        if (!configRes.ok) throw new Error(`Failed to load config: ${configRes.status}`);
        const configData: BodyModelConfig = await configRes.json();
        configData.baseUrl = '/models/skinned/UCS/';

        const modelRes = await fetch(`${configData.baseUrl}${configData.character}`);
        if (!modelRes.ok) throw new Error(`Failed to load 3D character: ${modelRes.status}`);
        const rawJson: RawModelJson = await modelRes.json();

        const processed = buildParametricBodyGeometry(rawJson, configData, gender);

        if (isMounted) {
          setConfig(configData);
          setProcessedModel(processed);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error loading 3D model');
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [gender]);

  return (
    <div className="relative w-full h-full min-h-[500px] select-none bg-[#090909]">
      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#090909]/90 backdrop-blur-sm">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--ft-lime)] border-t-transparent animate-spin" />
          <p className="eyebrow text-xs tracking-widest text-[var(--ft-t2)]">
            Synthesizing 3D Anatomical Scan...
          </p>
        </div>
      )}

      {/* Error state fallback */}
      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 p-6 text-center bg-[#090909]">
          <p className="text-red-400 font-mono text-xs uppercase tracking-wider">Model Synthesis Error</p>
          <p className="text-xs text-[var(--ft-t3)]">{error}</p>
        </div>
      )}

      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          position: CAMERA_POSITIONS.full.pos,
          fov: 35,
          near: 0.1,
          far: 100,
        }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
      >
        <CameraController view={cameraView} />

        {/* Studio / Hologram Lighting */}
        <ambientLight intensity={materialMode === 'hologram' ? 0.90 : 0.70} />
        {/* Main Key Light */}
        <directionalLight
          position={[2.4, 3.0, 2.2]}
          intensity={materialMode === 'hologram' ? 1.0 : 1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0001}
        />
        {/* Fill Light */}
        <directionalLight
          position={[-2.2, 1.8, -1.5]}
          intensity={0.65}
          color={materialMode === 'hologram' ? '#00A3FF' : '#DDE8F0'}
        />
        {/* Technical Rim Light */}
        <pointLight
          position={[-1.8, 1.3, 1.8]}
          intensity={materialMode === 'hologram' ? 2.2 : 1.2}
          color={materialMode === 'hologram' ? '#00F0FF' : '#CBFF00'}
          distance={7}
        />
        <pointLight
          position={[1.5, 0.8, -1.8]}
          intensity={materialMode === 'hologram' ? 1.8 : 0.6}
          color={materialMode === 'hologram' ? '#0077FF' : '#FFFFFF'}
          distance={6}
        />

        <Environment preset="city" environmentIntensity={0.30} />

        {/* Crisp ground contact shadow directly under feet */}
        <ContactShadows
          position={[0, 0.001, 0]}
          resolution={1024}
          scale={2.6}
          blur={1.8}
          opacity={0.75}
          far={3}
          color="#000000"
        />

        {/* Circular Scanner Pedestal */}
        <ScannerPedestal isHologram={materialMode === 'hologram'} />

        {/* Parametric Body Model */}
        {processedModel && config && (
          <Suspense fallback={null}>
            <BodyMesh
              processedModel={processedModel}
              config={config}
              morphValues={morphValues}
              materialMode={materialMode}
              showWireframe={showWireframe}
              bodyFat={bodyFat}
              muscleFatigue={muscleFatigue}
            />
          </Suspense>
        )}
      </Canvas>
    </div>
  );
}
