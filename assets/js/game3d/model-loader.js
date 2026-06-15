import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();

export function loadGLTF(url) {
  if (cache.has(url)) {
    return Promise.resolve(cache.get(url));
  }
  return new Promise(resolve => {
    loader.load(
      url,
      gltf => {
        cache.set(url, gltf);
        resolve(gltf);
      },
      undefined,
      err => {
        console.warn(`[model-loader] Could not load ${url}:`, err.message || err);
        resolve(null);
      }
    );
  });
}

export function cloneModel(gltf) {
  if (!gltf) {
    return null;
  }
  return SkeletonUtils.clone(gltf.scene);
}

export function findClip(clips, ...names) {
  for (const name of names) {
    const c = THREE.AnimationClip.findByName(clips, name);
    if (c) {
      return c;
    }
  }
  return clips[0] || null;
}
