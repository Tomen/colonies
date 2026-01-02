import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '../store/simulation';

export function WaterPlane() {
  const terrain = useSimulationStore((s) => s.terrain);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      // Subtle wave animation
      meshRef.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.2 - 0.5;
    }
  });

  if (!terrain) {
    return null;
  }

  // Get dimensions from terrain
  const { width, height } = terrain.bounds;

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[width / 2, -0.5, height / 2]}
    >
      <planeGeometry args={[width * 1.5, height * 1.5]} />
      <meshStandardMaterial
        color="#1a4a7a"
        transparent
        opacity={0.8}
        metalness={0.3}
        roughness={0.4}
      />
    </mesh>
  );
}
