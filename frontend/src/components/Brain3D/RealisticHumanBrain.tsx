import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import brainData from '../../data/brainData.json';

export type BrainMode = 'compact' | 'expanded' | 'dissolving' | 'reconstructing';

interface RealisticHumanBrainProps {
  mode: BrainMode;
  onBrainClick: () => void;
  onTransitionComplete?: () => void;
  highlightedSection?: string | null;
}

interface DataStream {
  currentIdx: number;
  targetIdx: number;
  progress: number;
  speed: number;
  color: THREE.Color;
}

export const RealisticHumanBrain: React.FC<RealisticHumanBrainProps> = ({
  mode,
  onBrainClick,
  onTransitionComplete,
  highlightedSection,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onBrainClick, onTransitionComplete });
  useEffect(() => {
    callbacksRef.current = { onBrainClick, onTransitionComplete };
  });

  const stateRef = useRef({
    mode,
    mouseX: 0,
    mouseY: 0,
    targetRotationY: 0,
    targetRotationX: 0.08,
    targetRotationZ: 0,
    currentScale: 1.0,
    targetScale: 1.0,
    glowIntensity: 1.0,
    targetGlow: 1.0,
    dissolveProgress: 0.0,
    reconstructProgress: 1.0,
    hasTriggeredTransition: false,
  });

  useEffect(() => {
    stateRef.current.mode = mode;
    stateRef.current.hasTriggeredTransition = false;
    if (mode === 'compact') {
      stateRef.current.targetScale = 1.0;
      stateRef.current.targetGlow = 1.0;
      stateRef.current.dissolveProgress = 0.0;
      stateRef.current.reconstructProgress = 1.0;
    } else if (mode === 'expanded') {
      stateRef.current.targetScale = 1.15;
      stateRef.current.targetGlow = 1.6;
      stateRef.current.dissolveProgress = 0.0;
      stateRef.current.reconstructProgress = 1.0;
    } else if (mode === 'dissolving') {
      stateRef.current.targetScale = 2.4;
      stateRef.current.targetGlow = 3.0;
      stateRef.current.dissolveProgress = 0.0;
    } else if (mode === 'reconstructing') {
      stateRef.current.reconstructProgress = 0.0;
      stateRef.current.targetScale = 1.0;
      stateRef.current.targetGlow = 1.8;
      stateRef.current.dissolveProgress = 0.0;
    }
  }, [mode]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Three.js Scene Setup with Deep Space Fog
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050814, 0.02);

    // Camera positioned so 7.5-unit anatomical brain fills ~72% of viewport height
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0.2, 11.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Root Brain Hierarchy
    const brainGroup = new THREE.Group();
    scene.add(brainGroup);

    // Parse Anatomical Human Brain Geometry from brainData.json
    const rawVertices = brainData.vertices; // 2605 * 3 coordinates
    const vertexCount = brainData.vertexCount; // 2605
    const rawIndices = brainData.indices; // 14550

    const basePositions = new Float32Array(rawVertices);
    const currentPositions = new Float32Array(rawVertices);

    // Dispersion vectors for particle dissolve transition
    const explosionVectors = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      const vx = (Math.random() - 0.5) * 2;
      const vy = (Math.random() - 0.5) * 2;
      const vz = (Math.random() - 0.5) * 2;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const speed = 14 + Math.random() * 16;
      explosionVectors[i * 3] = (vx / len) * speed;
      explosionVectors[i * 3 + 1] = (vy / len) * speed;
      explosionVectors[i * 3 + 2] = (vz / len) * speed;
    }

    // Build Adjacency Graph for Smooth Action-Potential Traversal
    const adjacency: number[][] = Array.from({ length: vertexCount }, () => []);
    const maxNeighborDist = 0.94;
    const synapseLinePositions: number[] = [];
    const synapseLineColors: number[] = [];

    // Pre-calculate vertex colors based on anatomical lobes
    const vertexColors = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      const x = basePositions[i * 3];
      const y = basePositions[i * 3 + 1];
      const z = basePositions[i * 3 + 2];

      let r = 0.0, g = 0.94, b = 1.0; // Cyan default

      if (z < -1.1) {
        // Occipital lobe -> Cyber violet / Magenta
        r = 0.68; g = 0.32; b = 0.98;
      } else if (y > 1.3) {
        // Superior parietal cortex -> Electric blue
        r = 0.18; g = 0.74; b = 0.98;
      } else if (Math.abs(x) > 2.0 && y < 0.2) {
        // Lateral temporal lobes -> Bright turquoise
        r = 0.0; g = 0.88; b = 0.95;
      }

      // High-energy white-hot synaptic junction sparkles
      if (i % 9 === 0) {
        r = 0.98; g = 1.0; b = 1.0;
      }

      vertexColors[i * 3] = r;
      vertexColors[i * 3 + 1] = g;
      vertexColors[i * 3 + 2] = b;
    }

    // Build connections and adjacency list
    for (let i = 0; i < vertexCount; i += 2) {
      let connections = 0;
      const x1 = basePositions[i * 3];
      const y1 = basePositions[i * 3 + 1];
      const z1 = basePositions[i * 3 + 2];

      for (let j = i + 1; j < vertexCount; j += 3) {
        if (connections >= 2) break;
        const x2 = basePositions[j * 3];
        const y2 = basePositions[j * 3 + 1];
        const z2 = basePositions[j * 3 + 2];

        const d2 = (x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2;
        if (d2 < maxNeighborDist ** 2) {
          synapseLinePositions.push(x1, y1, z1, x2, y2, z2);
          const c1r = vertexColors[i * 3] * 0.75;
          const c1g = vertexColors[i * 3 + 1] * 0.75;
          const c1b = vertexColors[i * 3 + 2] * 0.75;
          synapseLineColors.push(c1r, c1g, c1b, c1r, c1g, c1b);

          adjacency[i].push(j);
          adjacency[j].push(i);
          connections++;
        }
      }
    }

    // 1. ANATOMICAL CORTEX MESH (Holographic Wireframe & Gyri Depth)
    const brainGeometry = new THREE.BufferGeometry();
    brainGeometry.setAttribute('position', new THREE.BufferAttribute(currentPositions, 3));
    brainGeometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
    brainGeometry.setIndex(rawIndices);
    brainGeometry.computeVertexNormals();

    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
    });
    const brainWireMesh = new THREE.Mesh(brainGeometry, wireframeMaterial);
    brainGroup.add(brainWireMesh);

    const depthMaterial = new THREE.MeshBasicMaterial({
      color: 0x050c1e,
      transparent: true,
      opacity: 0.6,
      side: THREE.FrontSide,
    });
    const brainDepthMesh = new THREE.Mesh(brainGeometry, depthMaterial);
    brainGroup.add(brainDepthMesh);

    // 2. CORTICAL NEURAL DATA NODES (2,605 Glowing Point Cloud)
    const pointCanvas = document.createElement('canvas');
    pointCanvas.width = 64;
    pointCanvas.height = 64;
    const pctx = pointCanvas.getContext('2d')!;
    const pgrad = pctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    pgrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    pgrad.addColorStop(0.25, 'rgba(0, 240, 255, 0.95)');
    pgrad.addColorStop(0.65, 'rgba(168, 85, 247, 0.45)');
    pgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    pctx.fillStyle = pgrad;
    pctx.fillRect(0, 0, 64, 64);
    const particleTexture = new THREE.CanvasTexture(pointCanvas);

    const pointMaterial = new THREE.PointsMaterial({
      size: 0.28,
      map: particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false,
    });
    const brainPoints = new THREE.Points(brainGeometry, pointMaterial);
    brainGroup.add(brainPoints);

    // 3. GLOWING SYNAPSE LINES
    const synapseLineGeo = new THREE.BufferGeometry();
    synapseLineGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(synapseLinePositions, 3)
    );
    synapseLineGeo.setAttribute('color', new THREE.Float32BufferAttribute(synapseLineColors, 3));

    const synapseLineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    const synapseLines = new THREE.LineSegments(synapseLineGeo, synapseLineMat);
    brainGroup.add(synapseLines);

    // 4. ACTION POTENTIAL DATA PARTICLES (Moving Continuously Along Sulci Pathways)
    const streamCount = 95;
    const dataStreams: DataStream[] = [];
    const streamPositions = new Float32Array(streamCount * 3);
    const streamColors = new Float32Array(streamCount * 3);

    for (let i = 0; i < streamCount; i++) {
      const start = Math.floor(Math.random() * vertexCount);
      const neighbors = adjacency[start];
      const target =
        neighbors && neighbors.length > 0
          ? neighbors[Math.floor(Math.random() * neighbors.length)]
          : (start + 1) % vertexCount;

      const isWhite = i % 4 === 0;
      dataStreams.push({
        currentIdx: start,
        targetIdx: target,
        progress: Math.random(),
        speed: 0.015 + Math.random() * 0.025,
        color: isWhite ? new THREE.Color(0xffffff) : new THREE.Color(0x00f0ff),
      });

      streamPositions[i * 3] = basePositions[start * 3];
      streamPositions[i * 3 + 1] = basePositions[start * 3 + 1];
      streamPositions[i * 3 + 2] = basePositions[start * 3 + 2];

      const c = dataStreams[i].color;
      streamColors[i * 3] = c.r;
      streamColors[i * 3 + 1] = c.g;
      streamColors[i * 3 + 2] = c.b;
    }

    const streamGeo = new THREE.BufferGeometry();
    streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPositions, 3));
    streamGeo.setAttribute('color', new THREE.BufferAttribute(streamColors, 3));

    const streamMat = new THREE.PointsMaterial({
      size: 0.54,
      map: particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false,
    });
    const dataSparks = new THREE.Points(streamGeo, streamMat);
    brainGroup.add(dataSparks);

    // 5. TRANSPARENT GLOWING AURA & CORONAL RIPPLE
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 256;
    haloCanvas.height = 256;
    const hctx = haloCanvas.getContext('2d')!;
    const hgrad = hctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    hgrad.addColorStop(0, 'rgba(0, 240, 255, 0.45)');
    hgrad.addColorStop(0.35, 'rgba(168, 85, 247, 0.25)');
    hgrad.addColorStop(0.7, 'rgba(0, 112, 243, 0.08)');
    hgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    hctx.fillStyle = hgrad;
    hctx.fillRect(0, 0, 256, 256);
    const haloTexture = new THREE.CanvasTexture(haloCanvas);

    const haloSpriteMat = new THREE.SpriteMaterial({
      map: haloTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.65,
    });
    const haloSprite = new THREE.Sprite(haloSpriteMat);
    haloSprite.scale.set(15, 12.5, 1);
    brainGroup.add(haloSprite);

    // Ambient floating orbital data particles
    const dustCount = 85;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(2 * Math.random() - 1);
      const r = 4.5 + Math.random() * 3.5;
      dustPos[i * 3] = r * Math.sin(v) * Math.cos(u);
      dustPos[i * 3 + 1] = r * Math.sin(v) * Math.sin(u) * 0.8;
      dustPos[i * 3 + 2] = r * Math.cos(v);
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 0.18,
      map: particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      color: 0x38bdf8,
      opacity: 0.5,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    brainGroup.add(dustPoints);

    // Window-Level Mouse Tracking & Smooth Parallax Listeners
    const onMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;

      stateRef.current.mouseX = x;
      stateRef.current.mouseY = y;
      // Multi-axis tilt: Yaw, Pitch and subtle banking Roll
      stateRef.current.targetRotationY = x * 0.85;
      stateRef.current.targetRotationX = 0.08 - y * 0.55;
      stateRef.current.targetRotationZ = -x * 0.15;
    };

    const onClick = () => {
      if (
        stateRef.current.mode === 'dissolving' ||
        stateRef.current.mode === 'reconstructing'
      ) {
        return;
      }
      callbacksRef.current.onBrainClick();
    };

    window.addEventListener('pointermove', onMouseMove);
    container.addEventListener('click', onClick);

    // Animation Render Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const st = stateRef.current;

      // 1. CONTINUOUS ROTATION & SMOOTH MOUSE PARALLAX RESPONSE
      if (st.mode !== 'dissolving') {
        brainGroup.rotation.y += 0.0035; // Majestic slow auto-rotation
      }
      // Damped lerp movement for cinematic weight
      brainGroup.rotation.y += (st.targetRotationY - brainGroup.rotation.y) * 0.06;
      brainGroup.rotation.x += (st.targetRotationX - brainGroup.rotation.x) * 0.06;
      brainGroup.rotation.z += (st.targetRotationZ - brainGroup.rotation.z) * 0.06;

      // Subtle parallax camera position tracking
      camera.position.x += (st.mouseX * 0.5 - camera.position.x) * 0.05;
      camera.position.y += (0.2 + st.mouseY * 0.4 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      // Rotate ambient data dust slowly in reverse
      dustPoints.rotation.y -= 0.0012;

      // 2. ORGANIC DUAL-HARMONIC BREATHING PULSE
      const breathingPulse =
        st.mode === 'compact'
          ? Math.sin(elapsedTime * 1.5) * 0.03 + Math.cos(elapsedTime * 0.8) * 0.015
          : Math.sin(elapsedTime * 2.2) * 0.045;

      const currentScale = st.targetScale + breathingPulse;
      st.currentScale += (currentScale - st.currentScale) * 0.08;
      brainGroup.scale.set(st.currentScale, st.currentScale, st.currentScale);

      // Aura breathing pulse
      haloSprite.scale.set(
        15 * (1 + breathingPulse * 2.0),
        12.5 * (1 + breathingPulse * 2.0),
        1
      );
      haloSpriteMat.opacity = 0.58 + Math.sin(elapsedTime * 2.0) * 0.14 * st.targetGlow;

      // 3. CONTINUOUS ACTION-POTENTIAL DATA STREAMS ALONG SULCI
      const streamPos = streamGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < streamCount; i++) {
        const stream = dataStreams[i];
        stream.progress += stream.speed;

        if (stream.progress >= 1.0) {
          // Reached target node -> hop to next adjacent neighbor
          stream.progress = 0.0;
          stream.currentIdx = stream.targetIdx;
          const nextNeighbors = adjacency[stream.targetIdx];
          if (nextNeighbors && nextNeighbors.length > 0) {
            stream.targetIdx =
              nextNeighbors[Math.floor(Math.random() * nextNeighbors.length)];
          } else {
            stream.targetIdx = Math.floor(Math.random() * vertexCount);
          }
        }

        const cIdx = stream.currentIdx * 3;
        const tIdx = stream.targetIdx * 3;
        const t = stream.progress;

        // Smooth 3D interpolation along the sulcus line
        streamPos[i * 3] = basePositions[cIdx] * (1 - t) + basePositions[tIdx] * t;
        streamPos[i * 3 + 1] =
          basePositions[cIdx + 1] * (1 - t) + basePositions[tIdx + 1] * t;
        streamPos[i * 3 + 2] =
          basePositions[cIdx + 2] * (1 - t) + basePositions[tIdx + 2] * t;
      }
      streamGeo.attributes.position.needsUpdate = true;

      // 4. PARTICLE DISSOLVE & PARTICLE RECONSTRUCTION
      if (st.mode === 'dissolving') {
        st.dissolveProgress = Math.min(1.0, st.dissolveProgress + 0.026);
        const pPositions = brainGeometry.attributes.position.array as Float32Array;
        const t = st.dissolveProgress;
        const easeOut = 1 - (1 - t) ** 3.2;
        const spin = t * 2.2;
        const cosS = Math.cos(spin);
        const sinS = Math.sin(spin);

        for (let i = 0; i < vertexCount; i++) {
          const bx = basePositions[i * 3];
          const by = basePositions[i * 3 + 1];
          const bz = basePositions[i * 3 + 2];

          // Rotated base position + turbulent radial explosion
          const rx = bx * cosS - bz * sinS;
          const rz = bx * sinS + bz * cosS;

          pPositions[i * 3] = rx + explosionVectors[i * 3] * easeOut;
          pPositions[i * 3 + 1] = by + explosionVectors[i * 3 + 1] * easeOut;
          pPositions[i * 3 + 2] = rz + explosionVectors[i * 3 + 2] * easeOut;
        }
        brainGeometry.attributes.position.needsUpdate = true;

        // Flare point size & fade wireframe as particles blast outward
        pointMaterial.size = 0.28 + t * 0.25;
        wireframeMaterial.opacity = Math.max(0, 0.16 * (1 - t * 2.2));
        synapseLineMat.opacity = Math.max(0, 0.35 * (1 - t * 2.2));
        depthMaterial.opacity = Math.max(0, 0.6 * (1 - t * 2.2));

        // Flare halo aura outward into camera
        haloSprite.scale.set(15 + t * 24, 12.5 + t * 20, 1);
        haloSpriteMat.opacity = Math.max(0, (1 - t * 0.8) * 0.8);

        if (st.dissolveProgress >= 0.98 && !st.hasTriggeredTransition) {
          st.hasTriggeredTransition = true;
          callbacksRef.current.onTransitionComplete?.();
        }
      } else if (st.mode === 'reconstructing') {
        st.reconstructProgress = Math.min(1.0, st.reconstructProgress + 0.024);
        const pPositions = brainGeometry.attributes.position.array as Float32Array;
        const invT = 1 - st.reconstructProgress;
        const easeIn = invT ** 2.8;
        const spin = invT * 2.4;
        const cosS = Math.cos(spin);
        const sinS = Math.sin(spin);

        for (let i = 0; i < vertexCount; i++) {
          const bx = basePositions[i * 3];
          const by = basePositions[i * 3 + 1];
          const bz = basePositions[i * 3 + 2];

          const rx = bx * cosS - bz * sinS;
          const rz = bx * sinS + bz * cosS;

          pPositions[i * 3] = rx + explosionVectors[i * 3] * easeIn;
          pPositions[i * 3 + 1] = by + explosionVectors[i * 3 + 1] * easeIn;
          pPositions[i * 3 + 2] = rz + explosionVectors[i * 3 + 2] * easeIn;
        }
        brainGeometry.attributes.position.needsUpdate = true;

        pointMaterial.size = 0.28 + invT * 0.2;
        wireframeMaterial.opacity = 0.16 * st.reconstructProgress;
        synapseLineMat.opacity = 0.35 * st.reconstructProgress;
        depthMaterial.opacity = 0.6 * st.reconstructProgress;

        haloSprite.scale.set(15 + invT * 10, 12.5 + invT * 8, 1);
        haloSpriteMat.opacity = 0.58 * st.reconstructProgress;

        if (st.reconstructProgress >= 0.98 && !st.hasTriggeredTransition) {
          st.hasTriggeredTransition = true;
          callbacksRef.current.onTransitionComplete?.();
        }
      } else {
        const pPositions = brainGeometry.attributes.position.array as Float32Array;
        for (let i = 0; i < vertexCount * 3; i++) {
          pPositions[i] = basePositions[i];
        }
        brainGeometry.attributes.position.needsUpdate = true;
        pointMaterial.size = 0.28;
        wireframeMaterial.opacity = 0.16 * st.targetGlow;
        synapseLineMat.opacity = 0.35 * st.targetGlow;
        depthMaterial.opacity = 0.6;
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', onMouseMove);
      container.removeEventListener('click', onClick);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none overflow-hidden cursor-pointer">
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
};
