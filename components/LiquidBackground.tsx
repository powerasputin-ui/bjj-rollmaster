import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Full-screen animated "liquid" gradient — a domain-warped plasma pattern
// (layered sine warps feeding a colour blend) rather than a ray-marched
// scene, so colour and coverage are predictable and tunable: every pixel
// gets a colour, continuously cycling through the app's indigo/purple/blue
// accents instead of leaving most of the frame black.
const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform float u_time;
  uniform vec2 u_resolution;
  varying vec2 vUv;

  // Blend strictly within the app's own accent colours (indigo/purple/blue,
  // over a dark-slate base) instead of a full hue-cycling palette — keeps
  // the liquid look on-brand rather than a rainbow effect.
  void main() {
    vec2 uv = (vUv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
    vec2 p = uv;
    float t = u_time * 0.15;

    for (float i = 1.0; i < 5.0; i++) {
      p.x += 0.5 / i * sin(i * 2.0 * p.y + t * 1.2) + 0.2;
      p.y += 0.5 / i * cos(i * 2.0 * p.x + t);
    }

    float m1 = sin(p.x * 1.6 + p.y * 1.6) * 0.5 + 0.5;
    float m2 = sin(p.x * 1.1 - p.y * 1.3 + t * 2.0) * 0.5 + 0.5;

    vec3 dark   = vec3(0.06, 0.09, 0.16);
    vec3 indigo = vec3(0.31, 0.27, 0.90);
    vec3 purple = vec3(0.66, 0.33, 0.97);
    vec3 blue   = vec3(0.23, 0.51, 0.96);

    vec3 hue = mix(indigo, purple, m1);
    hue = mix(hue, blue, m2 * 0.5);
    vec3 col = mix(dark, hue, 0.35 + 0.45 * m1);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Full-screen animated WebGL background for the auth screen. Falls back to
// silently doing nothing (leaving the plain gradient visible) if WebGL is
// unavailable, rather than throwing.
const LiquidBackground: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clock = new THREE.Clock();

    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(1, 1) },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER, uniforms });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      uniforms.u_resolution.value.set(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    renderer.setAnimationLoop(() => {
      uniforms.u_time.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    });

    return () => {
      window.removeEventListener('resize', resize);
      renderer.setAnimationLoop(null);
      container.removeChild(renderer.domElement);
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 overflow-hidden" style={{ zIndex: 0 }} aria-hidden="true" />;
};

export default LiquidBackground;
