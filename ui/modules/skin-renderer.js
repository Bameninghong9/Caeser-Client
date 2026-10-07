// WebGL 3D Minecraft player skin renderer with posed character, authentic texturing,
// subtle idle breathing animation, and interactive cursor tracking.

// Minimal 4x4 matrix utilities
function mat4Create() { return new Float32Array(16); }
function mat4Identity(out) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}
function mat4Perspective(out, fovy, aspect, near, far) {
  out.fill(0);
  const f = 1.0 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = (2 * far * near) * nf;
  return out;
}
function mat4Multiply(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
  out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
  out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
  out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
  out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
  out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
  out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
  out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
  out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
  out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
  out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
  out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
  out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
  return out;
}
function mat4Translate(out, a, x, y, z) {
  out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
  out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
  out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
  out[12] = a[0]*x + a[4]*y + a[8]*z + a[12];
  out[13] = a[1]*x + a[5]*y + a[9]*z + a[13];
  out[14] = a[2]*x + a[6]*y + a[10]*z + a[14];
  out[15] = a[3]*x + a[7]*y + a[11]*z + a[15];
  return out;
}
function mat4RotateX(out, a, rad) {
  const s = Math.sin(rad), c = Math.cos(rad);
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  if (a !== out) {
    out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
  }
  out[4] = a10*c + a20*s; out[5] = a11*c + a21*s;
  out[6] = a12*c + a22*s; out[7] = a13*c + a23*s;
  out[8] = a20*c - a10*s; out[9] = a21*c - a11*s;
  out[10] = a22*c - a12*s; out[11] = a23*c - a13*s;
  return out;
}
function mat4RotateY(out, a, rad) {
  const s = Math.sin(rad), c = Math.cos(rad);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  if (a !== out) {
    out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
  }
  out[0] = a00*c - a20*s; out[1] = a01*c - a21*s;
  out[2] = a02*c - a22*s; out[3] = a03*c - a23*s;
  out[8] = a00*s + a20*c; out[9] = a01*s + a21*c;
  out[10] = a02*s + a22*c; out[11] = a03*s + a23*c;
  return out;
}
function mat4RotateZ(out, a, rad) {
  const s = Math.sin(rad), c = Math.cos(rad);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  if (a !== out) {
    out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
  }
  out[0] = a00*c + a10*s; out[1] = a01*c + a11*s;
  out[2] = a02*c + a12*s; out[3] = a03*c + a13*s;
  out[4] = a10*c - a00*s; out[5] = a11*c - a01*s;
  out[6] = a12*c - a02*s; out[7] = a13*c - a03*s;
  return out;
}

