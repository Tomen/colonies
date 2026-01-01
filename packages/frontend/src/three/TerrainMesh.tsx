import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../store/simulation';

// Vertex shader for terrain
const vertexShader = `
  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vElevation = position.y;
    vNormal = normalize(normalMatrix * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader for terrain coloring
const fragmentShader = `
  uniform float uWaterLevel;
  uniform float uMaxElevation;
  uniform sampler2D uFlowTexture;
  uniform bool uShowRivers;
  uniform vec3 uLightDirection;

  varying vec2 vUv;
  varying float vElevation;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    float flow = texture2D(uFlowTexture, vUv).r;

    // Base terrain color
    vec3 color;

    if (vElevation <= uWaterLevel) {
      // Water - blue gradient
      float depth = (uWaterLevel - vElevation) / 20.0;
      color = mix(vec3(0.2, 0.4, 0.6), vec3(0.1, 0.2, 0.4), clamp(depth, 0.0, 1.0));
    } else {
      // Land coloring based on elevation
      float normalizedElev = clamp((vElevation - uWaterLevel) / uMaxElevation, 0.0, 1.0);

      // Low land - green
      vec3 lowland = vec3(0.3, 0.5, 0.2);
      // Mid elevation - tan/brown
      vec3 midland = vec3(0.5, 0.4, 0.3);
      // High elevation - gray/brown
      vec3 highland = vec3(0.4, 0.35, 0.3);

      if (normalizedElev < 0.3) {
        color = mix(lowland, midland, normalizedElev / 0.3);
      } else {
        color = mix(midland, highland, (normalizedElev - 0.3) / 0.7);
      }

      // River overlay
      if (uShowRivers && flow > 0.1) {
        float riverIntensity = clamp(log(flow + 1.0) / 8.0, 0.0, 0.8);
        color = mix(color, vec3(0.2, 0.4, 0.7), riverIntensity);
      }
    }

    // Apply lighting
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uLightDirection);

    // Diffuse lighting
    float diffuse = max(dot(normal, lightDir), 0.0);

    // Ambient + diffuse
    float ambient = 0.4;
    float lighting = ambient + (1.0 - ambient) * diffuse;

    color *= lighting;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function TerrainMesh() {
  const terrain = useSimulationStore((s) => s.terrain);
  const showRivers = useSimulationStore((s) => s.visibleLayers.rivers);
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, flowTexture, maxElevation } = useMemo(() => {
    if (!terrain) {
      return { geometry: null, flowTexture: null, maxElevation: 200 };
    }

    const { width, height, heightBuffer, flowBuffer } = terrain;

    // Create plane geometry
    const geo = new THREE.PlaneGeometry(width, height, width - 1, height - 1);
    geo.rotateX(-Math.PI / 2);

    // Displace vertices based on height
    const positions = geo.attributes.position.array as Float32Array;
    let maxElev = 0;

    for (let i = 0; i < positions.length / 3; i++) {
      const x = Math.floor(i % width);
      const y = Math.floor(i / width);
      const idx = y * width + x;
      const elevation = heightBuffer[idx];

      // Y is up in Three.js after rotation
      positions[i * 3 + 1] = elevation * 0.5; // Scale factor for visualization
      maxElev = Math.max(maxElev, elevation);
    }

    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();

    // Create flow texture for river visualization
    const flowData = new Float32Array(width * height);
    // Find max flow without spread operator (avoids stack overflow on large arrays)
    let maxFlow = 0;
    for (let i = 0; i < flowBuffer.length; i++) {
      if (flowBuffer[i] > maxFlow) maxFlow = flowBuffer[i];
    }

    for (let i = 0; i < flowBuffer.length; i++) {
      // Normalize with log scale
      flowData[i] = Math.log(flowBuffer[i] + 1) / Math.log(maxFlow + 1);
    }

    const flowTex = new THREE.DataTexture(
      flowData,
      width,
      height,
      THREE.RedFormat,
      THREE.FloatType
    );
    flowTex.needsUpdate = true;

    return { geometry: geo, flowTexture: flowTex, maxElevation: maxElev };
  }, [terrain]);

  // Update uniforms
  useFrame(() => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      if (material.uniforms) {
        material.uniforms.uShowRivers.value = showRivers;
      }
    }
  });

  if (!geometry || !terrain) {
    return null;
  }

  return (
    <mesh ref={meshRef} position={[terrain.width / 2, 0, terrain.height / 2]}>
      <primitive object={geometry} attach="geometry" />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uWaterLevel: { value: 0 },
          uMaxElevation: { value: maxElevation },
          uFlowTexture: { value: flowTexture },
          uShowRivers: { value: showRivers },
          uLightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
        }}
      />
    </mesh>
  );
}
