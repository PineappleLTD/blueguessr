"use client";

import { useEffect, useId, useRef, useState } from "react";
import type * as THREE_NS from "three";

/*
 * A band of maize particle dunes that roll like a slow sea.
 *
 * Adapted from Pineapple's own ParticleBackground (pineapplehacks.com): the same procedural
 * sand (fractal-noise dunes + wind ripples, every grain lit by a low sun) and the same swaying,
 * shimmering point shader, tinted maize/gold and with long swells rolling toward the viewer.
 *
 * three.js loads only on the client, after the page is up. Particle count follows the band's
 * size (fewer on phones), rendering pauses while the tab is hidden or the band is off screen,
 * reduced motion gets a single still frame, and without WebGL a static dotted SVG stays put.
 */

// --- procedural ground (from Pineapple's ParticleBackground) -----------------

// Integer hash -> 0..1
const hash2 = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// Smooth 2D value noise, 0..1
const noise2 = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

// Fractal noise (4 octaves), roughly 0..1
const fbm = (x: number, y: number) => {
  let sum = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += noise2(x * freq, y * freq) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum / 0.9375;
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Sun direction (normalized): low, from the back-left, so ripples cast shading.
const SUN = (() => {
  const v = [-0.55, 0.45, -0.7];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / l);
})();

// sRGB 0..1 (ShaderMaterial output isn't color-managed, so these show as-is).
const GOLD_DEEP = [0.71, 0.5, 0.043]; // #B57F0B
const GOLD = [0.91, 0.64, 0.09]; // #E8A317
const MAIZE = [1, 0.8, 0.02]; // #FFCB05
const MAIZE_SOFT = [1, 0.93, 0.62];

/** Where the camera sits and how much of the plane the band shows. */
interface GroundView {
  camH: number; // camera height above the sand
  tanHalf: number; // tan(vertical fov / 2) of the full (virtual) frame
  aspect: number; // width / virtual height
}

/**
 * Sand plain receding to the horizon. Grains are spread evenly per world area, so perspective
 * packs them tighter in the distance; brightness comes from how each grain's slope faces the sun.
 */
function generateDunes({ camH, tanHalf, aspect }: GroundView, maxCount: number) {
  const positions = new Float32Array(maxCount * 3);
  const colors = new Float32Array(maxCount * 3);

  const height = (x: number, z: number) => {
    const dunes = (fbm(x * 0.1 + 3.1, z * 0.1 + 8.4) - 0.5) * 2.4;
    const warp = fbm(x * 0.25, z * 0.25) * 3;
    const ripples = Math.sin(x * 0.35 + z * 2.4 + warp) * 0.05;
    return dunes + ripples;
  };

  const dNear = Math.max(1, (camH + 0.8) / tanHalf);
  const dFar = dNear + 58;
  const e = 0.05;

  let n = 0;
  for (let attempt = 0; attempt < maxCount * 3 && n < maxCount; attempt++) {
    // Uniform per world area within the view frustum: p(d) ∝ d.
    const d = Math.sqrt(dNear * dNear + Math.random() * (dFar * dFar - dNear * dNear));
    const halfW = d * tanHalf * aspect * 1.05;
    const x = (Math.random() * 2 - 1) * halfW;
    const z = -d;
    const y = height(x, z);

    const dx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const dz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    const nl = Math.hypot(dx, 1, dz);
    const diffuse = Math.max(0, (-dx * SUN[0] + SUN[1] - dz * SUN[2]) / nl);
    const lit = 0.12 + 0.88 * Math.pow(diffuse, 1.6);

    // Lit areas get more grains, shadowed ones fewer.
    if (Math.random() > 0.25 + 0.75 * lit) continue;

    // Fade into the night toward the horizon.
    const fade = 1 - smoothstep(dFar * 0.3, dFar, d);
    const k = fade * (0.4 + 0.6 * lit) * (0.6 + 0.4 * Math.random());
    // Shadowed grains deep gold, lit ones maize, the brightest almost cream.
    const [from, to, t] = lit < 0.55 ? [GOLD_DEEP, GOLD, lit / 0.55] : lit < 0.85 ? [GOLD, MAIZE, (lit - 0.55) / 0.3] : [MAIZE, MAIZE_SOFT, (lit - 0.85) / 0.15];

    positions[n * 3] = x;
    positions[n * 3 + 1] = y;
    positions[n * 3 + 2] = z;
    for (let c = 0; c < 3; c++) colors[n * 3 + c] = (from[c] + (to[c] - from[c]) * t) * k;
    n++;
  }

  return { positions: positions.subarray(0, n * 3), colors: colors.subarray(0, n * 3) };
}