// Generate box vertices [pos(3), uv(2), normal(3)] -> 8 floats per vertex
function buildBox(width, height, depth, uvMap, expand = 0) {
  const w = width + expand * 2, h = height + expand * 2, d = depth + expand * 2;
  const x0 = -w / 2, x1 = w / 2;
  const y0 = -h / 2, y1 = h / 2;
  const z0 = -d / 2, z1 = d / 2;

  const vertices = [];
  const indices = [];
  let vIndex = 0;

  function addFace(p0, p1, p2, p3, uv, norm) {
    const [u, v, uw, vh] = uv;
    const u0 = u / 64, u1 = (u + uw) / 64;
    const v0 = v / 64, v1 = (v + vh) / 64;

    vertices.push(
      p0[0], p0[1], p0[2], u0, v0, norm[0], norm[1], norm[2],
      p1[0], p1[1], p1[2], u0, v1, norm[0], norm[1], norm[2],
      p2[0], p2[1], p2[2], u1, v1, norm[0], norm[1], norm[2],
      p3[0], p3[1], p3[2], u1, v0, norm[0], norm[1], norm[2]
    );

    indices.push(vIndex, vIndex + 1, vIndex + 2, vIndex, vIndex + 2, vIndex + 3);
    vIndex += 4;
  }

  // Front (+Z)
  addFace([x0,y1,z1], [x0,y0,z1], [x1,y0,z1], [x1,y1,z1], uvMap.front, [0, 0, 1]);
  // Back (-Z)
  addFace([x1,y1,z0], [x1,y0,z0], [x0,y0,z0], [x0,y1,z0], uvMap.back, [0, 0, -1]);
  // Top (+Y)
  addFace([x0,y1,z0], [x0,y1,z1], [x1,y1,z1], [x1,y1,z0], uvMap.top, [0, 1, 0]);
  // Bottom (-Y)
  addFace([x0,y0,z1], [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], uvMap.bottom, [0, -1, 0]);
  // Right (-X)
  addFace([x0,y1,z0], [x0,y0,z0], [x0,y0,z1], [x0,y1,z1], uvMap.right, [-1, 0, 0]);
  // Left (+X)
  addFace([x1,y1,z1], [x1,y0,z1], [x1,y0,z0], [x1,y1,z0], uvMap.left, [1, 0, 0]);

  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

// Default Steve 64x64 skin generator (canvas)
function createDefaultSteveSkin() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const skin = '#d69f7e', skinShade = '#be8361', hair = '#4a2717', hairDark = '#361b0d';
  const shirt = '#009d9a', shirtDark = '#007d7b', pants = '#2a3563', pantsDark = '#1e2646', shoes = '#3d3d3d';

  // Head base
  ctx.fillStyle = hair; ctx.fillRect(8, 0, 8, 8); ctx.fillRect(16, 0, 8, 8); // Top & Bottom
  ctx.fillRect(0, 8, 8, 8); ctx.fillRect(24, 8, 8, 8); // Right & Back
  ctx.fillStyle = hairDark; ctx.fillRect(8, 8, 8, 3); // Hair fringe
  ctx.fillStyle = skin; ctx.fillRect(8, 11, 8, 5); // Face
  ctx.fillStyle = skinShade; ctx.fillRect(9, 13, 1, 1); ctx.fillRect(14, 13, 1, 1);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(9, 12, 2, 1); ctx.fillRect(13, 12, 2, 1); // Eyes white
  ctx.fillStyle = '#2b3fa3'; ctx.fillRect(10, 12, 1, 1); ctx.fillRect(13, 12, 1, 1); // Eyes pupil
  ctx.fillStyle = '#572f1b'; ctx.fillRect(10, 14, 4, 1); // Nose / mouth
  ctx.fillStyle = hair; ctx.fillRect(16, 8, 8, 8); // Left head

  // Torso base
  ctx.fillStyle = shirt; ctx.fillRect(20, 16, 8, 4); ctx.fillRect(28, 16, 8, 4); // Top & Bottom
  ctx.fillRect(16, 20, 4, 12); ctx.fillRect(20, 20, 8, 12); ctx.fillRect(28, 20, 4, 12); ctx.fillRect(32, 20, 8, 12);
  ctx.fillStyle = skin; ctx.fillRect(22, 20, 4, 2); // Collar skin opening
  ctx.fillStyle = shirtDark; ctx.fillRect(20, 30, 8, 2);

  // Right arm
  ctx.fillStyle = shirt; ctx.fillRect(44, 16, 4, 4); ctx.fillRect(48, 16, 4, 4);
  ctx.fillRect(40, 20, 4, 4); ctx.fillRect(44, 20, 4, 4); ctx.fillRect(48, 20, 4, 4); ctx.fillRect(52, 20, 4, 4);
  ctx.fillStyle = skin; ctx.fillRect(40, 24, 16, 8);

  // Left arm
  ctx.fillStyle = shirt; ctx.fillRect(36, 48, 4, 4); ctx.fillRect(40, 48, 4, 4);
  ctx.fillRect(32, 52, 4, 4); ctx.fillRect(36, 52, 4, 4); ctx.fillRect(40, 52, 4, 4); ctx.fillRect(44, 52, 4, 4);
  ctx.fillStyle = skin; ctx.fillRect(32, 56, 16, 8);

  // Right leg
  ctx.fillStyle = pants; ctx.fillRect(4, 16, 4, 4); ctx.fillRect(8, 16, 4, 4);
  ctx.fillRect(0, 20, 4, 10); ctx.fillRect(4, 20, 4, 10); ctx.fillRect(8, 20, 4, 10); ctx.fillRect(12, 20, 4, 10);
  ctx.fillStyle = shoes; ctx.fillRect(0, 30, 16, 2);

  // Left leg
  ctx.fillStyle = pants; ctx.fillRect(20, 48, 4, 4); ctx.fillRect(24, 48, 4, 4);
  ctx.fillRect(16, 52, 4, 10); ctx.fillRect(20, 52, 4, 10); ctx.fillRect(24, 52, 4, 10); ctx.fillRect(28, 52, 4, 10);
  ctx.fillStyle = shoes; ctx.fillRect(16, 62, 16, 2);

  return canvas;
}

