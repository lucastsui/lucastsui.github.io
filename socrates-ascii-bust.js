/**
 * Interactive 3D Socrates bust → live ASCII art that tracks the cursor.
 * Pipeline: procedural mesh → offscreen WebGL → luminance → monospace chars.
 */
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const CHARS = " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
const COLS = 52;
const ROWS = 40;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSocratesBust() {
  const group = new THREE.Group();
  const rnd = mulberry32(42);

  const stone = new THREE.MeshStandardMaterial({
    color: 0xd8d4cc,
    roughness: 0.72,
    metalness: 0.05,
    flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1a1a1c,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
  const mid = new THREE.MeshStandardMaterial({
    color: 0x9a9590,
    roughness: 0.8,
    metalness: 0.02,
    flatShading: true,
  });

  // Cranium
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 22), stone);
  head.scale.set(0.92, 1.08, 0.88);
  head.position.y = 0.15;
  group.add(head);

  // Brow ridge
  const brow = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.18, 0.45), mid);
  brow.position.set(0, 0.35, 0.62);
  brow.rotation.x = -0.15;
  group.add(brow);

  // Nose (broad / characteristic)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 8), stone);
  nose.rotation.x = Math.PI;
  nose.position.set(0, 0.05, 0.88);
  nose.scale.set(1.3, 1, 0.7);
  group.add(nose);
  const noseBridge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.2), stone);
  noseBridge.position.set(0, 0.22, 0.82);
  group.add(noseBridge);

  // Eye sockets + dark eyes
  [-0.28, 0.28].forEach((x) => {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mid);
    socket.scale.set(1.1, 0.85, 0.55);
    socket.position.set(x, 0.22, 0.72);
    group.add(socket);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), dark);
    eye.position.set(x, 0.22, 0.82);
    group.add(eye);
  });

  // Cheeks / jaw mass
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), stone);
  jaw.scale.set(1.15, 0.7, 0.85);
  jaw.position.set(0, -0.35, 0.2);
  group.add(jaw);

  // Mouth recess
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.12), mid);
  mouth.position.set(0, -0.22, 0.78);
  group.add(mouth);

  // Curly beard clusters
  for (let i = 0; i < 90; i++) {
    const u = rnd() * Math.PI - Math.PI / 2; // lower front hemisphere-ish
    const v = rnd() * Math.PI * 0.9 - Math.PI * 0.45;
    const r = 0.55 + rnd() * 0.55;
    const x = Math.sin(v) * Math.cos(u) * r * 0.95;
    const y = -0.15 + Math.sin(u) * r * 0.75 - 0.35;
    const z = Math.cos(v) * Math.cos(u) * r * 0.7 + 0.35;
    if (y > 0.15) continue;
    if (z < -0.1) continue;
    const s = 0.08 + rnd() * 0.14;
    const curl = new THREE.Mesh(
      new THREE.SphereGeometry(s, 6, 5),
      rnd() > 0.35 ? mid : stone
    );
    curl.position.set(x, y, z);
    group.add(curl);
  }

  // Receding curly hair around sides / back / crown rim
  for (let i = 0; i < 70; i++) {
    const theta = rnd() * Math.PI * 2;
    const phi = rnd() * 0.9;
    const r = 0.95 + rnd() * 0.2;
    const x = Math.sin(phi) * Math.cos(theta) * r;
    const y = 0.35 + Math.cos(phi) * r * 0.55;
    const z = Math.sin(phi) * Math.sin(theta) * r * 0.85 - 0.05;
    if (y < 0.2 && Math.abs(x) < 0.4) continue; // bald forehead center
    const s = 0.07 + rnd() * 0.12;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), mid);
    hair.position.set(x, y, z);
    group.add(hair);
  }

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.55, 12), stone);
  neck.position.y = -0.95;
  group.add(neck);

  // Shoulders / upper torso
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 12), stone);
  torso.scale.set(1.35, 0.55, 0.7);
  torso.position.set(0, -1.45, 0);
  group.add(torso);

  // Robe-ish front fold
  const robe = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.35), mid);
  robe.position.set(0, -1.55, 0.35);
  group.add(robe);

  group.position.y = 0.35;
  return group;
}

