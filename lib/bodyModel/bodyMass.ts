import * as THREE from 'three';

/** Signed triangle integration; compared only within the same anatomical topology. */
export function meshVolume(positions: ArrayLike<number>, indices: ArrayLike<number>): number {
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    volume += positions[a]! * (positions[b+1]! * positions[c+2]! - positions[b+2]! * positions[c+1]!)
      + positions[a+1]! * (positions[b+2]! * positions[c]! - positions[b]! * positions[c+2]!)
      + positions[a+2]! * (positions[b]! * positions[c+1]! - positions[b+1]! * positions[c]!);
  }
  return Math.abs(volume / 6);
}

interface MassInputs { gender: 'male' | 'female'; weightKg: number; heightCm: number; bodyFatPct: number }

/**
 * Blend authored shapes, then calibrate body volume to mass at the requested
 * stature. Bone-local radial deformation preserves limb lengths and joints.
 * This is an illustrative avatar calibration, not a scan or a body-fat estimate.
 */
export function buildMassGeometry(mesh: THREE.SkinnedMesh, source: THREE.BufferGeometry, influences: number[], inputs: MassInputs): THREE.BufferGeometry {
  const position = source.getAttribute('position');
  const index = source.getIndex();
  if (!index) throw new Error('The body model needs indexed anatomical geometry.');
  const original = Float32Array.from(position.array);
  const blended = original.slice();
  for (let target = 0; target < influences.length; target++) {
    const weight = influences[target] ?? 0;
    const delta = source.morphAttributes.position?.[target];
    if (!weight || !delta) continue;
    for (let i = 0; i < position.count; i++) {
      blended[i*3] = blended[i*3]! + delta.getX(i) * weight;
      blended[i*3+1] = blended[i*3+1]! + delta.getY(i) * weight;
      blended[i*3+2] = blended[i*3+2]! + delta.getZ(i) * weight;
    }
  }
  let baselineHeight = 0;
  for (let i = 0; i < position.count; i++) baselineHeight = Math.max(baselineHeight, position.getY(i));
  const referenceMass = inputs.gender === 'male' ? 78 : 62;
  const referenceHeight = inputs.gender === 'male' ? 178 : 165;
  const height = Math.min(250, Math.max(100, inputs.heightCm));
  const mass = Math.min(250, Math.max(30, inputs.weightKg));
  // Corrective fat-distribution target: the existing asset's maximum-weight
  // target moves vertices by only ~2 cm, insufficient for a broad mass range.
  const referenceFat = inputs.gender === 'male' ? 15 : 22;
  const softness = THREE.MathUtils.clamp((inputs.bodyFatPct-referenceFat)/25, -.5, 1.5);
  for (let i = 0; i < position.count; i++) {
    const x = blended[i*3]!, y = blended[i*3+1]!, z = blended[i*3+2]!;
    const yn = y / baselineHeight;
    const core = (1-THREE.MathUtils.smoothstep(Math.abs(x)/baselineHeight,.14,.22));
    const belly = Math.exp(-Math.pow((yn-.60)/.105,2)) * core;
    const front = THREE.MathUtils.smoothstep(z, .005, .075);
    blended[i*3] = x * (1 + softness * .25 * belly);
    blended[i*3+2] = z + softness * baselineHeight * .085 * belly * front;
    if (inputs.gender === 'female') {
      const hips = Math.exp(-Math.pow((yn-.48)/.085,2)) * core;
      blended[i*3] = blended[i*3]! + x * softness * .08 * hips;
    }
  }
  const targetVolume = meshVolume(original, index.array) * (mass / referenceMass) * Math.pow(referenceHeight / height, 3);
  if (!(targetVolume > 0)) throw new Error('The body model has no usable volume.');

  mesh.updateWorldMatrix(true, true);
  const inverse = mesh.matrixWorld.clone().invert();
  const fatShare = THREE.MathUtils.clamp(inputs.bodyFatPct / 50, 0, 1);
  const bindPoint = (bone: THREE.Bone) => {
    const index = mesh.skeleton.bones.indexOf(bone);
    const bindInverse = mesh.skeleton.boneInverses[index];
    return bindInverse ? new THREE.Vector3().setFromMatrixPosition(bindInverse.clone().invert()).applyMatrix4(mesh.bindMatrixInverse) : bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
  };
  const boneData = mesh.skeleton.bones.map(bone => {
    const start = bindPoint(bone);
    const child = bone.children.find(node => (node as THREE.Bone).isBone) as THREE.Bone | undefined;
    const end = child ? bindPoint(child) : start.clone().add(new THREE.Vector3(0, .1, 0));
    const axis = end.sub(start).normalize();
    const name = bone.name.toLowerCase();
    const exponent = /head|face|eye|jaw|tongue|finger|thumb|hand|toe|foot/.test(name) ? .03
      : /neck/.test(name) ? .35
      : /upperarm|lowerarm|clavicle/.test(name) ? 1.1 - fatShare * .4
      : /thigh|calf/.test(name) ? .95
      : .9 + fatShare * .6;
    return { start, axis, exponent };
  });
  const skinIndex = source.getAttribute('skinIndex');
  const skinWeight = source.getAttribute('skinWeight');
  if (!skinIndex || !skinWeight) throw new Error('The body model needs skin weights for mass distribution.');
  const radial = new Float32Array(position.count * 4 * 3);
  for (let i = 0; i < position.count; i++) {
    const x = blended[i*3]!, y = blended[i*3+1]!, z = blended[i*3+2]!;
    for (let j = 0; j < 4; j++) {
      const bone = boneData[skinIndex.getComponent(i,j)];
      if (!bone) continue;
      const dx = x-bone.start.x, dy = y-bone.start.y, dz = z-bone.start.z;
      const along = dx*bone.axis.x + dy*bone.axis.y + dz*bone.axis.z;
      const offset = (i*4+j)*3;
      const w = skinWeight.getComponent(i,j);
      radial[offset] = (dx-along*bone.axis.x)*w;
      radial[offset+1] = (dy-along*bone.axis.y)*w;
      radial[offset+2] = (dz-along*bone.axis.z)*w;
    }
  }
  const output = new Float32Array(blended.length);
  function deform(amount: number) {
    const factors = boneData.map(bone => Math.exp(amount * bone.exponent)-1);
    for (let i = 0; i < position.count; i++) {
      let dx = 0, dy = 0, dz = 0;
      for (let j = 0; j < 4; j++) {
        const factor = factors[skinIndex.getComponent(i,j)] ?? 0;
        const offset = (i*4+j)*3;
        dx += radial[offset]! * factor; dy += radial[offset+1]! * factor; dz += radial[offset+2]! * factor;
      }
      output[i*3] = blended[i*3]! + dx;
      output[i*3+1] = blended[i*3+1]! + dy;
      output[i*3+2] = blended[i*3+2]! + dz;
    }
    // Keep stature and feet-to-floor placement invariant as cross-sections grow.
    let minimum = Infinity, maximum = -Infinity;
    for (let i = 0; i < position.count; i++) { minimum = Math.min(minimum, output[i*3+1]!); maximum = Math.max(maximum, output[i*3+1]!); }
    const normalizeHeight = baselineHeight / Math.max(.001, maximum-minimum);
    for (let i = 0; i < position.count; i++) output[i*3+1] = (output[i*3+1]!-minimum) * normalizeHeight;
    return meshVolume(output, index!.array);
  }
  let low = -1.5, high = 1.6;
  for (let iteration = 0; iteration < 18; iteration++) {
    const middle = (low+high)/2;
    if (deform(middle) < targetVolume) low = middle; else high = middle;
  }
  const achievedVolume = deform((low+high)/2);
  const result = new THREE.BufferGeometry();
  result.setIndex(index.clone());
  for (const [name, attribute] of Object.entries(source.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'tangent') result.setAttribute(name, attribute.clone());
  }
  for (const group of source.groups) result.addGroup(group.start, group.count, group.materialIndex);
  result.setAttribute('position', new THREE.BufferAttribute(output,3));
  result.computeVertexNormals();
  result.computeBoundingBox(); result.computeBoundingSphere();
  result.userData.massCalibration = { weightKg: mass, targetVolume, achievedVolume, relativeError: Math.abs(achievedVolume-targetVolume)/targetVolume };
  return result;
}
