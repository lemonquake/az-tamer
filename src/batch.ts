// ============================================================
// AZ Tamer — static geometry batching for the big open maps.
//
// Forward rendering pays a per-DRAW-CALL cost (state setup, a JS frustum
// test, a matrix upload) for every Mesh. The cities build hundreds of small
// static props as individual meshes, so the draw-call count — not the
// triangle count — is what drags the framerate down on weak GPUs.
//
// mergeStaticScene() welds together the static, opaque, ANONYMOUS decor that
// shares a look into one mesh per material → one draw call for what used to be
// dozens. It is deliberately conservative so a change we can't eyeball can't
// break the game:
//   • Only leaf meshes whose whole ancestor chain is unnamed and carries no
//     userData are eligible. Every animated/queried object in this codebase is
//     named (voxel-human bones: 'pelvis','head','armL'… day/night fixtures:
//     'streetlamp','lampOrb','nightwindow') or stamped with userData, so all of
//     them are skipped automatically.
//   • Transparent / additively-blended meshes are skipped (keeps draw order).
//   • Lights, sprites, skinned and instanced meshes are skipped.
//   • Interaction in the cities is proximity-based (distance to a position),
//     never a raycast against these meshes, so removing the originals is safe.
//   • Kill switch: localStorage 'batch' = 'off' disables the whole pass.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const NormalBlending = 1; // THREE.NormalBlending
const MIN_TO_MERGE = 40;  // below this a scene isn't worth it (or isn't built yet)

const done = new WeakSet<object>();

interface AnyMesh extends THREE.Mesh {
  isInstancedMesh?: boolean;
  isSkinnedMesh?: boolean;
}

function mergeable(o: THREE.Object3D): boolean {
  const m = o as AnyMesh;
  if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh) return false;
  if (m.children.length) return false;          // leaf meshes only (a parent mesh may host a light/anim child)
  if (m.name) return false;                     // named ⇒ something animates or queries it
  if (m.userData && Object.keys(m.userData).length) return false;
  const mat = m.material as THREE.Material | THREE.Material[];
  if (!mat || Array.isArray(mat)) return false; // multi-material (e.g. the voxel face cube) ⇒ skip
  const std = mat as THREE.MeshStandardMaterial;
  if (std.transparent) return false;
  if (std.blending !== undefined && std.blending !== NormalBlending) return false;
  const g = m.geometry as THREE.BufferGeometry;
  if (!g || !g.isBufferGeometry || !g.attributes.position) return false;
  return true;
}

/** True only if every ancestor up to (not including) the scene is an unnamed, userData-free node. */
function anonChain(o: THREE.Object3D, scene: THREE.Object3D): boolean {
  let p = o.parent;
  while (p && p !== scene) {
    if (p.name) return false;
    if (p.userData && Object.keys(p.userData).length) return false;
    p = p.parent;
  }
  return true;
}

/** Everything that distinguishes how a mesh looks — meshes that match can share one material and merge. */
function signature(m: THREE.Mesh): string {
  const mat = m.material as THREE.MeshStandardMaterial;
  const attrs = Object.keys((m.geometry as THREE.BufferGeometry).attributes).sort().join(',');
  return [
    mat.type,
    mat.color ? mat.color.getHexString() : '',
    mat.emissive ? mat.emissive.getHexString() : '',
    mat.emissiveIntensity ?? '',
    mat.roughness ?? '', mat.metalness ?? '',
    mat.map ? mat.map.uuid : '',
    mat.opacity ?? 1, mat.side ?? 0,
    mat.vertexColors ? 1 : 0, mat.flatShading ? 1 : 0,
    (m.geometry as THREE.BufferGeometry).index ? 'i' : 'n',
    attrs,
  ].join('|');
}

/**
 * Weld static anonymous decor in `scene` into one mesh per look. Runs at most
 * once per scene; returns the number of source meshes collapsed (0 if disabled,
 * already done, or the scene isn't built up enough yet — in which case it stays
 * un-done and is retried on a later frame).
 */
export function mergeStaticScene(scene: THREE.Object3D | null | undefined): number {
  if (!scene || done.has(scene)) return 0;
  try { if (localStorage.getItem('batch') === 'off') { done.add(scene); return 0; } } catch { /* ignore */ }

  scene.updateMatrixWorld(true);
  const cand: THREE.Mesh[] = [];
  scene.traverse(o => { if (mergeable(o) && anonChain(o, scene)) cand.push(o as THREE.Mesh); });
  if (cand.length < MIN_TO_MERGE) return 0; // not built yet, or too small to bother — retry later

  // geometries kept by meshes we are NOT merging must never be disposed.
  const candSet = new Set<THREE.Mesh>(cand);
  const survive = new Set<string>();
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry && !candSet.has(m)) survive.add((m.geometry as THREE.BufferGeometry).uuid);
  });

  const groups = new Map<string, THREE.Mesh[]>();
  for (const m of cand) {
    const k = signature(m);
    const g = groups.get(k);
    if (g) g.push(m); else groups.set(k, [m]);
  }

  let mergedMeshes = 0, mergedDraws = 0;
  const disposed = new Set<string>();
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue; // a lone mesh is already one draw call
    const geos = meshes.map(m => {
      const g = (m.geometry as THREE.BufferGeometry).clone();
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    let merged: THREE.BufferGeometry | null = null;
    try { merged = mergeGeometries(geos, false); } catch { merged = null; }
    geos.forEach(g => g.dispose());
    if (!merged) continue; // incompatible attribute layout — leave these meshes as-is

    const out = new THREE.Mesh(merged, meshes[0].material as THREE.Material);
    out.castShadow = meshes.some(m => m.castShadow);
    out.receiveShadow = meshes.some(m => m.receiveShadow);
    out.frustumCulled = false; // spans the whole map; the cull test would never pass anyway
    out.name = '__merged';
    out.userData.dynamic = true; // never re-merge or animate the merged mesh
    scene.add(out);

    for (const m of meshes) {
      m.removeFromParent();
      const g = m.geometry as THREE.BufferGeometry;
      if (g && !survive.has(g.uuid) && !disposed.has(g.uuid)) { disposed.add(g.uuid); g.dispose(); }
    }
    mergedMeshes += meshes.length;
    mergedDraws++;
  }

  done.add(scene);
  if (mergedMeshes > 0) {
    console.info(`[batch] merged ${mergedMeshes} static meshes → ${mergedDraws} draw calls (saved ~${mergedMeshes - mergedDraws})`);
  }
  return mergedMeshes;
}
