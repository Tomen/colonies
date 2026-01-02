import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore, DEFAULT_CAMERA } from '../store/simulation';

interface FlyControlsProps {
  moveSpeed?: number;
  lookSpeed?: number;
}

export function FlyControls({ moveSpeed = 300, lookSpeed = 0.002 }: FlyControlsProps) {
  const { camera, gl } = useThree();
  const isLocked = useRef(false);
  const cameraState = useSimulationStore((s) => s.camera);
  const setCameraState = useSimulationStore((s) => s.setCameraState);
  const lastSaveTime = useRef(0);

  // Movement state
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    horizontalForward: false,
    horizontalBackward: false,
    slow: false,
  });

  // Euler angles for look direction
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const initialized = useRef(false);

  // Initialize camera from stored state on mount
  useEffect(() => {
    if (!initialized.current) {
      camera.position.set(...cameraState.position);
      euler.current.set(...cameraState.rotation);
      camera.quaternion.setFromEuler(euler.current);
      initialized.current = true;
    }
  }, [camera, cameraState]);

  // Watch for camera reset
  useEffect(() => {
    if (cameraState.position[0] === DEFAULT_CAMERA.position[0] &&
        cameraState.position[1] === DEFAULT_CAMERA.position[1] &&
        cameraState.position[2] === DEFAULT_CAMERA.position[2] &&
        cameraState.rotation[0] === DEFAULT_CAMERA.rotation[0] &&
        cameraState.rotation[1] === DEFAULT_CAMERA.rotation[1] &&
        cameraState.rotation[2] === DEFAULT_CAMERA.rotation[2]) {
      camera.position.set(...DEFAULT_CAMERA.position);
      euler.current.set(...DEFAULT_CAMERA.rotation);
      camera.quaternion.setFromEuler(euler.current);
    }
  }, [camera, cameraState]);

  useEffect(() => {
    const canvas = gl.domElement;

    // Initialize euler from current camera rotation
    euler.current.setFromQuaternion(camera.quaternion);

    const onPointerLockChange = () => {
      isLocked.current = document.pointerLockElement === canvas;
    };

    const onClick = () => {
      if (!isLocked.current) {
        canvas.requestPointerLock();
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      // Right-click (button 2) exits pointer lock
      if (event.button === 2 && isLocked.current) {
        document.exitPointerLock();
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      // Prevent context menu on canvas
      event.preventDefault();
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!isLocked.current) return;

      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      euler.current.y -= movementX * lookSpeed;
      euler.current.x -= movementY * lookSpeed;

      // Clamp vertical look
      euler.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.current.x));

      camera.quaternion.setFromEuler(euler.current);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isLocked.current) return;

      switch (event.code) {
        case 'KeyW':
          moveState.current.forward = true;
          break;
        case 'KeyS':
          moveState.current.backward = true;
          break;
        case 'KeyA':
          moveState.current.left = true;
          break;
        case 'KeyD':
          moveState.current.right = true;
          break;
        case 'KeyQ':
          moveState.current.up = true;
          break;
        case 'KeyZ':
          moveState.current.down = true;
          break;
        case 'KeyR':
          moveState.current.horizontalForward = true;
          break;
        case 'KeyF':
          moveState.current.horizontalBackward = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          moveState.current.slow = true;
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
          moveState.current.forward = false;
          break;
        case 'KeyS':
          moveState.current.backward = false;
          break;
        case 'KeyA':
          moveState.current.left = false;
          break;
        case 'KeyD':
          moveState.current.right = false;
          break;
        case 'KeyQ':
          moveState.current.up = false;
          break;
        case 'KeyZ':
          moveState.current.down = false;
          break;
        case 'KeyR':
          moveState.current.horizontalForward = false;
          break;
        case 'KeyF':
          moveState.current.horizontalBackward = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          moveState.current.slow = false;
          break;
      }
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [camera, gl, lookSpeed]);

  useFrame((_, delta) => {
    if (!isLocked.current) return;

    const state = moveState.current;
    const speedMultiplier = state.slow ? 0.01 : 1;
    const speed = moveSpeed * delta * speedMultiplier;

    // Forward/backward - fly in camera's look direction (including pitch)
    if (state.forward || state.backward) {
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(camera.quaternion);
      const dir = state.forward ? 1 : -1;
      camera.position.addScaledVector(forward, dir * speed);
    }

    // Strafe left/right - move perpendicular to look direction on XZ plane
    if (state.left || state.right) {
      const right = new THREE.Vector3(1, 0, 0);
      right.applyQuaternion(camera.quaternion);
      right.y = 0;
      right.normalize();
      const dir = state.right ? 1 : -1;
      camera.position.addScaledVector(right, dir * speed);
    }

    // Horizontal forward/backward - move in look direction on XZ plane (no height change)
    if (state.horizontalForward || state.horizontalBackward) {
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(camera.quaternion);
      forward.y = 0;
      forward.normalize();
      const dir = state.horizontalForward ? 1 : -1;
      camera.position.addScaledVector(forward, dir * speed);
    }

    // Up/down - world Y axis
    if (state.up) {
      camera.position.y += speed;
    }
    if (state.down) {
      camera.position.y -= speed;
    }

    // Save camera state periodically (every 500ms)
    const now = Date.now();
    if (now - lastSaveTime.current > 500) {
      lastSaveTime.current = now;
      setCameraState({
        position: [camera.position.x, camera.position.y, camera.position.z],
        rotation: [euler.current.x, euler.current.y, euler.current.z],
      });
    }
  });

  return null;
}