// --- shaders (Pineapple's sway + shimmer, plus rolling swells) -----------------

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform float uMotion;
  attribute vec3 color;
  varying vec3 vColor;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  void main() {
    vec3 p = position;
    float t = uTime * (0.6 + 0.4 * uMotion);

    // Long swells rolling in toward the viewer, bent a little so they don't look ruled.
    float phase = p.z * 0.42 - t * 0.85 + sin(p.x * 0.11 + t * 0.15) * 1.6;
    float swell = sin(phase);
    p.y += swell * 0.13 * uMotion;

    // Shared sway.
    float amp = 0.02 * uMotion;
    p.x += sin(0.4 * t + 0.6 * p.y + 0.15 * p.x) * amp
         + sin(0.25 * t + 0.3 * p.x) * amp * 0.5;
    p.y += cos(0.35 * t + 0.4 * p.x) * amp * 0.4;

    // Individual drift: each grain circles its spot with its own phase and speed.
    float r = hash(position);
    float r2 = hash(position.yzx + 7.0);
    float speed = 0.5 + r2 * 1.2;
    float wob = 0.014 * uMotion;
    p.x += sin(t * speed + r * 6.2831) * wob;
    p.y += cos(t * speed * 0.8 + r * 6.2831) * wob;
    p.z += sin(t * speed * 0.6 + r2 * 6.2831) * wob * 2.0;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, uSize * (uScale / -mv.z));

    // Light catches the crests as they roll by; a few grains twinkle.
    float crest = 0.72 + 0.5 * smoothstep(-0.1, 1.0, swell);
    float twinkle = 0.85 + 0.15 * sin(t * (1.4 + r2 * 2.6) + r * 6.2831);
    vColor = color * crest * twinkle;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uBrightness;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(vColor * uBrightness, 1.0);
  }
