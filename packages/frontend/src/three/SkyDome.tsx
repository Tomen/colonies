import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SkyDomeProps {
  radius?: number;
}

export function SkyDome({ radius = 2500 }: SkyDomeProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Follow the camera
  useFrame(({ camera }) => {
    if (meshRef.current) {
      meshRef.current.position.copy(camera.position);
    }
  });

  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    return geo;
  }, [radius]);

  const material = useMemo(() => {
    // Create a gradient texture
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Gradient from top to bottom
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);

    // Sky colors (top to horizon to water)
    gradient.addColorStop(0, '#87CEEB');      // Light sky blue at zenith
    gradient.addColorStop(0.3, '#B0E0E6');    // Powder blue
    gradient.addColorStop(0.45, '#E0F0FF');   // Very light blue near horizon
    gradient.addColorStop(0.5, '#F5F5F0');    // Hazy white at horizon
    gradient.addColorStop(0.55, '#4A7C9B');   // Water blue below horizon
    gradient.addColorStop(0.7, '#1A5276');    // Deeper ocean blue
    gradient.addColorStop(1, '#0D3B54');      // Deep water at bottom

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
    });
  }, []);

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} renderOrder={-1000} />
  );
}
