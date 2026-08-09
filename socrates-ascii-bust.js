/**
 * Socrates project card: realistic photo-based 3D head → live ASCII.
 *
 * - Head mesh is built from the classical Socrates portrait (displacement + albedo)
 * - Only the head rotates around the neck to look toward the cursor
 * - Shoulders / torso stay fixed
 * - Proper look-at so the face (eyes) aim at the pointer, not a whole-body spin
 */
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const CHARS = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
const COLS = 56;
const ROWS = 42;
const GL_W = COLS * 5;
const GL_H = ROWS * 7;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function imageToCanvas(img, maxW = 512) {
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas: c, ctx, w, h, data: ctx.getImageData(0, 0, w, h).data };
}

function sampleLum(data, w, h, u, v) {
  const x = Math.min(w - 1, Math.max(0, Math.floor(u * (w - 1))));
  const y = Math.min(h - 1, Math.max(0, Math.floor(v * (h - 1))));
  const i = (y * w + x) * 4;
  return (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
}

/**
 * Build a sculpted frontal bust head from the Socrates photo:
 * high-res grid, luminance displacement, slight cylindrical wrap for side turn.
 * Looks like the 2D image head-on; holds up under limited head rotation.
 */
function makePhotoHead(photo) {
  const { data, w, h } = imageToCanvas(photo, 640);
  // Focus crop on head region of classical bust photos (upper ~62%)
  const u0 = 0.12,
    u1 = 0.88,
    v0 = 0.02,
    v1 = 0.62;

  const segX = 140;
  const segY = 160;
  const geo = new THREE.PlaneGeometry(1.55, 1.9, segX, segY);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const pu = u0 + u * (u1 - u0);
    const pv = v0 + (1 - v) * (v1 - v0); // flip v for image space
    const lum = sampleLum(data, w, h, pu, pv);

    // Depth: bright marble sticks out less; dark recesses go in — invert for bust relief
    // Classical photos: face is mid-tone; we want features raised
    const depth = (0.55 - lum) * 0.42;

    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = depth;

    // Soft cylindrical wrap so turning the head still reads as volume
    const angle = x * 0.85;
    const r = 0.95 + z;
    x = Math.sin(angle) * r;
    z = Math.cos(angle) * r - 0.95;

    // Fade edges (hairline / cheeks) to avoid hard rectangle
    const edge = Math.min(u * 4, (1 - u) * 4, v * 3, (1 - v) * 2.2, 1);
    const fade = Math.max(0, Math.min(1, edge));
    x *= 0.35 + 0.65 * fade;
    y = y * (0.4 + 0.6 * fade) + (1 - fade) * y * 0.2;
    z *= fade;

    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const tex = new THREE.CanvasTexture(imageToCanvas(photo, 1024).canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Map only the head crop onto the plane UVs
  tex.offset.set(u0, 1 - v1);
  tex.repeat.set(u1 - u0, v1 - v0);

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.55,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  // Center head so neck sits near origin of pivot
  mesh.position.set(0, 0.15, 0);
  return mesh;
}

/** Static shoulders / robe — does not rotate with the head. */
function makeShoulders(photo) {
  const group = new THREE.Group();
  const { canvas } = imageToCanvas(photo, 768);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Lower portion of classical bust photo
  tex.offset.set(0.08, 0.0);
  tex.repeat.set(0.84, 0.38);

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.7,
    metalness: 0.02,
  });
  const stone = new THREE.MeshStandardMaterial({
    color: 0xb8b2a8,
    roughness: 0.75,
    metalness: 0.02,
    flatShading: true,
  });

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), mat);
  chest.scale.set(1.35, 0.62, 0.75);
  chest.position.set(0, -1.05, 0.05);
  group.add(chest);

  const robe = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 0.55), mat);
  robe.position.set(0, -1.35, 0.2);
  group.add(robe);

  // Neck stump (fixed) — head rotates just above this
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.28, 16), stone);
  neck.position.set(0, -0.42, 0.05);
  group.add(neck);

  return group;
}

