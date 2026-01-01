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

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[terrain.width / 2, -0.5, terrain.height / 2]}
    >
      <planeGeometry args={[terrain.width * 1.5, terrain.height * 1.5]} />
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
