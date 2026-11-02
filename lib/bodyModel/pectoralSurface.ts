import * as THREE from 'three';

/** Soften the baked pectoral dents without changing the chest outline or rig. */
export function softenPectoralSurface(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!position || !index) return;
  const neighbors = Array.from({ length: position.count }, () => new Set<number>());
  // Weld only the adjacency lookup: keep UV seams, skin weights and vertex indices.
  const representatives = new Map<string, number>();
  const welded: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map(v => v.toFixed(5)).join(',');
    const representative = representatives.get(key) ?? i;
    representatives.set(key, representative);
    welded.push(representative);
  }
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [welded[index.getX(i)]!, welded[index.getX(i + 1)]!, welded[index.getX(i + 2)]!];
    for (const a of triangle) for (const b of triangle) if (a !== b) neighbors[a]!.add(b);
  }
  const weights = Array.from({ length: position.count }, (_, i) => {
    const x = Math.abs(position.getX(i)), y = position.getY(i), z = position.getZ(i);
    const smooth = (a: number, b: number, v: number) => THREE.MathUtils.smoothstep(v, a, b);
    return smooth(.02, .06, x) * (1 - smooth(.17, .23, x)) * smooth(1.10, 1.18, y) * (1 - smooth(1.35, 1.43, y)) * smooth(.015, .045, z);
  });
  function smoothDepth(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
    let depth = Array.from({ length: position.count }, (_, i) => attribute.getZ(i));
    for (let pass = 0; pass < 24; pass++) {
      const next = depth.slice();
      for (let i = 0; i < position.count; i++) {
        const ring = neighbors[welded[i]!]!;
        if (!weights[i] || ring.size === 0) continue;
        let sum = 0;
        for (const n of ring) sum += depth[n]!;
        next[i] = THREE.MathUtils.lerp(depth[i]!, sum / ring.size, weights[i]! * .65);
      }
      depth = next;
    }
    for (let i = 0; i < position.count; i++) attribute.setZ(i, depth[i]!);
    attribute.needsUpdate = true;
  }
  smoothDepth(position);
  // Morph positions are relative deltas. Applying the same linear filter keeps
  // each target consistent with the corrected base surface during transitions.
  for (const target of geometry.morphAttributes.position ?? []) smoothDepth(target);
  geometry.computeVertexNormals();
  const baseNormals = geometry.getAttribute('normal');
  const targetNormals: THREE.BufferAttribute[] = [];
  for (const target of geometry.morphAttributes.position ?? []) {
    const surface = new THREE.BufferGeometry();
    const vertices = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      vertices[i * 3] = position.getX(i) + target.getX(i);
      vertices[i * 3 + 1] = position.getY(i) + target.getY(i);
      vertices[i * 3 + 2] = position.getZ(i) + target.getZ(i);
    }
    surface.setIndex(index);
    surface.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    surface.computeVertexNormals();
    const normals = surface.getAttribute('normal');
    const delta = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      delta[i * 3] = normals.getX(i) - baseNormals.getX(i);
      delta[i * 3 + 1] = normals.getY(i) - baseNormals.getY(i);
      delta[i * 3 + 2] = normals.getZ(i) - baseNormals.getZ(i);
    }
    targetNormals.push(new THREE.BufferAttribute(delta, 3));
    surface.dispose();
  }
  geometry.morphAttributes.normal = targetNormals;
}
