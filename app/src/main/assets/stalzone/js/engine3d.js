// STALZONE Zero-Dependency 60 FPS WebGL 1.0 Voxel 3D Engine & Physics Raycaster
window.Engine3D = (function () {
  // Minimal fast 4x4 matrix math (column-major)
  const M4 = {
    create() { return new Float32Array(16); },
    identity(out) {
      out.fill(0); out[0] = out[5] = out[10] = out[15] = 1;
      return out;
    },
    perspective(out, fovyRad, aspect, near, far) {
      const f = 1.0 / Math.tan(fovyRad * 0.5);
      const nf = 1 / (near - far);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[10] = (far + near) * nf;
      out[11] = -1;
      out[14] = (2 * far * near) * nf;
      return out;
    },
    multiply(out, a, b) {
      const r = new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        for (let row = 0; row < 4; row++) {
          r[c * 4 + row] =
            a[0 * 4 + row] * b[c * 4 + 0] +
            a[1 * 4 + row] * b[c * 4 + 1] +
            a[2 * 4 + row] * b[c * 4 + 2] +
            a[3 * 4 + row] * b[c * 4 + 3];
        }
      }
      out.set(r);
      return out;
    },
    cameraView(out, px, py, pz, yaw, pitch) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      // Forward = (-sy*cp, sp, -cy*cp), Right = (cy, 0, -sy), Up = (sy*sp, cp, cy*sp)
      const rx = cy, ry = 0, rz = -sy;
      const ux = sy * sp, uy = cp, uz = cy * sp;
      const bx = sy * cp, by = -sp, bz = cy * cp; // -forward

      out[0] = rx; out[4] = ry; out[8] = rz; out[12] = -(rx * px + ry * py + rz * pz);
      out[1] = ux; out[5] = uy; out[9] = uz; out[13] = -(ux * px + uy * py + uz * pz);
      out[2] = bx; out[6] = by; out[10] = bz; out[14] = -(bx * px + by * py + bz * pz);
      out[3] = 0;  out[7] = 0;  out[11] = 0;  out[15] = 1;
      return out;
    },
    trs(out, tx, ty, tz, ry, rx, sx, sy, sz) {
      const cy = Math.cos(ry), siny = Math.sin(ry);
      const cx = Math.cos(rx), sinx = Math.sin(rx);
      // R = Ry * Rx
      out[0] = cy * sx;           out[4] = siny * sinx * sy;  out[8]  = siny * cx * sz; out[12] = tx;
      out[1] = 0;                 out[5] = cx * sy;           out[9]  = -sinx * sz;     out[13] = ty;
      out[2] = -siny * sx;        out[6] = cy * sinx * sy;    out[10] = cy * cx * sz;   out[14] = tz;
      out[3] = 0;                 out[7] = 0;                 out[11] = 0;              out[15] = 1;
      return out;
    }
  };

  // Shaders: Voxel lighting + FogExp2 + 8 dynamic point lights + emissive + alpha
  const VS_SRC = `
    attribute vec3 aPos;
    attribute vec3 aNorm;
    attribute vec2 aUV;
    uniform mat4 uProj;
    uniform mat4 uView;
    uniform mat4 uModel;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUV;
    varying float vDepth;
    void main() {
      vec4 wp = uModel * vec4(aPos, 1.0);
      vec4 vp = uView * wp;
      gl_Position = uProj * vp;
      vWorldPos = wp.xyz;
      vNormal = normalize(mat3(uModel) * aNorm);
      vUV = aUV;
      vDepth = -vp.z;
    }
  `;

  const FS_SRC = `
    precision mediump float;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUV;
    varying float vDepth;

    uniform sampler2D uTex;
    uniform vec4 uTint;
    uniform float uEmissive;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uAmbient;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform int uUseFog;

    uniform vec4 uLightPos[8];   // xyz = pos, w = radius
    uniform vec3 uLightCol[8];   // rgb intensity

    void main() {
      vec4 texel = texture2D(uTex, vUV);
      vec3 baseCol = texel.rgb * uTint.rgb;
      float alpha = texel.a * uTint.a;
      if (alpha < 0.05) discard;

      vec3 n = normalize(vNormal);
      float ndl = max(dot(n, normalize(uSunDir)), 0.0);
      float hemi = 0.55 + 0.45 * n.y;
      vec3 lit = baseCol * (uAmbient * hemi + uSunColor * ndl);

      // Dynamic point lights (campfire, lamps, anomalies, muzzle flash)
      for (int i = 0; i < 8; i++) {
        float rad = uLightPos[i].w;
        if (rad > 0.1) {
          vec3 d = uLightPos[i].xyz - vWorldPos;
          float dist2 = dot(d, d);
          float r2 = rad * rad;
          if (dist2 < r2) {
            float dist = sqrt(dist2);
            float atten = 1.0 - (dist / rad);
            atten = atten * atten;
            float ln = max(dot(n, d / max(dist, 0.001)), 0.25);
            lit += baseCol * uLightCol[i] * atten * ln;
          }
        }
      }

      lit += baseCol * uEmissive;

      if (uUseFog == 1) {
        float fogF = 1.0 - exp(-pow(max(vDepth, 0.0) * uFogDensity, 2.0));
        fogF = clamp(fogF, 0.0, 1.0);
        lit = mix(lit, uFogColor, fogF);
      }

      gl_FragColor = vec4(lit, alpha);
    }
  `;

  // Unit cube vertices (24 verts, 36 indices) with per-face normals & UVs
  function buildUnitCubeData(sx = 1, sy = 1, sz = 1, tileU = 1, tileV = 1) {
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const faces = [
      // +Z front
      { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], u: sx, h: sy },
      // -Z back
      { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], u: sx, h: sy },
      // +X right
      { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], u: sz, h: sy },
      // -X left
      { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], u: sz, h: sy },
      // +Y top
      { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], u: sx, h: sz },
      // -Y bottom
      { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], u: sx, h: sz }
    ];
    const verts = [];
    const idx = [];
    let base = 0;
    for (const f of faces) {
      const tu = tileU > 0 ? f.u / tileU : 1;
      const tv = tileV > 0 ? f.h / tileV : 1;
      const uvs = [[0, tv], [tu, tv], [tu, 0], [0, 0]];
      for (let i = 0; i < 4; i++) {
        verts.push(f.v[i][0], f.v[i][1], f.v[i][2], f.n[0], f.n[1], f.n[2], uvs[i][0], uvs[i][1]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
    return { verts, idx };
  }

  // Procedural Voxel Pixel-Art Texture Generator
  function makeProceduralTexture(gl, kind) {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    const noise = (baseR, baseG, baseB, variance, step = 4) => {
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          const n = (Math.random() - 0.5) * variance;
          const r = Math.max(0, Math.min(255, baseR + n));
          const g = Math.max(0, Math.min(255, baseG + n));
          const b = Math.max(0, Math.min(255, baseB + n));
          ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
          ctx.fillRect(x, y, step, step);
        }
      }
    };

    switch (kind) {
      case 'grass':
        noise(66, 82, 52, 26, 4);
        for (let i = 0; i < 30; i++) {
          ctx.fillStyle = Math.random() > 0.5 ? '#51663c' : '#7c7648';
          ctx.fillRect((Math.random() * 16 | 0) * 4, (Math.random() * 16 | 0) * 4, 4, 4);
        }
        break;
      case 'swamp':
        noise(44, 62, 46, 22, 4);
        ctx.fillStyle = 'rgba(32, 72, 58, 0.45)';
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 20; i++) {
          ctx.fillStyle = '#2d4b3d';
          ctx.fillRect((Math.random() * 16 | 0) * 4, (Math.random() * 16 | 0) * 4, 8, 4);
        }
        break;
      case 'asphalt':
        noise(58, 62, 61, 18, 4);
        ctx.fillStyle = 'rgba(30,32,32,0.4)';
        ctx.fillRect(0, 30, size, 2);
        break;
      case 'concrete':
        noise(122, 126, 120, 22, 4);
        ctx.strokeStyle = 'rgba(55,60,55,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, size - 2, size - 2);
        ctx.fillStyle = 'rgba(80, 92, 72, 0.25)';
        ctx.fillRect(0, size - 12, size, 12);
        break;
      case 'brick':
        noise(112, 68, 54, 24, 4);
        ctx.fillStyle = '#4f4640';
        for (let y = 0; y < size; y += 16) {
          ctx.fillRect(0, y, size, 2);
          const off = (y % 32 === 0) ? 0 : 16;
          for (let x = off; x < size; x += 32) ctx.fillRect(x, y, 2, 16);
        }
        break;
      case 'rust':
        noise(96, 60, 44, 34, 4);
        for (let x = 0; x < size; x += 8) {
          ctx.fillStyle = 'rgba(35,20,14,0.28)';
          ctx.fillRect(x, 0, 2, size);
        }
        break;
      case 'wood':
        noise(98, 72, 48, 22, 4);
        ctx.fillStyle = 'rgba(42,28,16,0.45)';
        for (let y = 0; y < size; y += 16) ctx.fillRect(0, y, size, 2);
        break;
      case 'bark':
        noise(64, 50, 38, 26, 4);
        for (let x = 4; x < size; x += 12) {
          ctx.fillStyle = 'rgba(28,20,14,0.4)';
          ctx.fillRect(x, 0, 4, size);
        }
        break;
      case 'leaves':
        noise(48, 74, 40, 32, 4);
        for (let i = 0; i < 24; i++) {
          ctx.fillStyle = Math.random() > 0.4 ? '#35522c' : '#6c6838';
          ctx.fillRect((Math.random() * 16 | 0) * 4, (Math.random() * 16 | 0) * 4, 4, 4);
        }
        break;
      case 'roof':
        noise(62, 68, 70, 18, 4);
        for (let x = 0; x < size; x += 16) {
          ctx.fillStyle = 'rgba(20,24,25,0.45)';
          ctx.fillRect(x, 0, 3, size);
        }
        break;
      case 'hazard':
        ctx.fillStyle = '#d49d28';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#1d1f1e';
        for (let i = -size; i < size * 2; i += 16) {
          ctx.beginPath();
          ctx.moveTo(i, 0); ctx.lineTo(i + 8, 0);
          ctx.lineTo(i - size + 8, size); ctx.lineTo(i - size, size);
          ctx.closePath(); ctx.fill();
        }
        break;
      case 'wire':
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = '#5f6866';
        ctx.lineWidth = 3;
        for (let y = 10; y < size; y += 18) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
        }
        for (let x = 8; x < size; x += 16) {
          ctx.beginPath(); ctx.moveTo(x - 4, 6); ctx.lineTo(x + 4, size - 6); ctx.stroke();
        }
        break;
      case 'white':
      default:
        noise(235, 238, 236, 16, 8);
        break;
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  }

  class Engine {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
        || canvas.getContext('experimental-webgl');
      if (!gl) throw new Error('WebGL not supported');
      this.gl = gl;

      this.prog = this._createProgram(VS_SRC, FS_SRC);
      gl.useProgram(this.prog);

      this.loc = {
        aPos: gl.getAttribLocation(this.prog, 'aPos'),
        aNorm: gl.getAttribLocation(this.prog, 'aNorm'),
        aUV: gl.getAttribLocation(this.prog, 'aUV'),
        uProj: gl.getUniformLocation(this.prog, 'uProj'),
        uView: gl.getUniformLocation(this.prog, 'uView'),
        uModel: gl.getUniformLocation(this.prog, 'uModel'),
        uTex: gl.getUniformLocation(this.prog, 'uTex'),
        uTint: gl.getUniformLocation(this.prog, 'uTint'),
        uEmissive: gl.getUniformLocation(this.prog, 'uEmissive'),
        uSunDir: gl.getUniformLocation(this.prog, 'uSunDir'),
        uSunColor: gl.getUniformLocation(this.prog, 'uSunColor'),
        uAmbient: gl.getUniformLocation(this.prog, 'uAmbient'),
        uFogColor: gl.getUniformLocation(this.prog, 'uFogColor'),
        uFogDensity: gl.getUniformLocation(this.prog, 'uFogDensity'),
        uUseFog: gl.getUniformLocation(this.prog, 'uUseFog'),
        uLightPos: gl.getUniformLocation(this.prog, 'uLightPos[0]'),
        uLightCol: gl.getUniformLocation(this.prog, 'uLightCol[0]')
      };

      // Build procedural textures
      this.textures = {};
      const kinds = ['grass', 'swamp', 'asphalt', 'concrete', 'brick', 'rust', 'wood', 'bark', 'leaves', 'roof', 'hazard', 'wire', 'white'];
      for (const k of kinds) this.textures[k] = makeProceduralTexture(gl, k);

      // Shared unit cube VBO/IBO for dynamic meshes & viewmodels
      const unit = buildUnitCubeData(1, 1, 1, 0, 0);
      this.unitVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.unitVBO);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(unit.verts), gl.STATIC_DRAW);
      this.unitIBO = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.unitIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(unit.idx), gl.STATIC_DRAW);
      this.unitCount = unit.idx.length;

      // Static world batches & colliders
      this.staticBatches = [];
      this.colliders = []; // { minX, maxX, minY, maxY, minZ, maxZ, isRoof, solid }

      this.projMat = M4.create();
      this.viewMat = M4.create();
      this.modelMat = M4.create();
      this.idMat = M4.identity(M4.create());

      // Lighting & Atmosphere state
      this.skyColor = [0.22, 0.27, 0.26];
      this.fogColor = [0.22, 0.27, 0.26];
      this.fogDensity = 0.015;
      this.sunDir = [0.4, 0.8, 0.3];
      this.sunColor = [0.75, 0.76, 0.72];
      this.ambient = [0.36, 0.4, 0.38];
      this.pointLights = []; // array of {x,y,z,r, cr,cg,cb}

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
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(s));
        }
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(p));
      }
      return p;
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.gl.viewport(0, 0, w, h);
      this.aspect = w / Math.max(1, h);
    }

    // Static world builder (batches boxes by texture into minimal draw calls)
    beginStaticBuild() {
      this._buckets = {};
      this.colliders = [];
      this.staticBatches = [];
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

      const key = texName + '|' + (opts.tint ? opts.tint.join(',') : '1,1,1,1');
      if (!this._buckets[key]) {
        this._buckets[key] = {
          texName,
          tint: opts.tint || [1, 1, 1, 1],
          emissive: opts.emissive || 0,
          chunks: [{ verts: [], idx: [], vCount: 0 }]
        };
      }
      const bucket = this._buckets[key];
      let chunk = bucket.chunks[bucket.chunks.length - 1];
      // WebGL1 Uint16 index limit is 65535 vertices -> keep chunks under 50k verts
      if (chunk.vCount + 24 > 50000) {
        chunk = { verts: [], idx: [], vCount: 0 };
        bucket.chunks.push(chunk);
      }

      const cube = buildUnitCubeData(sx, sy, sz, tile, tile);
      const base = chunk.vCount;
      for (let i = 0; i < cube.verts.length; i += 8) {
        chunk.verts.push(
          cube.verts[i] + x,
          cube.verts[i + 1] + y,
          cube.verts[i + 2] + z,
          cube.verts[i + 3], cube.verts[i + 4], cube.verts[i + 5],
          cube.verts[i + 6], cube.verts[i + 7]
        );
      }
      for (let i = 0; i < cube.idx.length; i++) {
        chunk.idx.push(cube.idx[i] + base);
      }
      chunk.vCount += 24;
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
            tint: b.tint,
            emissive: b.emissive,
            vbo, ibo, count: ch.idx.length,
            transparent: b.tint[3] < 0.99 || b.texName === 'wire'
          });
        }
      }
      // Sort opaque before transparent
      this.staticBatches.sort((a, b) => (a.transparent ? 1 : 0) - (b.transparent ? 1 : 0));
      this._buckets = null;
    }

    beginFrame(camX, camY, camZ, yaw, pitch, fovDeg, lights) {
      const gl = this.gl;
      gl.clearColor(this.skyColor[0], this.skyColor[1], this.skyColor[2], 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      M4.perspective(this.projMat, fovDeg * Math.PI / 180, this.aspect, 0.08, 280);
      M4.cameraView(this.viewMat, camX, camY, camZ, yaw, pitch);

      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(this.loc.uProj, false, this.projMat);
      gl.uniformMatrix4fv(this.loc.uView, false, this.viewMat);
      gl.uniform3fv(this.loc.uSunDir, this.sunDir);
      gl.uniform3fv(this.loc.uSunColor, this.sunColor);
      gl.uniform3fv(this.loc.uAmbient, this.ambient);
      gl.uniform3fv(this.loc.uFogColor, this.fogColor);
      gl.uniform1f(this.loc.uFogDensity, this.fogDensity);
      gl.uniform1i(this.loc.uUseFog, 1);

      // Upload up to 8 nearest dynamic point lights
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

      // Render static world batches
      gl.uniformMatrix4fv(this.loc.uModel, false, this.idMat);
      for (const b of this.staticBatches) {
        this._bindMesh(b.vbo, b.ibo);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, b.tex);
        gl.uniform4fv(this.loc.uTint, b.tint);
        gl.uniform1f(this.loc.uEmissive, b.emissive);
        if (b.transparent) gl.depthMask(false);
        gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
        if (b.transparent) gl.depthMask(true);
      }

      // Bind unit cube once for all dynamic drawBox calls
      this._bindMesh(this.unitVBO, this.unitIBO);
    }

    _bindMesh(vbo, ibo) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      const stride = 32;
      gl.enableVertexAttribArray(this.loc.aPos);
      gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(this.loc.aNorm);
      gl.vertexAttribPointer(this.loc.aNorm, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(this.loc.aUV);
      gl.vertexAttribPointer(this.loc.aUV, 2, gl.FLOAT, false, stride, 24);
    }

    drawBox(x, y, z, sx, sy, sz, ry, rx, tint, texName = 'white', emissive = 0, depthWrite = true) {
      const gl = this.gl;
      M4.trs(this.modelMat, x, y, z, ry, rx, sx, sy, sz);
      gl.uniformMatrix4fv(this.loc.uModel, false, this.modelMat);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[texName] || this.textures.white);
      gl.uniform4fv(this.loc.uTint, tint);
      gl.uniform1f(this.loc.uEmissive, emissive);
      if (!depthWrite) gl.depthMask(false);
      gl.drawElements(gl.TRIANGLES, this.unitCount, gl.UNSIGNED_SHORT, 0);
      if (!depthWrite) gl.depthMask(true);
    }

    // First-person viewmodel pass (clears depth buffer, renders in camera space)
    beginViewmodelPass(fovDeg) {
      const gl = this.gl;
      gl.clear(gl.DEPTH_BUFFER_BIT);
      M4.perspective(this.projMat, fovDeg * Math.PI / 180, this.aspect, 0.02, 12);
      gl.uniformMatrix4fv(this.loc.uProj, false, this.projMat);
      gl.uniformMatrix4fv(this.loc.uView, false, this.idMat);
      gl.uniform1i(this.loc.uUseFog, 0);
      this._bindMesh(this.unitVBO, this.unitIBO);
    }

    drawViewPart(x, y, z, sx, sy, sz, ry, rx, tint, texName = 'white', emissive = 0) {
      this.drawBox(x, y, z, sx, sy, sz, ry, rx, tint, texName, emissive, true);
    }

    // Player cylinder-AABB movement with step-up & wall slide
    moveWithCollisions(px, py, pz, dx, dy, dz, radius = 0.42, height = 1.72) {
      let nx = px + dx;
      let ny = py + dy;
      let nz = pz + dz;
      let onGround = false;

      // Ground plane at y = 0
      if (ny < 0) { ny = 0; onGround = true; }

      // Resolve X
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

      // Resolve Z
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

      // Resolve Y (landing on boxes / hitting ceilings)
      for (const c of this.colliders) {
        if (!c.solid) continue;
        if (nx + radius > c.minX && nx - radius < c.maxX &&
            nz + radius > c.minZ && nz - radius < c.maxZ) {
          if (dy <= 0 && py >= c.maxY - 0.15 && ny <= c.maxY) {
            ny = c.maxY;
            onGround = true;
          } else if (dy > 0 && py + height <= c.minY + 0.15 && ny + height >= c.minY) {
            ny = c.minY - height;
          }
        }
      }

      // Map bounds (-155..155)
      nx = Math.max(-154, Math.min(154, nx));
      nz = Math.max(-154, Math.min(154, nz));
      return { x: nx, y: ny, z: nz, onGround };
    }

    // Ray-AABB slab intersection for bullets & upward roof check
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
      if (dy < -1e-5 && oy > 0) {
        const tGround = -oy / dy;
        if (tGround > 0 && tGround < best) best = tGround;
      }
      for (const c of this.colliders) {
        if (!c.solid) continue;
        const t = this.rayIntersectsBox(ox, oy, oz, dx, dy, dz, c, best);
        if (t > 0 && t < best) best = t;
      }
      return best;
    }

    // Emission shelter check: raycast straight UP for any roof collider
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
