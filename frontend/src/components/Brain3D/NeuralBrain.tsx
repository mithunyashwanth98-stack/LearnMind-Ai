import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Subject } from '../../types';

interface NeuralBrainProps {
  subjects: Subject[];
  onSelectSubject: (subject: Subject) => void;
  onBrainClick: () => void;
  isNewStudent?: boolean;
}

export const NeuralBrain: React.FC<NeuralBrainProps> = ({
  subjects,
  onSelectSubject,
  onBrainClick,
  isNewStudent = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredSubject, setHoveredSubject] = useState<Subject | null>(null);
  const [isRotating, setIsRotating] = useState(true);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Three.js Scene Setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050814, 0.04);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 16);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Root Brain Group
    const brainGroup = new THREE.Group();
    scene.add(brainGroup);

    // Generate Procedural Cortical Point Cloud (Left and Right Hemispheres)
    const cortexPoints: THREE.Vector3[] = [];
    const cortexColors: number[] = [];
    const numPointsPerHemi = 1200;

    const colorCyan = new THREE.Color(0x00f0ff);
    const colorViolet = new THREE.Color(0xa855f7);
    const colorBlue = new THREE.Color(0x38bdf8);
    const colorOrange = new THREE.Color(0xf97316);
    const colorGrey = new THREE.Color(0x64748b);

    // Determine subject color map based on brain region
    const getRegionColor = (x: number, y: number, z: number): THREE.Color => {
      if (isNewStudent) return colorGrey;
      if (y > 0.8 && z > 0) return colorCyan; // Frontal (Math - Strong)
      if (x < -0.8) return colorBlue; // Temporal (Python - Good)
      if (y > 0.6 && z < -0.5) return colorOrange; // Parietal (Java - Needs improvement)
      if (y < -0.6) return colorGrey; // Occipital (Physics - Not Assessed)
      return Math.random() > 0.5 ? colorCyan : colorViolet;
    };

    [-1, 1].forEach((hemiSign) => {
      for (let i = 0; i < numPointsPerHemi; i++) {
        // Parametric ellipsoid coordinates
        const u = Math.random() * Math.PI * 2;
        const v = Math.acos(2 * Math.random() - 1);

        // Anatomical ellipsoid dimensions (width, height, depth)
        const rx = 2.1;
        const ry = 2.4;
        const rz = 3.2;

        let px = rx * Math.sin(v) * Math.cos(u);
        let py = ry * Math.sin(v) * Math.sin(u);
        let pz = rz * Math.cos(v);

        // Flatten medial longitudinal fissure between hemispheres
        px = px * 0.85 + hemiSign * 0.45;

        // Realistic Gyri and Sulci folds perturbation
        const gyrus =
          0.22 * Math.sin(6 * u) * Math.cos(7 * v) +
          0.12 * Math.sin(12 * v) * Math.cos(10 * u) +
          0.08 * Math.sin(18 * (px + pz));

        px += gyrus * 0.4;
        py += gyrus * 0.4;
        pz += gyrus * 0.5;

        // Temporal lobe protrusion
        if (py < -0.2 && pz > -0.5 && pz < 1.2) {
          px += hemiSign * 0.35;
        }

        const point = new THREE.Vector3(px, py, pz);
        cortexPoints.push(point);

        const pointColor = getRegionColor(px, py, pz);
        cortexColors.push(pointColor.r, pointColor.g, pointColor.b);
      }
    });

    // Create Cortical Point Cloud Geometry
    const pointPositions = new Float32Array(cortexPoints.length * 3);
    for (let i = 0; i < cortexPoints.length; i++) {
      pointPositions[i * 3] = cortexPoints[i].x;
      pointPositions[i * 3 + 1] = cortexPoints[i].y;
      pointPositions[i * 3 + 2] = cortexPoints[i].z;
    }

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
    pointGeo.setAttribute('color', new THREE.Float32BufferAttribute(cortexColors, 3));

    // Particle texture for glowing circular dots
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(0,240,255,0.8)');
    gradient.addColorStop(0.7, 'rgba(168,85,247,0.3)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const particleTexture = new THREE.CanvasTexture(canvas);

    const pointMat = new THREE.PointsMaterial({
      size: 0.22,
      map: particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });

    const cortexPointCloud = new THREE.Points(pointGeo, pointMat);
    brainGroup.add(cortexPointCloud);

    // Create Synaptic Neural Connections (Lines between close nodes)
    const linePositions: number[] = [];
    const lineColors: number[] = [];
    const maxConnectionDist = 0.85;

    for (let i = 0; i < cortexPoints.length; i += 2) {
      let connections = 0;
      for (let j = i + 1; j < cortexPoints.length; j += 3) {
        if (connections > 2) break;
        const dist = cortexPoints[i].distanceTo(cortexPoints[j]);
        if (dist < maxConnectionDist) {
          linePositions.push(cortexPoints[i].x, cortexPoints[i].y, cortexPoints[i].z);
          linePositions.push(cortexPoints[j].x, cortexPoints[j].y, cortexPoints[j].z);

          const c1 = getRegionColor(cortexPoints[i].x, cortexPoints[i].y, cortexPoints[i].z);
          lineColors.push(c1.r * 0.7, c1.g * 0.7, c1.b * 0.7);
          lineColors.push(c1.r * 0.7, c1.g * 0.7, c1.b * 0.7);
          connections++;
        }
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
    });

    const synapseLines = new THREE.LineSegments(lineGeo, lineMat);
    brainGroup.add(synapseLines);

    // Dynamic Action Potentials (Sparks moving along synapses)
    const sparkCount = 45;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(sparkCount * 3);
    const sparkIndices = Array.from({ length: sparkCount }, () =>
      Math.floor(Math.random() * cortexPoints.length)
    );

    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({
      size: 0.42,
      map: particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      color: 0x00f0ff,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    brainGroup.add(sparks);

    // Atmospheric Glowing Halo/Aura around Brain
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 128;
    haloCanvas.height = 128;
    const haloCtx = haloCanvas.getContext('2d')!;
    const haloGrad = haloCtx.createRadialGradient(64, 64, 10, 64, 64, 64);
    haloGrad.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
    haloGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.15)');
    haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    haloCtx.fillStyle = haloGrad;
    haloCtx.fillRect(0, 0, 128, 128);
    const haloTexture = new THREE.CanvasTexture(haloCanvas);

    const haloSpriteMat = new THREE.SpriteMaterial({
      map: haloTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.65,
    });
    const haloSprite = new THREE.Sprite(haloSpriteMat);
    haloSprite.scale.set(11, 10, 1);
    brainGroup.add(haloSprite);

    // Subject Anchor Orbit Spheres
    const subjectNodes: THREE.Mesh[] = [];
    subjects.forEach((subj) => {
      const nodeGeo = new THREE.SphereGeometry(0.32, 16, 16);
      const nodeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(subj.color),
        wireframe: true,
      });
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
      nodeMesh.position.set(
        subj.nodeCoordinates[0] * 3.2,
        subj.nodeCoordinates[1] * 3.2,
        subj.nodeCoordinates[2] * 3.2
      );
      (nodeMesh as any).userData = { subject: subj };
      brainGroup.add(nodeMesh);
      subjectNodes.push(nodeMesh);
    });

    // Mouse Interaction and Inertia
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0.2;
    let targetRotationY = 0;
    let clickPulseScale = 1;

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      mouseX = x;
      mouseY = y;
      targetRotationY = x * 0.7;
      targetRotationX = 0.2 - y * 0.4;
    };

    container.addEventListener('mousemove', onMouseMove);

    // Raycasting for interactive clicks
    const raycaster = new THREE.Raycaster();
    const mouseVector = new THREE.Vector2();

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVector.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      raycaster.setFromCamera(mouseVector, camera);
      const intersects = raycaster.intersectObjects(subjectNodes);

      if (intersects.length > 0) {
        const selected = (intersects[0].object as any).userData?.subject;
        if (selected) {
          onSelectSubject(selected);
          return;
        }
      }

      // Pulse animation trigger on brain click
      clickPulseScale = 1.25;
      onBrainClick();
    };

    container.addEventListener('click', onClick);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth auto-rotation & mouse damping
      if (isRotating) {
        brainGroup.rotation.y += 0.0035;
      }
      brainGroup.rotation.y += (targetRotationY - brainGroup.rotation.y) * 0.05;
      brainGroup.rotation.x += (targetRotationX - brainGroup.rotation.x) * 0.05;

      // Animate action potential sparks
      const pos = sparkGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < sparkCount; i++) {
        const ptIdx = (sparkIndices[i] + Math.floor(elapsedTime * 15)) % cortexPoints.length;
        const targetPt = cortexPoints[ptIdx];
        pos[i * 3] = targetPt.x;
        pos[i * 3 + 1] = targetPt.y;
        pos[i * 3 + 2] = targetPt.z;
      }
      sparkGeo.attributes.position.needsUpdate = true;

      // Pulsing aura animation
      const auraScale = 9.5 + Math.sin(elapsedTime * 1.8) * 0.6;
      haloSprite.scale.set(auraScale, auraScale * 0.95, 1);

      // Click pulse recovery
      if (clickPulseScale > 1.0) {
        clickPulseScale -= 0.015;
        brainGroup.scale.set(clickPulseScale, clickPulseScale, clickPulseScale);
      } else {
        brainGroup.scale.set(1, 1, 1);
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
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
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('click', onClick);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [subjects, isNewStudent, isRotating]);

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none overflow-hidden">
      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="w-full h-full cursor-pointer" />

      {/* Futuristic Orbiting Subject Overlay Pills */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
        <div className="flex justify-between items-start pointer-events-auto">
          {subjects.slice(0, 2).map((subject) => (
            <button
              key={subject.id}
              onClick={() => onSelectSubject(subject)}
              onMouseEnter={() => setHoveredSubject(subject)}
              onMouseLeave={() => setHoveredSubject(null)}
              className="glass-panel p-3.5 rounded-2xl flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:border-cyan-400 group text-left max-w-xs shadow-lg"
              style={{
                borderColor:
                  subject.status === 'strong'
                    ? '#00f0ff'
                    : subject.status === 'good'
                    ? '#38bdf8'
                    : subject.status === 'needs_improvement'
                    ? '#f97316'
                    : '#64748b',
              }}
            >
              <div
                className="w-3.5 h-3.5 rounded-full animate-ping"
                style={{ backgroundColor: subject.color }}
              />
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                  <span>{subject.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-cyan-300">
                    {subject.status === 'not_assessed' ? 'Unmapped' : `${subject.masteryScore}%`}
                  </span>
                </div>
                <div className="text-sm font-bold text-white capitalize flex items-center gap-2">
                  <span
                    className={
                      subject.status === 'strong'
                        ? 'text-cyan-400 text-glow-cyan'
                        : subject.status === 'good'
                        ? 'text-sky-400'
                        : subject.status === 'needs_improvement'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }
                  >
                    {subject.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-between items-end pointer-events-auto">
          {subjects.slice(2, 4).map((subject) => (
            <button
              key={subject.id}
              onClick={() => onSelectSubject(subject)}
              onMouseEnter={() => setHoveredSubject(subject)}
              onMouseLeave={() => setHoveredSubject(null)}
              className="glass-panel p-3.5 rounded-2xl flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:border-cyan-400 group text-left max-w-xs shadow-lg"
              style={{
                borderColor:
                  subject.status === 'strong'
                    ? '#00f0ff'
                    : subject.status === 'good'
                    ? '#38bdf8'
                    : subject.status === 'needs_improvement'
                    ? '#f97316'
                    : '#64748b',
              }}
            >
              <div
                className="w-3.5 h-3.5 rounded-full animate-pulse"
                style={{ backgroundColor: subject.color }}
              />
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                  <span>{subject.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-cyan-300">
                    {subject.status === 'not_assessed' ? 'Unmapped' : `${subject.masteryScore}%`}
                  </span>
                </div>
                <div className="text-sm font-bold text-white capitalize flex items-center gap-2">
                  <span
                    className={
                      subject.status === 'strong'
                        ? 'text-cyan-400 text-glow-cyan'
                        : subject.status === 'good'
                        ? 'text-sky-400'
                        : subject.status === 'needs_improvement'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }
                  >
                    {subject.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Central Interactive Brain Prompt Pill */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto z-10">
        <button
          onClick={onBrainClick}
          className="px-6 py-2.5 rounded-full bg-slate-900/80 border border-cyan-500/40 text-cyan-300 font-medium text-xs tracking-wider uppercase backdrop-blur-md hover:bg-cyan-500/10 hover:border-cyan-400 transition-all flex items-center gap-2.5 shadow-[0_0_20px_rgba(0,240,255,0.25)] hover:shadow-[0_0_30px_rgba(0,240,255,0.4)]"
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>Interactive Neural Knowledge Map • Click Brain to Explore</span>
        </button>
      </div>
    </div>
  );
};

