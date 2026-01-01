import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { useEffect } from 'react';
import { useSimulationStore } from './store/simulation';
import { TerrainMesh } from './three/TerrainMesh';
import { WaterPlane } from './three/WaterPlane';
import { ControlPanel } from './components/ControlPanel';
import { StatusBar } from './components/StatusBar';
import './App.css';

export default function App() {
  const { initWorker, status } = useSimulationStore();

  useEffect(() => {
    initWorker();
  }, [initWorker]);

  return (
    <div className="app">
      <ControlPanel />
      <div className="canvas-container">
        <Canvas
          camera={{ position: [1200, 600, 1000], fov: 60, near: 1, far: 5000 }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={['#1a1a2e']} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[100, 200, 100]} intensity={0.8} />
          <TerrainMesh />
          <WaterPlane />
          <OrbitControls
            target={[500, 0, 500]}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={50}
            maxDistance={2000}
          />
          {status === 'running' && <Stats />}
        </Canvas>
      </div>
      <StatusBar />
    </div>
  );
}