export class SkinRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    const glOpts = { alpha: true, antialias: true, preserveDrawingBuffer: Boolean(options.preserveDrawingBuffer) };
    this.gl = canvas.getContext('webgl', glOpts) || canvas.getContext('experimental-webgl', glOpts);
    this.isSupported = Boolean(this.gl);
    this.currentSkinImg = null;
    this.texture = null;
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.animFrame = null;
    this.lastTime = 0;

    if (!this.isSupported) {
      this.initFallback2D();
      return;
    }

    this.initGL();
    this.initGeometry();
    this.loadDefaultSkin();
    if (!options.static) {
      this.bindEvents();
      this.startLoop();
    } else {
      this.render(0);
    }
  }

  initGL() {
    const gl = this.gl;
    const vsSource = `
      attribute vec3 a_position;
      attribute vec2 a_texCoord;
      attribute vec3 a_normal;
      uniform mat4 u_mvp;
      uniform mat4 u_model;
      varying vec2 v_texCoord;
      varying float v_light;
      void main() {
        gl_Position = u_mvp * vec4(a_position, 1.0);
        v_texCoord = a_texCoord;
        // Directional lighting from upper front
        vec3 lightDir = normalize(vec3(0.4, 0.8, 0.6));
        vec3 norm = normalize((u_model * vec4(a_normal, 0.0)).xyz);
        float diff = max(dot(norm, lightDir), 0.0);
        v_light = 0.62 + 0.38 * diff;
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      varying float v_light;
      uniform sampler2D u_texture;
      void main() {
        vec4 col = texture2D(u_texture, v_texCoord);
        if (col.a < 0.1) discard;
        gl_FragColor = vec4(col.rgb * v_light, col.a);
      }
    `;

    function createShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, createShader(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(prog);
    this.program = prog;

    this.attribs = {
      position: gl.getAttribLocation(prog, 'a_position'),
      texCoord: gl.getAttribLocation(prog, 'a_texCoord'),
      normal: gl.getAttribLocation(prog, 'a_normal')
    };
    this.uniforms = {
      mvp: gl.getUniformLocation(prog, 'u_mvp'),
      model: gl.getUniformLocation(prog, 'u_model'),
      texture: gl.getUniformLocation(prog, 'u_texture')
    };

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  initGeometry() {
    const gl = this.gl;
    // Box specs for all body parts
    const parts = [
      // Head: 8x8x8, offset (0, 4, 0), pivot (0, 0, 0)
      { id: 'head', w: 8, h: 8, d: 8, pivot: [0, 0, 0], pos: [0, 4, 0],
        uv: { front: [8,8,8,8], back: [24,8,8,8], top: [8,0,8,8], bottom: [16,0,8,8], right: [0,8,8,8], left: [16,8,8,8] } },
      // Hat (overlay)
      { id: 'hat', w: 8, h: 8, d: 8, pivot: [0, 0, 0], pos: [0, 4, 0], expand: 0.5,
        uv: { front: [40,8,8,8], back: [56,8,8,8], top: [40,0,8,8], bottom: [48,0,8,8], right: [32,8,8,8], left: [48,8,8,8] } },

      // Torso: 8x12x4, pivot (0, 0, 0), pos (0, -6, 0)
      { id: 'torso', w: 8, h: 12, d: 4, pivot: [0, 0, 0], pos: [0, -6, 0],
        uv: { front: [20,20,8,12], back: [32,20,8,12], top: [20,16,8,4], bottom: [28,16,8,4], right: [16,20,4,12], left: [28,20,4,12] } },
      // Jacket (overlay)
      { id: 'jacket', w: 8, h: 12, d: 4, pivot: [0, 0, 0], pos: [0, -6, 0], expand: 0.45,
        uv: { front: [20,36,8,12], back: [32,36,8,12], top: [20,32,8,4], bottom: [28,32,8,4], right: [16,36,4,12], left: [28,36,4,12] } },

      // Right arm: 4x12x4, pivot (-6, -1, 0), pos (-6, -6, 0)
      { id: 'rightArm', w: 4, h: 12, d: 4, pivot: [-6, -1, 0], pos: [-6, -6, 0],
        uv: { front: [44,20,4,12], back: [52,20,4,12], top: [44,16,4,4], bottom: [48,16,4,4], right: [40,20,4,12], left: [48,20,4,12] } },
      // Right sleeve (overlay)
      { id: 'rightSleeve', w: 4, h: 12, d: 4, pivot: [-6, -1, 0], pos: [-6, -6, 0], expand: 0.4,
        uv: { front: [44,36,4,12], back: [52,36,4,12], top: [44,32,4,4], bottom: [48,32,4,4], right: [40,36,4,12], left: [48,36,4,12] } },

      // Left arm: 4x12x4, pivot (6, -1, 0), pos (6, -6, 0)
      { id: 'leftArm', w: 4, h: 12, d: 4, pivot: [6, -1, 0], pos: [6, -6, 0],
        uv: { front: [36,52,4,12], back: [44,52,4,12], top: [36,48,4,4], bottom: [40,48,4,4], right: [32,52,4,12], left: [40,52,4,12] } },
      // Left sleeve (overlay)
      { id: 'leftSleeve', w: 4, h: 12, d: 4, pivot: [6, -1, 0], pos: [6, -6, 0], expand: 0.4,
        uv: { front: [52,52,4,12], back: [60,52,4,12], top: [52,48,4,4], bottom: [56,48,4,4], right: [48,52,4,12], left: [56,52,4,12] } },

      // Right leg: 4x12x4, pivot (-2, -12, 0), pos (-2, -18, 0)
      { id: 'rightLeg', w: 4, h: 12, d: 4, pivot: [-2, -12, 0], pos: [-2, -18, 0],
        uv: { front: [4,20,4,12], back: [12,20,4,12], top: [4,16,4,4], bottom: [8,16,4,4], right: [0,20,4,12], left: [8,20,4,12] } },
      // Right pant (overlay)
      { id: 'rightPant', w: 4, h: 12, d: 4, pivot: [-2, -12, 0], pos: [-2, -18, 0], expand: 0.35,
        uv: { front: [4,36,4,12], back: [12,36,4,12], top: [4,32,4,4], bottom: [8,32,4,4], right: [0,36,4,12], left: [8,36,4,12] } },

      // Left leg: 4x12x4, pivot (2, -12, 0), pos (2, -18, 0)
      { id: 'leftLeg', w: 4, h: 12, d: 4, pivot: [2, -12, 0], pos: [2, -18, 0],
        uv: { front: [20,52,4,12], back: [28,52,4,12], top: [20,48,4,4], bottom: [24,48,4,4], right: [16,52,4,12], left: [24,52,4,12] } },
      // Left pant (overlay)
      { id: 'leftPant', w: 4, h: 12, d: 4, pivot: [2, -12, 0], pos: [2, -18, 0], expand: 0.35,
        uv: { front: [4,52,4,12], back: [12,52,4,12], top: [4,48,4,4], bottom: [8,48,4,4], right: [0,52,4,12], left: [8,52,4,12] } }
    ];

    this.meshes = parts.map(part => {
      const { vertices, indices } = buildBox(part.w, part.h, part.d, part.uv, part.expand || 0);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

      return {
        id: part.id,
        vbo,
        ibo,
        count: indices.length,
        pivot: part.pivot,
        pos: part.pos
      };
    });
  }

  loadDefaultSkin() {
    const steveCanvas = createDefaultSteveSkin();
    this.uploadTexture(steveCanvas);
  }

  uploadTexture(imageSource) {
    if (!this.gl) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource);
    this.render();
  }

  setSkin(skinDataUrl) {
    if (!skinDataUrl) {
      this.loadDefaultSkin();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.currentSkinImg = img;
      if (this.isSupported) {
        this.uploadTexture(img);
      } else {
        this.renderFallback(img);
      }
    };
    img.onerror = () => this.loadDefaultSkin();
    img.src = skinDataUrl;
  }

  bindEvents() {
    const stage = document.querySelector('.play-stage') || this.canvas;
    stage.addEventListener('pointermove', e => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.35;
      const dx = (e.clientX - cx) / (window.innerWidth * 0.4);
      const dy = (e.clientY - cy) / (window.innerHeight * 0.4);
      this.mouse.targetX = Math.max(-1, Math.min(1, dx));
      this.mouse.targetY = Math.max(-1, Math.min(1, dy));
    });
    stage.addEventListener('pointerleave', () => {
      this.mouse.targetX = 0;
      this.mouse.targetY = 0;
    });
  }

  initFallback2D() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.renderFallback();
  }

  renderFallback(img) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const source = img || createDefaultSteveSkin();
    // Render isometric or preview avatar in center of canvas
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(this.canvas.width / 2 - 40, this.canvas.height / 2 - 80);
    ctx.drawImage(source, 8, 8, 8, 8, 0, 0, 80, 80);
    ctx.drawImage(source, 40, 8, 8, 8, -4, -4, 88, 88);
    ctx.restore();
  }

  startLoop() {
    const renderFrame = time => {
      this.animFrame = requestAnimationFrame(renderFrame);
      if (document.body.classList.contains('no-animation')) {
        this.render(0);
        return;
      }
      this.render(time);
    };
    this.animFrame = requestAnimationFrame(renderFrame);
  }

  render(time = 0) {
    if (!this.gl) return;
    const gl = this.gl;

    // Smooth cursor interpolation
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.08;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.08;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);

    // Camera projection (FOV 38 deg)
    const aspect = this.canvas.width / this.canvas.height;
    const proj = mat4Perspective(mat4Create(), 38 * Math.PI / 180, aspect, 0.1, 200.0);

    // Global body stance & breathing
    const breath = Math.sin(time * 0.0022) * 0.035;
    const hover = Math.sin(time * 0.0022) * 0.5;

    // Base root position: centered, dynamic 3/4 turn towards viewer
    const rootMat = mat4Identity(mat4Create());
    mat4Translate(rootMat, rootMat, 0, 3.5 + hover, -58);
    mat4RotateX(rootMat, rootMat, (5 * Math.PI / 180) + this.mouse.y * 0.12);
    mat4RotateY(rootMat, rootMat, (-22 * Math.PI / 180) + this.mouse.x * 0.25);

    // Pose transformations for each limb:
    // Right Arm: confident action pose (forward, elbow out)
    // Left Arm: relaxed back, flared out
    // Right Leg: stepped forward
    // Left Leg: stepped back
    // Head: tilted directly at viewer with slight tilt
    const poses = {
      head: {
        rx: (-4 * Math.PI / 180) + this.mouse.y * 0.28,
        ry: (16 * Math.PI / 180) + this.mouse.x * 0.45,
        rz: 3 * Math.PI / 180
      },
      hat: {
        rx: (-4 * Math.PI / 180) + this.mouse.y * 0.28,
        ry: (16 * Math.PI / 180) + this.mouse.x * 0.45,
        rz: 3 * Math.PI / 180
      },
      torso: { rx: 1 * Math.PI / 180, ry: 0, rz: 0 },
      jacket: { rx: 1 * Math.PI / 180, ry: 0, rz: 0 },
      rightArm: {
        rx: (-32 * Math.PI / 180) + breath * 0.8,
        ry: -14 * Math.PI / 180,
        rz: -12 * Math.PI / 180
      },
      rightSleeve: {
        rx: (-32 * Math.PI / 180) + breath * 0.8,
        ry: -14 * Math.PI / 180,
        rz: -12 * Math.PI / 180
      },
      leftArm: {
        rx: (18 * Math.PI / 180) - breath * 0.6,
        ry: 2 * Math.PI / 180,
        rz: 11 * Math.PI / 180
      },
      leftSleeve: {
        rx: (18 * Math.PI / 180) - breath * 0.6,
        ry: 2 * Math.PI / 180,
        rz: 11 * Math.PI / 180
      },
      rightLeg: {
        rx: (-18 * Math.PI / 180),
        ry: -4 * Math.PI / 180,
        rz: -4 * Math.PI / 180
      },
      rightPant: {
        rx: (-18 * Math.PI / 180),
        ry: -4 * Math.PI / 180,
        rz: -4 * Math.PI / 180
      },
      leftLeg: {
        rx: (16 * Math.PI / 180),
        ry: 4 * Math.PI / 180,
        rz: 4 * Math.PI / 180
      },
      leftPant: {
        rx: (16 * Math.PI / 180),
        ry: 4 * Math.PI / 180,
        rz: 4 * Math.PI / 180
      }
    };

    const mvp = mat4Create();
    const model = mat4Create();

    for (const mesh of this.meshes) {
      const pose = poses[mesh.id] || { rx: 0, ry: 0, rz: 0 };

      // Model matrix = root * translate(pivot) * rotZ * rotX * rotY * translate(-pivot + pos)
      mat4Identity(model);
      mat4Multiply(model, rootMat, model);

      mat4Translate(model, model, mesh.pivot[0], mesh.pivot[1], mesh.pivot[2]);
      if (pose.rz) mat4RotateZ(model, model, pose.rz);
      if (pose.rx) mat4RotateX(model, model, pose.rx);
      if (pose.ry) mat4RotateY(model, model, pose.ry);
      mat4Translate(model, model, -mesh.pivot[0] + mesh.pos[0], -mesh.pivot[1] + mesh.pos[1], -mesh.pivot[2] + mesh.pos[2]);

      // MVP = proj * model
      mat4Multiply(mvp, proj, model);

      gl.uniformMatrix4fv(this.uniforms.mvp, false, mvp);
      gl.uniformMatrix4fv(this.uniforms.model, false, model);

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.enableVertexAttribArray(this.attribs.position);
      gl.vertexAttribPointer(this.attribs.position, 3, gl.FLOAT, false, 32, 0);

      gl.enableVertexAttribArray(this.attribs.texCoord);
      gl.vertexAttribPointer(this.attribs.texCoord, 2, gl.FLOAT, false, 32, 12);

      gl.enableVertexAttribArray(this.attribs.normal);
      gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, 32, 20);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}

