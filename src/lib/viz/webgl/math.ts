/**
 * BEYU OS — minimal column-major matrix/vector math for the dependency-free
 * WebGL renderer (shared capability).
 *
 * Deliberately tiny: perspective, look-at, translation, scaling and
 * multiplication are all the Holograph box renderer needs. Column-major
 * layout matches the WebGL `uniformMatrix4fv` convention. Every exported
 * function is pure and finite-safe; inputs containing non-finite values are
 * guarded at the renderer boundary (never silently propagated as NaN GPU
 * state).
 */

export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** out = a * b (column-major, gl-multiply convention). */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function mat4Translation(x: number, y: number, z: number): Mat4 {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function mat4Scaling(x: number, y: number, z: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = x;
  m[5] = y;
  m[10] = z;
  m[15] = 1;
  return m;
}

export function mat4Perspective(fovyRad: number, aspect: number, near: number, far: number): Mat4 {
  const m = new Float32Array(16);
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  m[0] = f / (aspect || 1);
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function mat4LookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const [ex, ey, ez] = eye;
  let zx = ex - center[0];
  let zy = ey - center[1];
  let zz = ez - center[2];
  let len = Math.hypot(zx, zy, zz);
  if (len < 1e-9) {
    // Degenerate eye==center: fall back to a unit backward axis so the matrix
    // stays finite (the renderer clamps distance before this can happen, but
    // NaN must never reach the GPU).
    zx = 0;
    zy = 0;
    zz = 1;
    len = 1;
  }
  zx /= len;
  zy /= len;
  zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz);
  if (len < 1e-9) {
    xx = 1;
    xy = 0;
    xz = 0;
  } else {
    xx /= len;
    xy /= len;
    xz /= len;
  }

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const m = new Float32Array(16);
  m[0] = xx;
  m[1] = yx;
  m[2] = zx;
  m[3] = 0;
  m[4] = xy;
  m[5] = yy;
  m[6] = zy;
  m[7] = 0;
  m[8] = xz;
  m[9] = yz;
  m[10] = zz;
  m[11] = 0;
  m[12] = -(xx * ex + xy * ey + xz * ez);
  m[13] = -(yx * ex + yy * ey + yz * ez);
  m[14] = -(zx * ex + zy * ey + zz * ez);
  m[15] = 1;
  return m;
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vec3Scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function vec3Length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function isFiniteVec3(a: Vec3): boolean {
  return Number.isFinite(a[0]) && Number.isFinite(a[1]) && Number.isFinite(a[2]);
}

/** Clamp helper shared by camera controls (pure, finite-safe). */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/* ─────────────────────────── orbit camera (pure) ─────────────────────────── */

export type OrbitCamera = {
  target: Vec3;
  /** Yaw around +Y, radians. */
  yaw: number;
  /** Pitch, radians (clamped). */
  pitch: number;
  /** Distance from target (clamped to [minDistance, maxDistance]). */
  distance: number;
  minDistance: number;
  maxDistance: number;
  /** Hard pitch clamp (~±80°) so the camera never flips under the ground. */
  maxPitch: number;
};

export function createOrbitCamera(opts: {
  target: Vec3;
  radius: number;
}): OrbitCamera {
  const radius = Number.isFinite(opts.radius) && opts.radius > 1e-6 ? opts.radius : 1;
  const target: Vec3 = isFiniteVec3(opts.target) ? [opts.target[0], opts.target[1], opts.target[2]] : [0, 0, 0];
  return {
    target,
    yaw: Math.PI / 4,
    pitch: Math.PI / 6,
    distance: radius * 2.6,
    minDistance: Math.max(radius * 0.35, 0.05),
    maxDistance: radius * 8,
    maxPitch: 1.4,
  };
}

/** Eye position derived from the orbit parameters (finite by construction). */
export function orbitEye(cam: OrbitCamera): Vec3 {
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  return [
    cam.target[0] + cam.distance * cp * sy,
    cam.target[1] + cam.distance * sp,
    cam.target[2] + cam.distance * cp * cy,
  ];
}

export function orbitBy(cam: OrbitCamera, dYaw: number, dPitch: number): OrbitCamera {
  const yaw = Number.isFinite(dYaw) ? cam.yaw + dYaw : cam.yaw;
  const pitch = clamp(Number.isFinite(dPitch) ? cam.pitch + dPitch : cam.pitch, -cam.maxPitch, cam.maxPitch);
  return { ...cam, yaw, pitch };
}

/** factor < 1 → zoom in; factor > 1 → zoom out. Clamped, never zero/NaN. */
export function zoomBy(cam: OrbitCamera, factor: number): OrbitCamera {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return { ...cam, distance: clamp(cam.distance * f, cam.minDistance, cam.maxDistance) };
}

export function panBy(cam: OrbitCamera, dx: number, dy: number): OrbitCamera {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return cam;
  // Pan in the camera's screen plane so dragging feels direct on touch.
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  // Camera right vector (perpendicular to view direction on the XZ plane).
  const rightX = cy;
  const rightZ = -sy;
  // Camera up vector (approximate, pitch-aware).
  const upX = -sp * sy;
  const upY = cp;
  const upZ = -sp * cy;
  const scale = cam.distance * 0.0025;
  const target: Vec3 = [
    cam.target[0] + (rightX * -dx + upX * dy) * scale,
    cam.target[1] + (upY * dy) * scale,
    cam.target[2] + (rightZ * -dx + upZ * dy) * scale,
  ];
  return { ...cam, target: isFiniteVec3(target) ? target : cam.target };
}
