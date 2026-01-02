import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { useEffect } from 'react';
import { useSimulationStore } from './store/simulation';
import { TerrainRenderer } from './three/TerrainRenderer';
import { WaterPlane } from './three/WaterPlane';
import { SkyDome } from './three/SkyDome';
import { FlyControls } from './three/FlyControls';
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
          <SkyDome />
          <ambientLight intensity={0.4} />
          <directionalLight position={[100, 200, 100]} intensity={0.8} />
          <TerrainRenderer />
          <WaterPlane />
          <FlyControls moveSpeed={300} lookSpeed={0.002} />
          {status === 'running' && <Stats />}
        </Canvas>
      </div>
      <StatusBar />
    </div>
  );
}
