import * as THREE from 'three';

export interface DynamicMaterialUniforms {
  uBodyFat: { value: number };
  uMuscle: { value: number };
  uHologramMix: { value: number };
  uTime: { value: number };
  tNormalStriations: { value: THREE.Texture | null };
  tNormalVascularity: { value: THREE.Texture | null };
}

let cachedStriationsTexture: THREE.Texture | null = null;
let cachedVascularityTexture: THREE.Texture | null = null;

function loadNormalTextures(): { striations: THREE.Texture; veins: THREE.Texture } {
  const loader = new THREE.TextureLoader();
  if (!cachedStriationsTexture) {
    cachedStriationsTexture = loader.load('/textures/muscle_striations_normal.png');
    cachedStriationsTexture.wrapS = THREE.RepeatWrapping;
    cachedStriationsTexture.wrapT = THREE.RepeatWrapping;
  }
  if (!cachedVascularityTexture) {
    cachedVascularityTexture = loader.load('/textures/vascularity_normal.png');
    cachedVascularityTexture.wrapS = THREE.RepeatWrapping;
    cachedVascularityTexture.wrapT = THREE.RepeatWrapping;
  }
  return { striations: cachedStriationsTexture, veins: cachedVascularityTexture };
}

export function createDynamicBodyMaterial(options: { isHologram?: boolean } = {}): THREE.MeshStandardMaterial {
  const isHolo = options.isHologram ?? true;
  const { striations, veins } = loadNormalTextures();

  const uniforms: DynamicMaterialUniforms = {
    uBodyFat: { value: 15.0 },
    uMuscle: { value: 50.0 },
    uHologramMix: { value: isHolo ? 1.0 : 0.0 },
    uTime: { value: 0.0 },
    tNormalStriations: { value: striations },
    tNormalVascularity: { value: veins },
  };

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(isHolo ? '#081c30' : '#BDB0A4'),
    roughness: isHolo ? 0.35 : 0.45,
    metalness: isHolo ? 0.20 : 0.05,
    transparent: false,
    opacity: 1.0,
  });

  material.defines = { USE_UV: '' };
  material.userData['dynamicUniforms'] = uniforms;

  material.onBeforeCompile = (shader) => {
    shader.uniforms['uBodyFat'] = uniforms.uBodyFat;
    shader.uniforms['uMuscle'] = uniforms.uMuscle;
    shader.uniforms['uHologramMix'] = uniforms.uHologramMix;
    shader.uniforms['uTime'] = uniforms.uTime;
    shader.uniforms['tNormalStriations'] = uniforms.tNormalStriations;
    shader.uniforms['tNormalVascularity'] = uniforms.tNormalVascularity;

    shader.vertexShader = `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      #ifndef USE_UV
      varying vec2 vUv;
      #endif
      ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * transformedNormal);
      #ifndef USE_UV
      vUv = uv;
      #endif
      `
    );

    shader.fragmentShader = `
      uniform float uBodyFat;
      uniform float uMuscle;
      uniform float uHologramMix;
      uniform float uTime;
      uniform sampler2D tNormalStriations;
      uniform sampler2D tNormalVascularity;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      #ifndef USE_UV
      varying vec2 vUv;
      #endif
      ${shader.fragmentShader}
    `;

    // Inject Tangent-Space Multi-Normal blending for muscle striations and vascularity
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>

      // Dynamic normal blending based on body fat % and muscularity
      float wStriate = clamp((16.0 - uBodyFat) / 8.0, 0.0, 1.0) * clamp(uMuscle / 60.0, 0.25, 1.25);
      float wVeins = clamp((13.0 - uBodyFat) / 6.5, 0.0, 1.0) * clamp(uMuscle / 50.0, 0.2, 1.3);

      vec3 texStriate = texture2D(tNormalStriations, vUv * 2.0).xyz * 2.0 - 1.0;
      vec3 texVeins = texture2D(tNormalVascularity, vUv).xyz * 2.0 - 1.0;

      // Perturb geometric normal in tangent space
      vec3 deltaNorm = vec3(
        texStriate.xy * (wStriate * 0.45) + texVeins.xy * (wVeins * 0.55),
        0.0
      );

      normal = normalize(normal + deltaNorm);
      `
    );

    // Inject Hologram / PBR studio styling in output fragment
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>

      if (uHologramMix > 0.001) {
        // Holographic Fresnel edge glow
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
        fresnel = pow(fresnel, 2.5);

        // Animated subtle holographic scanlines
        float scanline = sin(vWorldPosition.y * 75.0 - uTime * 2.0) * 0.08 + 0.92;

        vec3 holoColor = vec3(0.02, 0.55, 0.95);
        vec3 rimColor = vec3(0.18, 0.85, 1.0);

        vec3 finalHolo = (gl_FragColor.rgb * 0.35 + holoColor * 0.65) * scanline + rimColor * fresnel * 1.4;

        gl_FragColor.rgb = mix(gl_FragColor.rgb, finalHolo, uHologramMix);
        gl_FragColor.a = mix(1.0, clamp(0.72 + fresnel * 0.28, 0.0, 1.0), uHologramMix);
      }
      `
    );
  };

  return material;
}

export function updateDynamicBodyMaterial(
  material: THREE.Material,
  params: {
    bodyFat?: number;
    muscle?: number;
    isHologram?: boolean;
    deltaTime?: number;
  }
) {
  const uniforms = material.userData['dynamicUniforms'] as DynamicMaterialUniforms | undefined;
  if (!uniforms) return;

  if (params.bodyFat !== undefined) {
    uniforms.uBodyFat.value = params.bodyFat;
  }
  if (params.muscle !== undefined) {
    uniforms.uMuscle.value = params.muscle;
  }
  if (params.isHologram !== undefined) {
    uniforms.uHologramMix.value = params.isHologram ? 1.0 : 0.0;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.set(params.isHologram ? '#081c30' : '#BDB0A4');
      material.roughness = params.isHologram ? 0.35 : 0.45;
      material.metalness = params.isHologram ? 0.20 : 0.05;
    }
  }
  if (params.deltaTime !== undefined) {
    uniforms.uTime.value += params.deltaTime;
  }
}
