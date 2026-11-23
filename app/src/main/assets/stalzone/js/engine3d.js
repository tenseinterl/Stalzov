// STALZONE High-Fidelity WebGL 1.0 Voxel & Heightmap Engine
// Features: Procedural Sky Dome + Cloud Bands, Blinn-Phong Specular + Rim + Vertex AO,
// Height FogExp2, 128x128 Weathered Textures, Wind-Sway Foliage & Batched Terrain
window.Engine3D = (function () {
  const M4 = {
    create() { return new Float32Array(16); },
    identity(out) { out.fill(0); out[0] = out[5] = out[10] = out[15] = 1; return out; },
    perspective(out, fovyRad, aspect, near, far) {
      const f = 1.0 / Math.tan(fovyRad * 0.5);
      const nf = 1 / (near - far);
      out.fill(0);
      out[0] = f / aspect; out[5] = f;
      out[10] = (far + near) * nf; out[11] = -1;
      out[14] = (2 * far * near) * nf;
      return out;
    },
    cameraView(out, px, py, pz, yaw, pitch) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const rx = cy, ry = 0, rz = -sy;
      const ux = sy * sp, uy = cp, uz = cy * sp;
      const bx = sy * cp, by = -sp, bz = cy * cp;
      out[0] = rx; out[4] = ry; out[8] = rz; out[12] = -(rx * px + ry * py + rz * pz);
      out[1] = ux; out[5] = uy; out[9] = uz; out[13] = -(ux * px + uy * py + uz * pz);
      out[2] = bx; out[6] = by; out[10] = bz; out[14] = -(bx * px + by * py + bz * pz);
      out[3] = 0;  out[7] = 0;  out[11] = 0;  out[15] = 1;
      return out;
    },
    trs(out, tx, ty, tz, ry, rx, sx, sy, sz) {
      const cy = Math.cos(ry), siny = Math.sin(ry);
      const cx = Math.cos(rx), sinx = Math.sin(rx);
      out[0] = cy * sx;    out[4] = siny * sinx * sy; out[8]  = siny * cx * sz; out[12] = tx;
      out[1] = 0;          out[5] = cx * sy;          out[9]  = -sinx * sz;     out[13] = ty;
      out[2] = -siny * sx; out[6] = cy * sinx * sy;   out[10] = cy * cx * sz;   out[14] = tz;
      out[3] = 0;          out[7] = 0;                out[11] = 0;              out[15] = 1;
      return out;
    }
  };

  // === SKY DOME SHADER (Twilight Storm Clouds, Horizon Glow & Emission Crimson) ===
  const SKY_VS = `
    attribute vec2 aPos;
    varying vec2 vScreen;
    void main() {
      vScreen = aPos;
      gl_Position = vec4(aPos, 0.999, 1.0);
    }
  `;

  const SKY_FS = `
    precision mediump float;
    varying vec2 vScreen;
    uniform float uYaw;
    uniform float uPitch;
    uniform float uAspect;
    uniform float uTime;
    uniform vec3 uZenith;
    uniform vec3 uHorizon;
    uniform vec3 uCloudCol;
    uniform float uLightning;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.04;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      // Reconstruct view ray direction in world space
      vec3 localDir = normalize(vec3(vScreen.x * uAspect * 0.72, vScreen.y * 0.72, -1.0));
      float cp = cos(uPitch), sp = sin(uPitch);
      vec3 d1 = vec3(localDir.x, localDir.y * cp - localDir.z * sp, localDir.y * sp + localDir.z * cp);
      float cy = cos(uYaw), sy = sin(uYaw);
      vec3 dir = normalize(vec3(d1.x * cy + d1.z * sy, d1.y, -d1.x * sy + d1.z * cy));

      float elev = clamp(dir.y, 0.0, 1.0);
      vec3 col = mix(uHorizon, uZenith, pow(elev, 0.52));

      if (dir.y > -0.04) {
        vec2 uv = dir.xz / (max(dir.y, 0.06) + 0.18) * 1.35;
        float c1 = fbm(uv + vec2(uTime * 0.018, uTime * 0.008));
        float c2 = fbm(uv * 2.1 - vec2(uTime * 0.025, 0.0));
        float cloud = smoothstep(0.38, 0.78, c1 * 0.7 + c2 * 0.35);
        float cloudFade = smoothstep(-0.02, 0.24, dir.y);
        col = mix(col, uCloudCol, cloud * cloudFade * 0.72);

        // Pale eerie twilight glow peeking behind clouds
        vec3 moonDir = normalize(vec3(0.45, 0.28, -0.82));
        float glow = pow(max(dot(dir, moonDir), 0.0), 16.0);
        col += vec3(0.42, 0.48, 0.44) * glow * (1.0 - cloud * 0.65) * 0.55;
      }

      col += vec3(0.75, 0.82, 0.92) * uLightning * 0.55;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // === MAIN PBR-STYLE VOXEL & TERRAIN SHADER ===
  const VS_SRC = `
    attribute vec3 aPos;
    attribute vec3 aNorm;
    attribute vec2 aUV;
    attribute vec3 aCol; // rgb = baked tint/AO

    uniform mat4 uProj;
    uniform mat4 uView;
    uniform mat4 uModel;
    uniform float uWindTime;
    uniform float uWindAmp;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUV;
    varying vec3 vCol;
    varying float vDepth;

    void main() {
      vec3 pos = aPos;
      if (uWindAmp > 0.001 && aUV.y < 0.5) {
        float phase = uWindTime * 2.4 + pos.x * 0.7 + pos.z * 0.5;
        pos.x += sin(phase) * uWindAmp;
        pos.z += cos(phase * 0.8) * uWindAmp * 0.6;
      }
      vec4 wp = uModel * vec4(pos, 1.0);
      vec4 vp = uView * wp;
      gl_Position = uProj * vp;
      vWorldPos = wp.xyz;
      vNormal = normalize(mat3(uModel) * aNorm);
      vUV = aUV;
      vCol = aCol;
      vDepth = -vp.z;
    }
  `;

  const FS_SRC = `
    precision mediump float;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUV;
    varying vec3 vCol;
    varying float vDepth;

    uniform sampler2D uTex;
    uniform vec4 uTint;
    uniform float uEmissive;
    uniform float uSpecStr;
    uniform float uShininess;
    uniform vec3 uCamPos;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uAmbient;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform int uUseFog;

    uniform vec4 uLightPos[8];
    uniform vec3 uLightCol[8];

    void main() {
      vec4 texel = texture2D(uTex, vUV);
      float alpha = texel.a * uTint.a;
      if (alpha < 0.14) discard;

      vec3 baseCol = texel.rgb * uTint.rgb * vCol;
      vec3 n = normalize(vNormal);
      vec3 vDir = normalize(uCamPos - vWorldPos);
      vec3 sDir = normalize(uSunDir);

      float ndl = max(dot(n, sDir), 0.0);
      float hemi = 0.52 + 0.48 * n.y;
      vec3 lit = baseCol * (uAmbient * hemi + uSunColor * ndl);

      // Specular metallic / wet sheen from primary light
      if (uSpecStr > 0.01) {
        vec3 h = normalize(sDir + vDir);
        float sp = pow(max(dot(n, h), 0.0), uShininess);
        lit += uSunColor * sp * uSpecStr;
        // Subtle cool twilight rim highlight on silhouettes & gun edges
        float rim = pow(1.0 - max(dot(n, vDir), 0.0), 3.0);
        lit += uAmbient * rim * uSpecStr * 0.45;
      }

      // 8 Dynamic Point Lights (campfires, lamps, anomalies, muzzle flash)
      for (int i = 0; i < 8; i++) {
        float rad = uLightPos[i].w;
        if (rad > 0.1) {
          vec3 d = uLightPos[i].xyz - vWorldPos;
          float dist2 = dot(d, d);
          if (dist2 < rad * rad) {
            float dist = sqrt(dist2);
            vec3 lDir = d / max(dist, 0.001);
            float atten = 1.0 - (dist / rad);
            atten = atten * atten;
            float ln = max(dot(n, lDir), 0.22);
            lit += baseCol * uLightCol[i] * atten * ln;
            if (uSpecStr > 0.05) {
              vec3 lh = normalize(lDir + vDir);
              float lsp = pow(max(dot(n, lh), 0.0), uShininess);
              lit += uLightCol[i] * lsp * atten * uSpecStr * 0.7;
            }
          }
        }
      }

      lit += baseCol * uEmissive;

      if (uUseFog == 1) {
        // Exponential distance fog + low-lying swamp mist boost!
        float swampMist = clamp((2.6 - vWorldPos.y) * 0.0022, 0.0, 0.007);
        float dFog = uFogDensity + swampMist;
        float fogF = 1.0 - exp(-pow(max(vDepth, 0.0) * dFog, 2.0));
        lit = mix(lit, uFogColor, clamp(fogF, 0.0, 0.96));
      }

      // Subtle atmospheric filmic tone boost
      lit = lit / (lit + vec3(0.88)) * 1.48;
      gl_FragColor = vec4(lit, alpha);
    }
  `;

  // Unit cube with per-vertex AO (bottom slightly darker for grounding!)
  function buildUnitCubeData(sx = 1, sy = 1, sz = 1, tileU = 1, tileV = 1, bottomAO = 0.72) {
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const faces = [
      { n: [0, 0, 1],  v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], u: sx, h: sy, ao: [bottomAO, bottomAO, 1, 1] },
      { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], u: sx, h: sy, ao: [bottomAO, bottomAO, 1, 1] },
      { n: [1, 0, 0],  v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], u: sz, h: sy, ao: [bottomAO, bottomAO, 1, 1] },
      { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], u: sz, h: sy, ao: [bottomAO, bottomAO, 1, 1] },
      { n: [0, 1, 0],  v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], u: sx, h: sz, ao: [1, 1, 1, 1] },
      { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], u: sx, h: sz, ao: [bottomAO, bottomAO, bottomAO, bottomAO] }
    ];
    const verts = [];
    const idx = [];
    let base = 0;
    for (const f of faces) {
      const tu = tileU > 0 ? f.u / tileU : 1;
      const tv = tileV > 0 ? f.h / tileV : 1;
      const uvs = [[0, tv], [tu, tv], [tu, 0], [0, 0]];
      for (let i = 0; i < 4; i++) {
        const ao = f.ao[i];
        verts.push(f.v[i][0], f.v[i][1], f.v[i][2], f.n[0], f.n[1], f.n[2], uvs[i][0], uvs[i][1], ao, ao, ao);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
    return { verts, idx };
  }

  // High-Res 128x128 Procedural Weathered Post-Soviet Textures
  function makeProceduralTexture(gl, kind) {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');

    const fillNoise = (r, g, b, v, step = 4) => {
      for (let y = 0; y < S; y += step) {
        for (let x = 0; x < S; x += step) {
          const d = (Math.random() - 0.5) * v;
          ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, r + d))|0},${Math.max(0, Math.min(255, g + d))|0},${Math.max(0, Math.min(255, b + d))|0})`;
          ctx.fillRect(x, y, step, step);
        }
      }
    };

    switch (kind) {
      case 'grass': // Murky twilight autumn-swamp earth + dead moss
        fillNoise(54, 62, 42, 28, 4);
        for (let i = 0; i < 120; i++) {
          ctx.fillStyle = Math.random() > 0.45 ? 'rgba(84,74,40,0.55)' : 'rgba(34,48,30,0.65)';
          ctx.fillRect(Math.random() * S, Math.random() * S, 4 + Math.random() * 6, 4 + Math.random() * 6);
        }
        break;
      case 'swamp': // Dark reflective bog water + floating duckweed
        fillNoise(24, 40, 34, 16, 4);
        for (let i = 0; i < 55; i++) {
          ctx.fillStyle = 'rgba(54,84,52,0.45)';
          ctx.fillRect(Math.random() * S, Math.random() * S, 6 + Math.random() * 10, 3);
        }
        break;
      case 'asphalt': // Wet cracked Soviet road
        fillNoise(46, 50, 50, 22, 4);
        ctx.strokeStyle = 'rgba(18,22,22,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(36, 48); ctx.lineTo(22, 128); ctx.stroke();
        ctx.fillStyle = 'rgba(72,82,84,0.22)';
        ctx.fillRect(48, 22, 44, 34);
        break;
      case 'concrete': // Grimy Soviet concrete panels with moss & leaks
        fillNoise(104, 108, 102, 26, 4);
        ctx.strokeStyle = 'rgba(38,42,38,0.65)';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, S - 4, S - 4);
        ctx.fillStyle = 'rgba(42,58,36,0.42)';
        ctx.fillRect(0, S - 24, S, 24);
        for (let i = 0; i < 16; i++) {
          ctx.fillStyle = 'rgba(32,36,30,0.3)';
          ctx.fillRect(Math.random() * S, 0, 3, 25 + Math.random() * 45);
        }
        break;
      case 'brick':
        fillNoise(94, 56, 44, 28, 4);
        ctx.fillStyle = '#3b3530';
        for (let y = 0; y < S; y += 16) {
          ctx.fillRect(0, y, S, 2);
          const off = (y % 32 === 0) ? 0 : 16;
          for (let x = off; x < S; x += 32) ctx.fillRect(x, y, 2, 16);
        }
        ctx.fillStyle = 'rgba(26,38,24,0.32)';
        ctx.fillRect(0, S - 20, S, 20);
        break;
      case 'rust': // Corrugated heavily rusted iron (ZIL trucks, garages)
        fillNoise(92, 54, 34, 44, 4);
        for (let x = 0; x < S; x += 12) {
          ctx.fillStyle = 'rgba(28,16,10,0.32)';
          ctx.fillRect(x, 0, 3, S);
        }
        for (let i = 0; i < 35; i++) {
          ctx.fillStyle = 'rgba(136,68,28,0.45)';
          ctx.fillRect(Math.random() * S, Math.random() * S, 12, 8);
        }
        break;
      case 'crate': // Military wooden ammo crate with metal corners
        fillNoise(96, 74, 46, 24, 4);
        ctx.fillStyle = '#3d2c19';
        for (let y = 0; y < S; y += 22) ctx.fillRect(0, y, S, 3);
        ctx.strokeStyle = '#2d332f';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, S - 8, S - 8);
        ctx.fillStyle = '#2c302b';
        ctx.fillRect(14, 14, S - 28, 6);
        ctx.fillRect(14, S - 20, S - 28, 6);
        break;
      case 'wood':
        fillNoise(84, 60, 38, 24, 4);
        ctx.fillStyle = 'rgba(30,20,12,0.5)';
        for (let y = 0; y < S; y += 18) ctx.fillRect(0, y, S, 2);
        break;
      case 'bark':
        fillNoise(54, 42, 32, 30, 4);
        for (let x = 4; x < S; x += 10) {
          ctx.fillStyle = 'rgba(20,14,10,0.48)';
          ctx.fillRect(x, 0, 3, S);
        }
        break;
      case 'leaves': // Sparse gnarled autumn-swamp foliage with alpha cutouts!
        ctx.clearRect(0, 0, S, S);
        for (let i = 0; i < 160; i++) {
          const x = Math.random() * (S - 10), y = Math.random() * (S - 10);
          const cols = ['#5c4724', '#7a5226', '#3d4d2c', '#4a3c22', '#8c5a28'];
          ctx.fillStyle = cols[i % cols.length];
          ctx.fillRect(x, y, 7 + Math.random() * 6, 7 + Math.random() * 6);
        }
        break;
      case 'grass_tuft': // Tall alpha-cutout swamp grass & reeds!
        ctx.clearRect(0, 0, S, S);
        for (let i = 0; i < 34; i++) {
          const bx = 6 + Math.random() * (S - 12);
          const bh = 46 + Math.random() * 76;
          const lean = (Math.random() - 0.5) * 28;
          ctx.strokeStyle = i % 3 === 0 ? '#786234' : (i % 2 === 0 ? '#4d5d32' : '#3a4a2a');
          ctx.lineWidth = 3 + Math.random() * 2;
          ctx.beginPath();
          ctx.moveTo(bx, S);
          ctx.quadraticCurveTo(bx + lean * 0.4, S - bh * 0.55, bx + lean, S - bh);
          ctx.stroke();
        }
        break;
      case 'camo_net': // Overhead military camouflage netting (just like Screenshot 1!)
        ctx.clearRect(0, 0, S, S);
        ctx.strokeStyle = 'rgba(42, 48, 34, 0.85)';
        ctx.lineWidth = 2;
        for (let i = 0; i < S; i += 14) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
        }
        for (let i = 0; i < 95; i++) {
          const cols = ['#564a2c', '#3d4c2c', '#6e542a', '#2c3424'];
          ctx.fillStyle = cols[i % cols.length];
          ctx.fillRect(Math.random() * (S - 14), Math.random() * (S - 10), 10 + Math.random() * 8, 6 + Math.random() * 6);
        }
        break;
      case 'camo_armor': // Stalker voxel camo plate armor texture
        fillNoise(62, 68, 54, 22, 4);
        for (let i = 0; i < 38; i++) {
          ctx.fillStyle = i % 3 === 0 ? '#32382c' : (i % 2 === 0 ? '#7a6846' : '#464e3d');
          ctx.fillRect((Math.random() * 14 | 0) * 8, (Math.random() * 14 | 0) * 8, 16, 12);
        }
        ctx.strokeStyle = 'rgba(20,24,20,0.6)';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, S - 8, S - 8);
        break;
      case 'gunmetal': // Brushed weathered firearm steel with rivets & edge wear
        fillNoise(68, 74, 78, 22, 4);
        for (let y = 0; y < S; y += 6) {
          ctx.fillStyle = 'rgba(130,145,155,0.12)';
          ctx.fillRect(0, y, S, 2);
        }
        ctx.strokeStyle = 'rgba(160,175,185,0.28)';
        ctx.lineWidth = 3;
        ctx.strokeRect(3, 3, S - 6, S - 6);
        break;
      case 'roof':
        fillNoise(54, 60, 62, 22, 4);
        for (let x = 0; x < S; x += 16) {
          ctx.fillStyle = 'rgba(18,22,24,0.5)';
          ctx.fillRect(x, 0, 3, S);
        }
        break;
      case 'hazard':
        ctx.fillStyle = '#c48d24';
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = '#1b1d1c';
        for (let i = -S; i < S * 2; i += 24) {
          ctx.beginPath();
          ctx.moveTo(i, 0); ctx.lineTo(i + 12, 0);
          ctx.lineTo(i - S + 12, S); ctx.lineTo(i - S, S);
          ctx.closePath(); ctx.fill();
        }
        break;
      case 'wire':
        ctx.clearRect(0, 0, S, S);
        ctx.strokeStyle = '#5f6866';
        ctx.lineWidth = 3;
        for (let y = 16; y < S; y += 26) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
        }
        for (let x = 12; x < S; x += 24) {
          ctx.beginPath(); ctx.moveTo(x - 6, 8); ctx.lineTo(x + 6, S - 8); ctx.stroke();
        }
        break;
      case 'white':
      default:
        fillNoise(230, 234, 232, 18, 8);
        break;
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    const isAlphaCutout = (kind === 'grass_tuft' || kind === 'leaves' || kind === 'camo_net' || kind === 'wire');
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, isAlphaCutout ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, isAlphaCutout ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, isAlphaCutout ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, isAlphaCutout ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    if (!isAlphaCutout) gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  }

  class Engine {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
        || canvas.getContext('experimental-webgl');
      if (!gl) throw new Error('WebGL not supported');
      this.gl = gl;

      // Compile Sky Program
      this.skyProg = this._createProgram(SKY_VS, SKY_FS);
      this.skyLoc = {
        aPos: gl.getAttribLocation(this.skyProg, 'aPos'),
        uYaw: gl.getUniformLocation(this.skyProg, 'uYaw'),
        uPitch: gl.getUniformLocation(this.skyProg, 'uPitch'),
        uAspect: gl.getUniformLocation(this.skyProg, 'uAspect'),
        uTime: gl.getUniformLocation(this.skyProg, 'uTime'),
        uZenith: gl.getUniformLocation(this.skyProg, 'uZenith'),
        uHorizon: gl.getUniformLocation(this.skyProg, 'uHorizon'),
        uCloudCol: gl.getUniformLocation(this.skyProg, 'uCloudCol'),
        uLightning: gl.getUniformLocation(this.skyProg, 'uLightning')
      };
      this.skyVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyVBO);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      // Compile Main Scene Program
      this.prog = this._createProgram(VS_SRC, FS_SRC);
      this.loc = {
        aPos: gl.getAttribLocation(this.prog, 'aPos'),
        aNorm: gl.getAttribLocation(this.prog, 'aNorm'),
        aUV: gl.getAttribLocation(this.prog, 'aUV'),
        aCol: gl.getAttribLocation(this.prog, 'aCol'),
        uProj: gl.getUniformLocation(this.prog, 'uProj'),
        uView: gl.getUniformLocation(this.prog, 'uView'),
        uModel: gl.getUniformLocation(this.prog, 'uModel'),
        uWindTime: gl.getUniformLocation(this.prog, 'uWindTime'),
        uWindAmp: gl.getUniformLocation(this.prog, 'uWindAmp'),
        uTex: gl.getUniformLocation(this.prog, 'uTex'),
        uTint: gl.getUniformLocation(this.prog, 'uTint'),
        uEmissive: gl.getUniformLocation(this.prog, 'uEmissive'),
        uSpecStr: gl.getUniformLocation(this.prog, 'uSpecStr'),
        uShininess: gl.getUniformLocation(this.prog, 'uShininess'),
        uCamPos: gl.getUniformLocation(this.prog, 'uCamPos'),
        uSunDir: gl.getUniformLocation(this.prog, 'uSunDir'),
        uSunColor: gl.getUniformLocation(this.prog, 'uSunColor'),
        uAmbient: gl.getUniformLocation(this.prog, 'uAmbient'),
        uFogColor: gl.getUniformLocation(this.prog, 'uFogColor'),
        uFogDensity: gl.getUniformLocation(this.prog, 'uFogDensity'),
        uUseFog: gl.getUniformLocation(this.prog, 'uUseFog'),
        uLightPos: gl.getUniformLocation(this.prog, 'uLightPos[0]'),
        uLightCol: gl.getUniformLocation(this.prog, 'uLightCol[0]')
      };

      this.textures = {};
      const kinds = [
        'grass', 'swamp', 'asphalt', 'concrete', 'brick', 'rust', 'crate',
        'wood', 'bark', 'leaves', 'grass_tuft', 'camo_net', 'camo_armor',
        'gunmetal', 'roof', 'hazard', 'wire', 'white'
      ];
      for (const k of kinds) this.textures[k] = makeProceduralTexture(gl, k);

      const unit = buildUnitCubeData(1, 1, 1, 0, 0, 0.84);
      this.unitVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.unitVBO);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(unit.verts), gl.STATIC_DRAW);
      this.unitIBO = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.unitIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(unit.idx), gl.STATIC_DRAW);
      this.unitCount = unit.idx.length;

      this.staticBatches = [];
      this.colliders = [];
      this.terrainHeightFn = () => 0;

      this.projMat = M4.create();
      this.viewMat = M4.create();
      this.modelMat = M4.create();
      this.idMat = M4.identity(M4.create());

      // Twilight Swamp default lighting
      this.skyZenith = [0.09, 0.12, 0.14];
      this.skyHorizon = [0.22, 0.27, 0.24];
      this.skyClouds = [0.16, 0.19, 0.19];
      this.fogColor = [0.20, 0.25, 0.22];
      this.fogDensity = 0.020;
      this.lightning = 0;
      this.sunDir = [0.45, 0.55, -0.65];
      this.sunColor = [0.58, 0.62, 0.56];
      this.ambient = [0.34, 0.38, 0.36];

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.resize();
    }

    _createProgram(vsSrc, fsSrc) {
      const gl = this.gl;
      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w; this.canvas.height = h;
      }
      this.gl.viewport(0, 0, w, h);
      this.aspect = w / Math.max(1, h);
    }

    beginStaticBuild() {
      this._buckets = {};
      this.colliders = [];
      this.staticBatches = [];
    }

    _getBucket(texName, opts) {
      const tint = opts.tint || [1, 1, 1, 1];
      const spec = opts.spec || 0.12;
      const wind = opts.wind || 0;
      const doubleSided = !!opts.doubleSided;
      const key = `${texName}|${tint.join(',')}|${spec}|${wind}|${doubleSided ? 1 : 0}`;
      if (!this._buckets[key]) {
        this._buckets[key] = {
          texName, tint, emissive: opts.emissive || 0, spec, wind, doubleSided,
          chunks: [{ verts: [], idx: [], vCount: 0 }]
        };
      }
      return this._buckets[key];
    }

    _ensureChunk(bucket, neededVerts) {
      let ch = bucket.chunks[bucket.chunks.length - 1];
      if (ch.vCount + neededVerts > 50000) {
        ch = { verts: [], idx: [], vCount: 0 };
        bucket.chunks.push(ch);
      }
      return ch;
    }

    addStaticBox(x, y, z, sx, sy, sz, texName, opts = {}) {
      const tile = opts.tile || 3.0;
      const solid = opts.solid !== false;
      const isRoof = !!opts.isRoof;
      if (solid || isRoof) {
        this.colliders.push({
          minX: x - sx * 0.5, maxX: x + sx * 0.5,
          minY: y - sy * 0.5, maxY: y + sy * 0.5,
          minZ: z - sz * 0.5, maxZ: z + sz * 0.5,
          solid, isRoof
        });
      }
      const bucket = this._getBucket(texName, opts);
      const ch = this._ensureChunk(bucket, 24);
      const cube = buildUnitCubeData(sx, sy, sz, tile, tile, opts.noAO ? 1.0 : 0.68);
      const base = ch.vCount;
      const rotY = opts.ry || 0;
      const cy = Math.cos(rotY), syr = Math.sin(rotY);

      for (let i = 0; i < cube.verts.length; i += 11) {
        const lx = cube.verts[i], ly = cube.verts[i + 1], lz = cube.verts[i + 2];
        const nx = cube.verts[i + 3], ny = cube.verts[i + 4], nz = cube.verts[i + 5];
        const rx = lx * cy + lz * syr;
        const rz = -lx * syr + lz * cy;
        const rnx = nx * cy + nz * syr;
        const rnz = -nx * syr + nz * cy;
        ch.verts.push(
          rx + x, ly + y, rz + z,
          rnx, ny, rnz,
          cube.verts[i + 6], cube.verts[i + 7],
          cube.verts[i + 8], cube.verts[i + 9], cube.verts[i + 10]
        );
      }
      for (let i = 0; i < cube.idx.length; i++) ch.idx.push(cube.idx[i] + base);
      ch.vCount += 24;
    }

    // Add crossed swaying grass / reed tufts in one ultra-fast static batch
    addGrassTuft(x, y, z, w, h) {
      const bucket = this._getBucket('grass_tuft', { tint: [1, 1, 1, 1], spec: 0.05, wind: 0.14, doubleSided: true });
      const ch = this._ensureChunk(bucket, 8);
      const base = ch.vCount;
      const hw = w * 0.5;
      const ang = (x * 1.7 + z * 2.3) % 3.14;
      const planes = [ang, ang + Math.PI * 0.5];
      for (let p = 0; p < 2; p++) {
        const ca = Math.cos(planes[p]) * hw, sa = Math.sin(planes[p]) * hw;
        const b = base + p * 4;
        // 4 verts: bottom-left, bottom-right, top-right, top-left (UV.y=0 at top so wind shader sways top!)
        ch.verts.push(
          x - ca, y - 0.05, z - sa, 0, 1, 0, 0, 1, 0.55, 0.58, 0.52,
          x + ca, y - 0.05, z + sa, 0, 1, 0, 1, 1, 0.55, 0.58, 0.52,
          x + ca, y + h,    z + sa, 0, 1, 0, 1, 0, 1.0,  1.0,  0.96,
          x - ca, y + h,    z - sa, 0, 1, 0, 0, 0, 1.0,  1.0,  0.96
        );
        ch.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      ch.vCount += 8;
    }

    // Build smooth Heightmap 3D Terrain Mesh with vertex biome tinting & slopes
    addTerrainGrid(size, step, heightFn, colorFn) {
      this.terrainHeightFn = heightFn;
      const bucket = this._getBucket('grass', { tint: [1, 1, 1, 1], spec: 0.14 });
      const half = size * 0.5;
      const cells = Math.floor(size / step);
      const eps = 1.2;

      for (let gz = 0; gz < cells; gz++) {
        for (let gx = 0; gx < cells; gx++) {
          const ch = this._ensureChunk(bucket, 4);
          const x0 = -half + gx * step, x1 = x0 + step;
          const z0 = -half + gz * step, z1 = z0 + step;
          const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
          const base = ch.vCount;
          for (let i = 0; i < 4; i++) {
            const px = pts[i][0], pz = pts[i][1];
            const py = heightFn(px, pz);
            // Finite difference normal
            const hl = heightFn(px - eps, pz), hr = heightFn(px + eps, pz);
            const hd = heightFn(px, pz - eps), hu = heightFn(px, pz + eps);
            let nx = hl - hr, ny = 2.0 * eps, nz = hd - hu;
            const nl = Math.hypot(nx, ny, nz);
            nx /= nl; ny /= nl; nz /= nl;
            const col = colorFn(px, py, pz);
            ch.verts.push(px, py, pz, nx, ny, nz, px / 6.5, pz / 6.5, col[0], col[1], col[2]);
          }
          ch.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
          ch.vCount += 4;
        }
      }
    }

    finishStaticBuild() {
      const gl = this.gl;
      this.staticBatches = [];
      for (const k of Object.keys(this._buckets)) {
        const b = this._buckets[k];
        for (const ch of b.chunks) {
          if (ch.idx.length === 0) continue;
          const vbo = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ch.verts), gl.STATIC_DRAW);
          const ibo = gl.createBuffer();
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ch.idx), gl.STATIC_DRAW);
          this.staticBatches.push({
            tex: this.textures[b.texName] || this.textures.concrete,
            tint: b.tint, emissive: b.emissive, spec: b.spec, wind: b.wind,
            doubleSided: b.doubleSided,
            vbo, ibo, count: ch.idx.length,
            transparent: b.tint[3] < 0.99 || b.texName === 'wire' || b.texName === 'camo_net'
          });
        }
      }
      this.staticBatches.sort((a, b) => (a.transparent ? 1 : 0) - (b.transparent ? 1 : 0));
      this._buckets = null;
    }

    beginFrame(camX, camY, camZ, yaw, pitch, fovDeg, lights, nowSec) {
      const gl = this.gl;
      gl.clear(gl.DEPTH_BUFFER_BIT);

      // 1. Render Procedural Twilight Sky Dome
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.skyProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyVBO);
      gl.enableVertexAttribArray(this.skyLoc.aPos);
      gl.vertexAttribPointer(this.skyLoc.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(this.skyLoc.uYaw, yaw);
      gl.uniform1f(this.skyLoc.uPitch, pitch);
      gl.uniform1f(this.skyLoc.uAspect, this.aspect);
      gl.uniform1f(this.skyLoc.uTime, nowSec);
      gl.uniform3fv(this.skyLoc.uZenith, this.skyZenith);
      gl.uniform3fv(this.skyLoc.uHorizon, this.skyHorizon);
      gl.uniform3fv(this.skyLoc.uCloudCol, this.skyClouds);
      gl.uniform1f(this.skyLoc.uLightning, this.lightning);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);

      // 2. Render 3D World with PBR-style Specular + FogExp2 + 8 Point Lights
      M4.perspective(this.projMat, fovDeg * Math.PI / 180, this.aspect, 0.08, 280);
      M4.cameraView(this.viewMat, camX, camY, camZ, yaw, pitch);

      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(this.loc.uProj, false, this.projMat);
      gl.uniformMatrix4fv(this.loc.uView, false, this.viewMat);
      gl.uniform3f(this.loc.uCamPos, camX, camY, camZ);
      gl.uniform1f(this.loc.uWindTime, nowSec);
      gl.uniform3fv(this.loc.uSunDir, this.sunDir);
      gl.uniform3fv(this.loc.uSunColor, this.sunColor);
      gl.uniform3fv(this.loc.uAmbient, this.ambient);
      gl.uniform3fv(this.loc.uFogColor, this.fogColor);
      gl.uniform1f(this.loc.uFogDensity, this.fogDensity);
      gl.uniform1i(this.loc.uUseFog, 1);

      const lp = new Float32Array(32);
      const lc = new Float32Array(24);
      const count = Math.min(8, lights ? lights.length : 0);
      for (let i = 0; i < count; i++) {
        const L = lights[i];
        lp[i * 4] = L.x; lp[i * 4 + 1] = L.y; lp[i * 4 + 2] = L.z; lp[i * 4 + 3] = L.r;
        lc[i * 3] = L.cr; lc[i * 3 + 1] = L.cg; lc[i * 3 + 2] = L.cb;
      }
      gl.uniform4fv(this.loc.uLightPos, lp);
      gl.uniform3fv(this.loc.uLightCol, lc);
      gl.uniform1i(this.loc.uTex, 0);

      gl.uniformMatrix4fv(this.loc.uModel, false, this.idMat);
      for (const b of this.staticBatches) {
        this._bindMesh(b.vbo, b.ibo);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, b.tex);
        gl.uniform4fv(this.loc.uTint, b.tint);
        gl.uniform1f(this.loc.uEmissive, b.emissive);
        gl.uniform1f(this.loc.uSpecStr, b.spec);
        gl.uniform1f(this.loc.uShininess, 24.0);
        gl.uniform1f(this.loc.uWindAmp, b.wind);
        if (b.doubleSided) gl.disable(gl.CULL_FACE);
        if (b.transparent) gl.depthMask(false);
        gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
        if (b.transparent) gl.depthMask(true);
        if (b.doubleSided) gl.enable(gl.CULL_FACE);
      }

      gl.uniform1f(this.loc.uWindAmp, 0.0);
      this._bindMesh(this.unitVBO, this.unitIBO);
    }

    _bindMesh(vbo, ibo) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      const stride = 44; // 11 floats: pos(3) + norm(3) + uv(2) + col(3)
      gl.enableVertexAttribArray(this.loc.aPos);
      gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(this.loc.aNorm);
      gl.vertexAttribPointer(this.loc.aNorm, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(this.loc.aUV);
      gl.vertexAttribPointer(this.loc.aUV, 2, gl.FLOAT, false, stride, 24);
      gl.enableVertexAttribArray(this.loc.aCol);
      gl.vertexAttribPointer(this.loc.aCol, 3, gl.FLOAT, false, stride, 32);
    }

    drawBox(x, y, z, sx, sy, sz, ry, rx, tint, texName = 'white', emissive = 0, depthWrite = true, spec = 0.18) {
      const gl = this.gl;
      M4.trs(this.modelMat, x, y, z, ry, rx, sx, sy, sz);
      gl.uniformMatrix4fv(this.loc.uModel, false, this.modelMat);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[texName] || this.textures.white);
      gl.uniform4fv(this.loc.uTint, tint);
      gl.uniform1f(this.loc.uEmissive, emissive);
      gl.uniform1f(this.loc.uSpecStr, spec);
      gl.uniform1f(this.loc.uShininess, 32.0);
      if (!depthWrite) gl.depthMask(false);
      gl.drawElements(gl.TRIANGLES, this.unitCount, gl.UNSIGNED_SHORT, 0);
      if (!depthWrite) gl.depthMask(true);
    }

    // Viewmodel pass with crisp dedicated key/rim metallic lighting so guns & gloves gleam!
    beginViewmodelPass(fovDeg, muzzleFlash = 0) {
      const gl = this.gl;
      gl.clear(gl.DEPTH_BUFFER_BIT);
      M4.perspective(this.projMat, fovDeg * Math.PI / 180, this.aspect, 0.02, 12);
      gl.uniformMatrix4fv(this.loc.uProj, false, this.projMat);
      gl.uniformMatrix4fv(this.loc.uView, false, this.idMat);
      gl.uniform3f(this.loc.uCamPos, 0, 0, 0);
      gl.uniform3f(this.loc.uSunDir, 0.35, 0.8, 0.55);
      gl.uniform3f(this.loc.uSunColor, 0.85 + muzzleFlash * 0.6, 0.88 + muzzleFlash * 0.35, 0.82);
      gl.uniform3f(this.loc.uAmbient, 0.44, 0.48, 0.46);
      gl.uniform1i(this.loc.uUseFog, 0);
      gl.uniform1f(this.loc.uWindAmp, 0.0);
      // Local campfire/muzzle point light in view space
      const lp = new Float32Array(32);
      const lc = new Float32Array(24);
      if (muzzleFlash > 0.02) {
        lp[0] = 0.15; lp[1] = 0.0; lp[2] = -0.8; lp[3] = 2.5;
        lc[0] = 2.2 * muzzleFlash; lc[1] = 1.35 * muzzleFlash; lc[2] = 0.45 * muzzleFlash;
      } else {
        lp[0] = -0.6; lp[1] = 0.8; lp[2] = 0.2; lp[3] = 4.0;
        lc[0] = 0.45; lc[1] = 0.52; lc[2] = 0.55;
      }
      gl.uniform4fv(this.loc.uLightPos, lp);
      gl.uniform3fv(this.loc.uLightCol, lc);
      this._bindMesh(this.unitVBO, this.unitIBO);
    }

    drawViewPart(x, y, z, sx, sy, sz, ry, rx, tint, texName = 'gunmetal', emissive = 0, spec = 0.48, depthWrite = true) {
      this.drawBox(x, y, z, sx, sy, sz, ry, rx, tint, texName, emissive, depthWrite, spec);
    }

    // Heightmap + AABB Collision Physics
    moveWithCollisions(px, py, pz, dx, dy, dz, radius = 0.42, height = 1.72) {
      let nx = px + dx;
      let ny = py + dy;
      let nz = pz + dz;
      let onGround = false;

      const groundY = this.terrainHeightFn(nx, nz);
      if (ny <= groundY) { ny = groundY; onGround = true; }

      for (const c of this.colliders) {
        if (!c.solid) continue;
        if (ny + height > c.minY + 0.05 && ny < c.maxY - 0.05 &&
            pz + radius > c.minZ && pz - radius < c.maxZ) {
          if (nx + radius > c.minX && nx - radius < c.maxX) {
            if (dx > 0) nx = c.minX - radius;
            else if (dx < 0) nx = c.maxX + radius;
          }
        }
      }

      for (const c of this.colliders) {
        if (!c.solid) continue;
        if (ny + height > c.minY + 0.05 && ny < c.maxY - 0.05 &&
            nx + radius > c.minX && nx - radius < c.maxX) {
          if (nz + radius > c.minZ && nz - radius < c.maxZ) {
            if (dz > 0) nz = c.minZ - radius;
            else if (dz < 0) nz = c.maxZ + radius;
          }
        }
      }

      for (const c of this.colliders) {
        if (!c.solid) continue;
        if (nx + radius > c.minX && nx - radius < c.maxX &&
            nz + radius > c.minZ && nz - radius < c.maxZ) {
          if (dy <= 0 && py >= c.maxY - 0.18 && ny <= c.maxY) {
            ny = c.maxY; onGround = true;
          } else if (dy > 0 && py + height <= c.minY + 0.18 && ny + height >= c.minY) {
            ny = c.minY - height;
          }
        }
      }

      nx = Math.max(-154, Math.min(154, nx));
      nz = Math.max(-154, Math.min(154, nz));
      const finalG = this.terrainHeightFn(nx, nz);
      if (ny < finalG) { ny = finalG; onGround = true; }
      return { x: nx, y: ny, z: nz, onGround };
    }

    rayIntersectsBox(ox, oy, oz, dx, dy, dz, b, maxDist) {
      let tmin = 0, tmax = maxDist;
      const axes = [
        [ox, dx, b.minX, b.maxX],
        [oy, dy, b.minY, b.maxY],
        [oz, dz, b.minZ, b.maxZ]
      ];
      for (let i = 0; i < 3; i++) {
        const o = axes[i][0], d = axes[i][1], lo = axes[i][2], hi = axes[i][3];
        if (Math.abs(d) < 1e-6) {
          if (o < lo || o > hi) return -1;
        } else {
          let t1 = (lo - o) / d;
          let t2 = (hi - o) / d;
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) return -1;
        }
      }
      return tmin >= 0 ? tmin : -1;
    }

    raycastWorld(ox, oy, oz, dx, dy, dz, maxDist = 200) {
      let best = maxDist;
      for (const c of this.colliders) {
        if (!c.solid) continue;
        const t = this.rayIntersectsBox(ox, oy, oz, dx, dy, dz, c, best);
        if (t > 0 && t < best) best = t;
      }
      // Step-march heightmap intersection for hills/slopes
      const step = 1.6;
      for (let t = step; t < best; t += step) {
        const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
        if (py <= this.terrainHeightFn(px, pz)) {
          best = t;
          break;
        }
      }
      return best;
    }

    hasRoofCover(x, y, z) {
      for (const c of this.colliders) {
        if (!c.isRoof) continue;
        if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.minY >= y) {
          return true;
        }
      }
      return false;
    }
  }

  return { Engine };
})();