`;

const FOV = 46;
/** Horizon height as a fraction of the band, from the top. */
const HORIZON = 0.16;
const CAM_H = 2.3;

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------

export default function ParticleDunes({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !webglAvailable()) return;

    let disposed = false;
    let teardown = () => {};

    (async () => {
      const THREE: typeof THREE_NS = await import("three");
      if (disposed) return;

      let renderer: THREE_NS.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
      } catch {
        return; // keep the static fallback
      }
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const small = window.matchMedia("(max-width: 640px), (pointer: coarse)").matches;
      const lowPower = (navigator.hardwareConcurrency ?? 8) <= 4;
      // A software renderer (blocklisted GPU, VMs) draws points on the CPU: keep it light.
      const gl = renderer.getContext();
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      const gpu = String(gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
      const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu);

      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(software ? 1 : Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
      const canvas = renderer.domElement;
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity 900ms ease";
      container.appendChild(canvas);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
      camera.position.set(0, CAM_H, 0);
      camera.lookAt(0, CAM_H, -1);

      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: small ? 0.085 : 0.075 },
          uScale: { value: 1 },
          uBrightness: { value: 1.35 },
          uMotion: { value: reduceMotion ? 0 : 1 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });

      let geometry: THREE_NS.BufferGeometry | null = null;
      let points: THREE_NS.Points | null = null;
      let built: { w: number; h: number } | null = null;
      let width = 0;
      let height = 0;

      const build = () => {
        if (!width || !height) return;
        built = { w: width, h: height };
        const virtualH = 2 * height * (1 - HORIZON);
        const area = width * height;
        const cap = software ? 14_000 : small || lowPower ? 42_000 : 140_000;
        const count = Math.round(Math.min(cap, Math.max(12_000, area * 0.32)));
        const { positions, colors } = generateDunes(
          { camH: CAM_H, tanHalf: Math.tan(THREE.MathUtils.degToRad(FOV / 2)), aspect: width / virtualH },
          count,
        );
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        if (points) scene.remove(points);
        geometry?.dispose();
        geometry = geo;
        points = new THREE.Points(geo, material);
        points.frustumCulled = false;
        scene.add(points);
      };

      // Lens-shift the camera so the horizon sits near the top of the band.
      const resize = () => {
        width = container.clientWidth;
        height = container.clientHeight;
        if (!width || !height) return false;
        renderer.setSize(width, height, false);
        const virtualH = 2 * height * (1 - HORIZON);
        camera.aspect = width / virtualH;
        camera.setViewOffset(width, virtualH, 0, height * (1 - 2 * HORIZON), width, height);
        camera.updateProjectionMatrix();
        material.uniforms.uScale.value = (virtualH * renderer.getPixelRatio()) / 2;
        return true;
      };

      let time = 0;
      let last = performance.now();
      let running = false;
      let visible = !document.hidden;
      let onScreen = true;
      let shown = false;
      // Generating the sand is CPU work: wait until the hero's entrance has played.
      let started = false;

      const frame = () => {
        const now = performance.now();
        if (software && running && now - last < 45) return; // ~20 fps is plenty there
        time += Math.min(0.05, (now - last) / 1000);
        last = now;
        material.uniforms.uTime.value = time;
        renderer.render(scene, camera);
        if (!shown) {
          shown = true;
          canvas.style.opacity = "1";
          setLive(true);
        }
      };

      const update = () => {
        const want = started && !reduceMotion && visible && onScreen && !disposed;
        if (want && !running) {
          last = performance.now();
          renderer.setAnimationLoop(frame);
          running = true;
        } else if (!want && running) {
          renderer.setAnimationLoop(null);
          running = false;
        }
      };

      let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
      const ro = new ResizeObserver(() => {
        if (!resize() || !started) return;
        const changed = !built || Math.abs(built.w - width) / built.w > 0.12 || Math.abs(built.h - height) / built.h > 0.12;
        clearTimeout(rebuildTimer);
        if (changed) {
          rebuildTimer = setTimeout(() => {
            build();
            if (!running) frame();
          }, built ? 200 : 0);
        } else if (!running) frame();
      });
      ro.observe(container);

      const io = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        update();
      });
      io.observe(container);

      const onVisibility = () => {
        visible = !document.hidden;
        update();
      };
      document.addEventListener("visibilitychange", onVisibility);

      const onLost = (event: Event) => {
        event.preventDefault();
        renderer.setAnimationLoop(null);
        running = false;
        canvas.style.opacity = "0";
        setLive(false);
      };
      canvas.addEventListener("webglcontextlost", onLost);

      const start = () => {
        if (disposed) return;
        started = true;
        if (resize()) build();
        frame();
        update();
      };
      let idle: number | undefined;
      const startTimer = setTimeout(() => {
        if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(start, { timeout: 1200 });
        else start();
      }, 650);

      teardown = () => {
        clearTimeout(startTimer);
        if (idle !== undefined) window.cancelIdleCallback(idle);
        clearTimeout(rebuildTimer);
        ro.disconnect();
        io.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        canvas.removeEventListener("webglcontextlost", onLost);
        renderer.setAnimationLoop(null);
        geometry?.dispose();
        material.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      };
    })();

    return () => {
      disposed = true;
      teardown();
      setLive(false);
    };
  }, []);

  return (
    <div ref={containerRef} aria-hidden className={`pointer-events-none overflow-hidden ${className}`}>
      <DunesFallback className={`transition-opacity duration-700 ${live ? "opacity-0" : "opacity-100"}`} />
    </div>
  );
}

/** Static dotted dunes: shown before WebGL is up, and instead of it when there's none. */
function DunesFallback({ className = "" }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const dots = `${id}-dots`;
  const fine = `${id}-fine`;
  const fade = `${id}-fade`;
  return (
    <svg
      viewBox="0 0 1200 300"
      preserveAspectRatio="xMidYMax slice"
      className={`absolute inset-0 h-full w-full ${className}`}
    >
      <defs>
        <pattern id={fine} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.9" fill="#E8A317" />
        </pattern>
        <pattern id={dots} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
          <circle cx="2" cy="2" r="1.4" fill="#FFCB05" />
        </pattern>
        <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.1" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.75" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id={`${id}-mask`}>
          <rect width="1200" height="300" fill={`url(#${fade})`} />
        </mask>
      </defs>
      <g mask={`url(#${id}-mask)`}>
        <path
          d="M0 70C140 52 260 86 400 74S660 40 820 58 1080 84 1200 66V300H0Z"
          fill={`url(#${fine})`}
          opacity="0.45"
        />
        <path
          d="M0 132C170 104 300 150 470 136S760 92 930 116 1120 150 1200 134V300H0Z"
          fill={`url(#${fine})`}
          opacity="0.7"
        />
        <path d="M0 200C190 170 340 222 540 204S860 160 1020 184 1160 214 1200 204V300H0Z" fill={`url(#${dots})`} />
      </g>
    </svg>
  );
}