function canvasToAscii(ctx, w, h, cols, rows) {
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const lines = [];
  for (let row = 0; row < rows; row++) {
    let line = "";
    const sy = Math.floor((row / rows) * h);
    for (let col = 0; col < cols; col++) {
      const sx = Math.floor((col / cols) * w);
      const i = (sy * w + sx) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      // luminance; transparent / near-bg → space
      let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (a < 20) lum = 0;
      // invert so lit form is denser on light-ish bg samples
      // WebGL clear is dark; bright stone → high lum → dense char
      const idx = Math.min(
        CHARS.length - 1,
        Math.max(0, Math.floor(lum * (CHARS.length - 1)))
      );
      line += CHARS[idx];
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function init() {
  const host = document.getElementById("socratesAsciiBust");
  const pre = document.getElementById("socratesAsciiPre");
  if (!host || !pre) return;

  const reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    host.classList.add("is-fallback");
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "low-power",
    });
  } catch (e) {
    host.classList.add("is-fallback");
    return;
  }

  const glW = COLS * 4;
  const glH = ROWS * 6;
  renderer.setSize(glW, glH, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, glW / glH, 0.1, 50);
  camera.position.set(0, 0.05, 4.2);

  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(2.2, 2.5, 3.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb0c4de, 0.45);
  fill.position.set(-2.5, 0.5, 1.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe4c4, 0.35);
  rim.position.set(0, 1.5, -2.5);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x888888, 0.35));

  const bust = makeSocratesBust();
  scene.add(bust);

  // Hidden canvas for readback
  const readCanvas = document.createElement("canvas");
  readCanvas.width = glW;
  readCanvas.height = glH;
  const readCtx = readCanvas.getContext("2d", { willReadFrequently: true });

  let targetYaw = 0;
  let targetPitch = 0;
  let yaw = 0;
  let pitch = 0;
  let running = false;
  let raf = 0;

  function onPointer(clientX, clientY) {
    const rect = host.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((clientY - rect.top) / rect.height) * 2 - 1;
    // Head turns toward cursor (limited range so it stays “Socratic”, not spinning)
    targetYaw = THREE.MathUtils.clamp(nx * 0.55, -0.65, 0.65);
    targetPitch = THREE.MathUtils.clamp(-ny * 0.35, -0.4, 0.35);
  }

  function onMouseMove(e) {
    onPointer(e.clientX, e.clientY);
  }
  // Track globally so it follows cursor even when not hovering the small card
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener(
    "touchmove",
    function (e) {
      if (!e.touches || !e.touches[0]) return;
      onPointer(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true }
  );

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    yaw += (targetYaw - yaw) * 0.08;
    pitch += (targetPitch - pitch) * 0.08;
    bust.rotation.y = yaw;
    bust.rotation.x = pitch;
    // subtle idle breath when nearly still
    const t = performance.now() * 0.001;
    bust.position.y = 0.35 + Math.sin(t * 1.2) * 0.012;

    renderer.render(scene, camera);
    readCtx.clearRect(0, 0, glW, glH);
    readCtx.drawImage(renderer.domElement, 0, 0);
    pre.textContent = canvasToAscii(readCtx, glW, glH, COLS, ROWS);
  }

  function start() {
    if (running) return;
    running = true;
    frame();
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
  }

  // Only animate when in view
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) start();
          else stop();
        });
      },
      { threshold: 0.15 }
    );
    io.observe(host);
  } else {
    start();
  }

  // Initial render
  renderer.render(scene, camera);
  readCtx.drawImage(renderer.domElement, 0, 0);
  pre.textContent = canvasToAscii(readCtx, glW, glH, COLS, ROWS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
