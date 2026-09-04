# Debug Session: body-model-runtime

Status: RESOLVED

## Symptom
- Runtime `TypeError: Cannot read properties of undefined (reading 'length')`.
- 3D body model was invisible or rendering as an unlit wireframe with 0.05 opacity.
- Morph sliders (Breast, Waist, Hips, Thighs, etc.) had no visual effect on the mesh.

## Root Cause Analysis
1. **Zero Morph Targets in Asset**: The Blender 2.7 JSON model (`female.js`, `basis.js`) contained `"morphTargets": 0`. The previous code assumed morph targets existed in the file, causing `meshRef.current.morphTargetInfluences` to be undefined/empty and throwing errors when indexed.
2. **Duplicate Ref Binding**: Two separate `<mesh>` JSX elements shared `ref={meshRef}`, causing React to overwrite the mesh instance with an unlit wireframe of 0.05 opacity.
3. **Coordinate System Disconnect**: The model was scaled to 3,000+ units with `Y = 2400–3500`, while contact shadows were positioned at `Y = -10` (2,400 units away from the feet), completely detaching all shadow rendering and causing camera depth fighting.
4. **R3F WebGL Morph Initialization (`morphTargetInfluences` undefined)**: React Three Fiber creates `<mesh>` via default constructor before assigning `geometry`, leaving `morphTargetInfluences` undefined. Three.js WebGLMorphtargets crashes when reading `influences.length`. Fixed by passing `args={[geometry, material]}` to `<mesh>` and calling `updateMorphTargets()`.

## Solution Implemented
1. **Parametric GPU Morph Engine (`lib/bodyModel/morphEngine.ts`)**:
   - Normalized model to metric units (feet at ground `Y = 0`, human height ~1.68m female, 1.78m male).
   - Generates relative GPU morph targets (`geometry.morphTargetsRelative = true`) using anatomical spatial influence kernels:
     - Breast: Mammary apex forward projection with natural teardrop gravity droop and lateral cant.
     - Waist: Hourglass lumbar-abdominal oblique cinch with lumbar spine preservation.
     - Hips: Pelvic widening (bi-trochanteric width) and gluteus maximus projection.
     - Thighs: Conical quad/hamstring expansion with knee joint protection.
     - Shoulders, Calf, Stomach, Neck, Arm Length, etc.
   - Interpolates morph influences smoothly via `THREE.MathUtils.damp` in `useFrame` on the GPU.
2. **Biometric Anthropometry Engine (`lib/bodyModel/anthropometry.ts`)**:
   - Computes realistic gynoid female vs android male body measurements from Height, Weight, and Body Fat %.
   - Calculates real-time Waist-to-Hip Ratio (WHR) and Silhouette Archetypes (Hourglass, Athletic, Pear, Rectangle).
3. **Studio Environment & Pedestal (`components/BodyVisualizer.tsx`)**:
   - Precision circular scanner pedestal with rotating metric rings.
   - High-fidelity ground contact shadow directly beneath feet (`Y = 0`).
   - Material modes: Anatomical Sculpt (matte alabaster), Athletic Obsidian (dark brutalist metallic), and Wireframe.
   - Camera presets: Full Body, Torso, Legs, Profile, Back.
4. **Reliable GPU Mesh Initialization**:
   - Attached `args={[processedModel.geometry, primaryMaterial]}` to guarantee `morphTargetInfluences` array instantiation in WebGL.