let snapshotCanvas = null;
let snapshotRenderer = null;
const snapshotCache = new Map();

export async function renderSkinSnapshot(skinTextureUrl) {
  const cacheKey = skinTextureUrl || '__steve__';
  if (snapshotCache.has(cacheKey)) {
    return snapshotCache.get(cacheKey);
  }

  if (!snapshotCanvas) {
    snapshotCanvas = document.createElement('canvas');
    snapshotCanvas.width = 190;
    snapshotCanvas.height = 270;
    snapshotRenderer = new SkinRenderer(snapshotCanvas, { static: true, preserveDrawingBuffer: true });
  }

  if (!skinTextureUrl || skinTextureUrl === '__steve__' || skinTextureUrl === 'assets/skins/steve.png') {
    snapshotRenderer.loadDefaultSkin();
    snapshotRenderer.render(0);
    try {
      const data = snapshotCanvas.toDataURL('image/png');
      snapshotCache.set(cacheKey, data);
      return data;
    } catch {
      return null;
    }
  }

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      snapshotRenderer.uploadTexture(img);
      snapshotRenderer.render(0);
      try {
        const data = snapshotCanvas.toDataURL('image/png');
        snapshotCache.set(cacheKey, data);
        resolve(data);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      snapshotRenderer.loadDefaultSkin();
      snapshotRenderer.render(0);
      try {
        const data = snapshotCanvas.toDataURL('image/png');
        resolve(data);
      } catch {
        resolve(null);
      }
    };
    img.src = skinTextureUrl;
  });
}

const faceCache = new Map();

export async function extractFaceFromSkin(skinTextureUrl) {
  if (!skinTextureUrl) return null;
  if (faceCache.has(skinTextureUrl)) return faceCache.get(skinTextureUrl);

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 36;
      canvas.height = 36;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      // Head base (8,8,8,8)
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 36, 36);
      // Head hat overlay (40,8,8,8)
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 36, 36);
      try {
        const data = canvas.toDataURL('image/png');
        faceCache.set(skinTextureUrl, data);
        resolve(data);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = skinTextureUrl;
  });
}

