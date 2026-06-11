// ============================================================
// AZ Tamer — shared 3D model snapshots
// Renders any Guardian species once with a pooled offscreen
// renderer and caches the result as a 2D canvas. Used by the
// Evolution Tree thumbnails and Guardian Card artwork.
// ============================================================
import * as THREE from 'three';
import { SPECIES, TYPE_COLORS } from './data';
import { makeGuardian, disposeRig } from './models';

let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, HTMLCanvasElement>();

function getRenderer(size: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
  }
  renderer.setSize(size, size);
  return renderer;
}

/** Render a species model to a square transparent canvas (cached). */
export function speciesSnapshot(speciesId: string, size = 256): HTMLCanvasElement {
  const key = `${speciesId}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const sp = SPECIES[speciesId];
  const r = getRenderer(size);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const keyLight = new THREE.DirectionalLight(0xfff2dc, 1.6);
  keyLight.position.set(2.5, 4, 3);
  scene.add(keyLight);
  const rim = new THREE.PointLight(sp ? TYPE_COLORS[sp.type] : 0xffffff, 18, 12);
  rim.position.set(-3, 1.5, -2);
  scene.add(rim);

  const rig = makeGuardian(speciesId);
  rig.group.rotation.y = Math.PI * 0.16; // three-quarter pose
  scene.add(rig.group);

  // frame the model from its bounding box
  const box = new THREE.Box3().setFromObject(rig.group);
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist = Math.max(0.8, sphere.radius) * 2.45;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
  camera.position.set(center.x + dist * 0.18, center.y + dist * 0.42, center.z + dist);
  camera.lookAt(center);

  r.render(scene, camera);

  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.drawImage(r.domElement, 0, 0);

  disposeRig(rig);
  cache.set(key, c);
  return c;
}

export const speciesSnapshotURL = (speciesId: string, size = 256): string =>
  speciesSnapshot(speciesId, size).toDataURL();
