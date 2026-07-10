import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export type AiCoreState = "idle" | "listening" | "thinking" | "speaking";

export function AiCore({
  state,
  amplitude = 0,
}: {
  state: AiCoreState;
  amplitude?: number;
}) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[3, 3, 5]} intensity={1.2} color={"#7dd3fc"} />
        <pointLight position={[-4, -2, 3]} intensity={0.8} color={"#a78bfa"} />
        <Sphere state={state} amplitude={amplitude} />
      </Canvas>
    </div>
  );
}

function Sphere({ state, amplitude }: { state: AiCoreState; amplitude: number }) {
  const groupRef = useRef<THREE.Group>(null!);
  const pointsRef = useRef<THREE.Points>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const wireRef = useRef<THREE.Mesh>(null!);

  // Fibonacci sphere particles
  const { positions, basePositions } = useMemo(() => {
    const COUNT = 2200;
    const positions = new Float32Array(COUNT * 3);
    const base = new Float32Array(COUNT * 3);
    const phi = Math.PI * (Math.sqrt(5) - 1);
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = phi * i;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      base[i * 3] = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
    }
    return { positions, basePositions: base };
  }, []);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  useFrame((_, delta) => {
    const t = performance.now() / 1000;
    // Rotation speed depending on state
    const rotSpeed =
      state === "thinking" ? 0.9 : state === "listening" ? 0.15 : state === "speaking" ? 0.5 : 0.08;
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * rotSpeed;
      groupRef.current.rotation.x += delta * rotSpeed * 0.35;
    }

    // Radius pulse
    const breathe = state === "idle" ? Math.sin(t * 0.8) * 0.02 + 1 : 1;
    const listen = state === "listening" ? 0.95 : 1;
    const speak =
      state === "speaking" ? 1 + amplitude * 0.35 + Math.sin(t * 8) * 0.01 : 1;
    const scale = breathe * listen * speak;

    // Deform points
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < basePositions.length; i += 3) {
      const bx = basePositions[i];
      const by = basePositions[i + 1];
      const bz = basePositions[i + 2];
      const noise =
        (Math.sin(bx * 3 + t * 1.4) + Math.cos(by * 3 + t * 1.1) + Math.sin(bz * 3 + t * 1.3)) *
        0.02;
      const r =
        scale +
        noise +
        (state === "speaking" ? amplitude * 0.12 * Math.sin(bx * 4 + t * 6) : 0);
      pos.array[i] = bx * r;
      pos.array[i + 1] = by * r;
      pos.array[i + 2] = bz * r;
    }
    pos.needsUpdate = true;

    if (glowRef.current) {
      const s =
        state === "speaking"
          ? 1.1 + amplitude * 0.4
          : state === "thinking"
            ? 1.15 + Math.sin(t * 3) * 0.05
            : state === "listening"
              ? 1.05
              : 1 + Math.sin(t * 0.8) * 0.02;
      glowRef.current.scale.setScalar(s);
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity =
        state === "speaking"
          ? 0.35 + amplitude * 0.35
          : state === "thinking"
            ? 0.35
            : state === "listening"
              ? 0.28
              : 0.18;
    }
    if (wireRef.current) {
      wireRef.current.rotation.x -= delta * 0.2;
      wireRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Inner core sphere */}
      <mesh>
        <icosahedronGeometry args={[0.75, 3]} />
        <meshBasicMaterial color={"#0e2540"} transparent opacity={0.9} />
      </mesh>
      {/* Wire */}
      <mesh ref={wireRef}>
        <icosahedronGeometry args={[0.9, 2]} />
        <meshBasicMaterial color={"#38bdf8"} wireframe transparent opacity={0.35} />
      </mesh>
      {/* Points cloud */}
      <points ref={pointsRef} geometry={geo}>
        <pointsMaterial
          size={0.02}
          sizeAttenuation
          color={"#7dd3fc"}
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      {/* Outer glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.2, 32, 32]} />
        <meshBasicMaterial
          color={"#38bdf8"}
          transparent
          opacity={0.2}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}