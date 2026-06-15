const colliders = [];

export function addCircleCollider(x, z, radius) {
  colliders.push({ type: 'circle', x, z, radius });
}

export function addBoxCollider(xMin, xMax, zMin, zMax) {
  colliders.push({ type: 'box', xMin, xMax, zMin, zMax });
}

export function clearColliders() {
  colliders.length = 0;
}

export function resolveCollisions(position, radius) {
  for (const c of colliders) {
    if (c.type === 'circle') {
      // Circle-Circle collision
      const dx = position.x - c.x;
      const dz = position.z - c.z;
      const minDist = radius + c.radius;
      if (Math.abs(dx) < minDist && Math.abs(dz) < minDist) {
        const distSq = dx * dx + dz * dz;
        const minDistSq = minDist * minDist;
        if (distSq < minDistSq) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          const nx = dist > 0.001 ? dx / dist : 1;
          const nz = dist > 0.001 ? dz / dist : 0;
          position.x += nx * overlap;
          position.z += nz * overlap;
        }
      }
    } else if (c.type === 'box') {
      // Circle-AABB collision (closest point projection)
      const closestX = Math.max(c.xMin, Math.min(position.x, c.xMax));
      const closestZ = Math.max(c.zMin, Math.min(position.z, c.zMax));

      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distSq = dx * dx + dz * dz;
      const radiusSq = radius * radius;

      if (distSq < radiusSq) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        if (dist > 0.001) {
          position.x += (dx / dist) * overlap;
          position.z += (dz / dist) * overlap;
        } else {
          // If center is exactly inside the box, push out to the nearest edge
          const left = position.x - c.xMin;
          const right = c.xMax - position.x;
          const top = position.z - c.zMin;
          const bottom = c.zMax - position.z;
          const min = Math.min(left, right, top, bottom);

          if (min === left) {
            position.x -= radius;
          } else if (min === right) {
            position.x += radius;
          } else if (min === top) {
            position.z -= radius;
          } else {
            position.z += radius;
          }
        }
      }
    }
  }
}