function canvasToAscii(ctx, w, h, cols, rows) {
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const lines = [];
  for (let row = 0; row < rows; row++) {
    let line = "";
    const sy = Math.min(h - 1, Math.floor((row / rows) * h));
    for (let col = 0; col < cols; col++) {
      const sx = Math.min(w - 1, Math.floor((col / cols) * w));
      const i = (sy * w + sx) * 4;
      const a = data[i + 3];
      let lum =
        (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      if (a < 16) lum = 0;
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

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

async function init() {
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
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "low-power",
    });
  } catch (e) {
    host.classList.add("is-fallback");
    return;
  }

  renderer.setSize(GL_W, GL_H, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, GL_W / GL_H, 0.1, 40);
  camera.position.set(0, -0.15, 4.6);

  // Studio lighting for marble / photo readability in ASCII
  const key = new THREE.DirectionalLight(0xfff5ea, 1.25);
  key.position.set(2.4, 2.2, 3.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xa8b8d0, 0.4);
  fill.position.set(-2.8, 0.4, 2.0);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe8d0, 0.45);
  rim.position.set(0.2, 1.8, -2.8);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x909090, 0.4));

  let photo;
  try {
    photo = await loadImage("/models/socrates-photo.jpg");
  } catch (e) {
    try {
      photo = await loadImage("/socrates-ascii.png");
    } catch (e2) {
      host.classList.add("is-fallback");
      return;
    }
  }

  // --- Hierarchy: shoulders fixed; head pivots at neck ---
  const root = new THREE.Group();
  scene.add(root);

  const shoulders = makeShoulders(photo);
  root.add(shoulders);

  // Neck pivot: ONLY this rotates (head yaw/pitch). Origin ≈ base of skull.
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, -0.28, 0.08);
  root.add(neckPivot);

  const photoHead = makePhotoHead(photo);
  // Position relative to neck pivot so face sits above shoulders
  photoHead.position.set(0, 0.55, 0.15);
  neckPivot.add(photoHead);

  // Smooth head pose (yaw / pitch only — no roll, no shoulder motion)
  const targetQuat = new THREE.Quaternion();
  const currentQuat = new THREE.Quaternion();
  // Max head turn (radians) — neck stays planted; shoulders never move
  const MAX_YAW = 0.62;
  const MAX_PITCH = 0.38;

  function setLookFromPointer(clientX, clientY) {
    // Viewport-normalized pointer: left=-1 … right=+1, bottom=-1 … top=+1
    const nx = (clientX / window.innerWidth) * 2 - 1;
    const ny = -((clientY / window.innerHeight) * 2 - 1);

    // Head faces +Z (toward camera). Positive yaw turns face toward +X (screen right).
    // When the cursor is on the right (nx>0), the head yaws positive so the face aims there.
    // Pitch: cursor up (ny>0) → head tilts up (negative euler.x in YXZ for our facing).
    const yaw = clamp(nx * 0.7, -MAX_YAW, MAX_YAW);
    const pitch = clamp(-ny * 0.45, -MAX_PITCH, MAX_PITCH);

    targetQuat.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  }

  // Rest pose: face the camera
  targetQuat.identity();
  currentQuat.identity();
  neckPivot.quaternion.identity();

  function onMouseMove(e) {
    setLookFromPointer(e.clientX, e.clientY);
  }
  function onTouchMove(e) {
    if (!e.touches || !e.touches[0]) return;
    setLookFromPointer(e.touches[0].clientX, e.touches[0].clientY);
  }
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });

  const readCanvas = document.createElement("canvas");
  readCanvas.width = GL_W;
  readCanvas.height = GL_H;
  const readCtx = readCanvas.getContext("2d", { willReadFrequently: true });

  let running = false;
  let raf = 0;

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    // Smooth head-only rotation (shoulders untouched)
    currentQuat.slerp(targetQuat, 0.1);
    neckPivot.quaternion.copy(currentQuat);

    // Tiny idle breath on head only
    const t = performance.now() * 0.001;
    photoHead.position.y = 0.55 + Math.sin(t * 1.15) * 0.008;

    renderer.render(scene, camera);
    readCtx.clearRect(0, 0, GL_W, GL_H);
    readCtx.drawImage(renderer.domElement, 0, 0);
    pre.textContent = canvasToAscii(readCtx, GL_W, GL_H, COLS, ROWS);
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

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) start();
          else stop();
        });
      },
      { threshold: 0.12 }
    );
    io.observe(host);
  } else {
    start();
  }

  // First paint
  renderer.render(scene, camera);
  readCtx.drawImage(renderer.domElement, 0, 0);
  pre.textContent = canvasToAscii(readCtx, GL_W, GL_H, COLS, ROWS);
  // Nudge look toward center of card once
  const rect = host.getBoundingClientRect();
  setLookFromPointer(rect.left + rect.width / 2, rect.top + rect.height * 0.4);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
