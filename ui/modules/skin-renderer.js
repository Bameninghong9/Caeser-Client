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
function mat4Copy(out, a) {
  for (let i = 0; i < 16; i++) out[i] = a[i];
  return out;
}
function mat4Scale(out, a, x, y, z) {
  out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
  out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
  out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
  out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
  return out;
}

function buildBoxExtents(gl, x0, x1, y0, y1, z0, z1, uvMap = null) {
  const uv = uvMap || {
    front: [0,0,1,1], back: [0,0,1,1],
    top: [0,0,1,1], bottom: [0,0,1,1],
    right: [0,0,1,1], left: [0,0,1,1]
  };
  const vertices = [];
  const indices = [];
  let vIndex = 0;

  function addFace(p0, p1, p2, p3, uvCoords, norm) {
    const [u, v, uw, vh] = uvCoords;
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
  addFace([x0,y1,z1], [x0,y0,z1], [x1,y0,z1], [x1,y1,z1], uv.front, [0, 0, 1]);
  // Back (-Z)
  addFace([x1,y1,z0], [x1,y0,z0], [x0,y0,z0], [x0,y1,z0], uv.back, [0, 0, -1]);
  // Top (+Y)
  addFace([x0,y1,z0], [x0,y1,z1], [x1,y1,z1], [x1,y1,z0], uv.top, [0, 1, 0]);
  // Bottom (-Y)
  addFace([x0,y0,z1], [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], uv.bottom, [0, -1, 0]);
  // Right (-X)
  addFace([x0,y1,z0], [x0,y0,z0], [x0,y0,z1], [x0,y1,z1], uv.right, [-1, 0, 0]);
  // Left (+X)
  addFace([x1,y1,z1], [x1,y0,z1], [x1,y0,z0], [x1,y1,z0], uv.left, [1, 0, 0]);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  return { vbo, ibo, count: indices.length };
}

function hexToRgb(hex, alpha = 1.0) {
  if (!hex || typeof hex !== 'string') return [1.0, 1.0, 1.0, alpha];
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return [1.0, 1.0, 1.0, alpha];
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
    alpha
  ];
}

function buildBoxMesh(gl, width, height, depth, expand = 0) {
  const dummyUv = { front: [0,0,1,1], back: [0,0,1,1], top: [0,0,1,1], bottom: [0,0,1,1], right: [0,0,1,1], left: [0,0,1,1] };
  const { vertices, indices } = buildBox(width, height, depth, dummyUv, expand);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  return { vbo, ibo, count: indices.length };
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
    this.cosmetics = options.cosmetics || {
      wings: { type: 'none', color: '#a855f7' },
      head: { type: 'none', color: '#facc15' },
      pet: { type: 'none', color: '#38bdf8' }
    };
    this.drag = { active: false, lastX: 0, lastY: 0, rotX: 0, rotY: 0 };
    const glOpts = { alpha: true, antialias: true, preserveDrawingBuffer: Boolean(options.preserveDrawingBuffer) };
    this.gl = canvas.getContext('webgl', glOpts) || canvas.getContext('experimental-webgl', glOpts);
    this.isSupported = Boolean(this.gl);
    this.currentSkinImg = null;
    this.texture = null;
    this.petTexture = null;
    this.currentPetSkinUrl = null;
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

  setCosmetics(cosmetics) {
    if (!cosmetics) return;
    this.cosmetics = {
      wings: { type: cosmetics.wings?.type || 'none', color: cosmetics.wings?.color || '#a855f7' },
      head: { type: cosmetics.head?.type || 'none', color: cosmetics.head?.color || '#facc15' },
      pet: {
        type: cosmetics.pet?.type || 'none',
        color: cosmetics.pet?.color || '#38bdf8',
        customPlayer: cosmetics.pet?.customPlayer || '',
        customSkinUrl: cosmetics.pet?.customSkinUrl || ''
      }
    };
    const isChibiPet = ['self', 'custom', 'minime_sit', 'minime_head', 'minime_hand', 'minime_chain'].includes(this.cosmetics.pet.type);
    if (isChibiPet && this.cosmetics.pet.customSkinUrl) {
      if (this.currentPetSkinUrl !== this.cosmetics.pet.customSkinUrl) {
        this.setPetSkin(this.cosmetics.pet.customSkinUrl);
      }
    } else if (!isChibiPet || !this.cosmetics.pet.customSkinUrl) {
      this.currentPetSkinUrl = null;
      this.petTexture = null;
    }
    if (this.options?.static) this.render(0);
  }

  setPetSkin(skinDataUrl) {
    if (!skinDataUrl) {
      this.petTexture = null;
      this.currentPetSkinUrl = null;
      return;
    }
    this.currentPetSkinUrl = skinDataUrl;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.uploadPetTexture(img);
    };
    img.src = skinDataUrl;
  }

  uploadPetTexture(imageSource) {
    if (!this.gl) return;
    const gl = this.gl;
    if (!this.petTexture) {
      this.petTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.petTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.texture) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
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
      uniform float u_useCustomColor;
      uniform vec4 u_customColor;
      void main() {
        if (u_useCustomColor > 0.5) {
          gl_FragColor = vec4(u_customColor.rgb * v_light, u_customColor.a);
          return;
        }
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
      texture: gl.getUniformLocation(prog, 'u_texture'),
      useCustomColor: gl.getUniformLocation(prog, 'u_useCustomColor'),
      customColor: gl.getUniformLocation(prog, 'u_customColor')
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

    // Pre-create 3D cosmetic meshes
    this.cosmeticMeshes = {
      // Angel Wings: hinge at (0, 0, 0), extends +X
      angelBone1: buildBoxExtents(gl, 0, 7.5, 0, 2.8, -0.6, 0.6),
      angelBone2: buildBoxExtents(gl, 7.0, 14.0, -3.5, 2.2, -0.5, 0.5),
      angelFeatherLong: buildBoxExtents(gl, 6.0, 16.5, -14.0, -1.0, -0.3, 0.3),
      angelFeatherMid: buildBoxExtents(gl, 3.0, 11.5, -10.5, 0.5, -0.35, 0.35),
      angelFeatherShort: buildBoxExtents(gl, 0.5, 6.5, -6.5, 1.0, -0.4, 0.4),

      // Dragon Wings: hinge at (0, 0, 0), extends +X
      dragonArm: buildBoxExtents(gl, 0, 7.5, 0, 4.5, -0.7, 0.7),
      dragonSpike: buildBoxExtents(gl, 6.5, 8.2, 4.2, 8.2, -0.5, 0.5),
      dragonRibTop: buildBoxExtents(gl, 7.0, 15.5, 2.0, 5.0, -0.5, 0.5),
      dragonRibMid: buildBoxExtents(gl, 7.0, 14.5, -2.8, 0.5, -0.5, 0.5),
      dragonRibBot: buildBoxExtents(gl, 5.0, 11.0, -8.0, -3.5, -0.5, 0.5),
      dragonWebTop: buildBoxExtents(gl, 2.5, 14.5, 0.2, 3.5, -0.2, 0.2),
      dragonWebBot: buildBoxExtents(gl, 2.0, 12.5, -6.2, -0.5, -0.2, 0.2),

      // Halo (ring)
      haloBarFB: buildBoxMesh(gl, 8, 0.8, 0.8),
      haloBarLR: buildBoxMesh(gl, 0.8, 0.8, 8),
      // Horns
      hornBase: buildBoxMesh(gl, 1.6, 2.4, 1.6),
      hornMid: buildBoxMesh(gl, 1.3, 2.6, 1.3),
      hornTip: buildBoxMesh(gl, 1.0, 2.2, 1.0),
      // Pet Cube
      petCube: buildBoxMesh(gl, 3.8, 3.8, 3.8),
      petOrbiter: buildBoxMesh(gl, 1.3, 1.3, 1.3),
      // Pet Ghost
      ghostHead: buildBoxMesh(gl, 3.8, 4.0, 3.8),
      ghostBody: buildBoxMesh(gl, 2.6, 2.6, 2.6),
      ghostTail: buildBoxMesh(gl, 1.6, 1.8, 1.6)
    };

    // Pre-create Chibi Mini-Player for Shoulder Pet (Self skin or Custom Player skin)
    const miniParts = [
      { id: 'miniHead', w: 4.6, h: 4.6, d: 4.6, pivot: [0, 0, 0], pos: [0, 3.2, 0],
        uv: { front: [8,8,8,8], back: [24,8,8,8], top: [8,0,8,8], bottom: [16,0,8,8], right: [0,8,8,8], left: [16,8,8,8] } },
      { id: 'miniHat', w: 4.6, h: 4.6, d: 4.6, pivot: [0, 0, 0], pos: [0, 3.2, 0], expand: 0.32,
        uv: { front: [40,8,8,8], back: [56,8,8,8], top: [40,0,8,8], bottom: [48,0,8,8], right: [32,8,8,8], left: [48,8,8,8] } },

      { id: 'miniTorso', w: 3.8, h: 4.8, d: 2.2, pivot: [0, 0, 0], pos: [0, -1.6, 0],
        uv: { front: [20,20,8,12], back: [32,20,8,12], top: [20,16,8,4], bottom: [28,16,8,4], right: [16,20,4,12], left: [28,20,4,12] } },
      { id: 'miniJacket', w: 3.8, h: 4.8, d: 2.2, pivot: [0, 0, 0], pos: [0, -1.6, 0], expand: 0.26,
        uv: { front: [20,36,8,12], back: [32,36,8,12], top: [20,32,8,4], bottom: [28,32,8,4], right: [16,36,4,12], left: [28,36,4,12] } },

      { id: 'miniRightArm', w: 1.8, h: 4.5, d: 1.8, pivot: [-2.6, 0.4, 0], pos: [-2.6, -1.6, 0],
        uv: { front: [44,20,4,12], back: [52,20,4,12], top: [44,16,4,4], bottom: [48,16,4,4], right: [40,20,4,12], left: [48,20,4,12] } },
      { id: 'miniRightSleeve', w: 1.8, h: 4.5, d: 1.8, pivot: [-2.6, 0.4, 0], pos: [-2.6, -1.6, 0], expand: 0.2,
        uv: { front: [44,36,4,12], back: [52,36,4,12], top: [44,32,4,4], bottom: [48,32,4,4], right: [40,36,4,12], left: [48,36,4,12] } },

      { id: 'miniLeftArm', w: 1.8, h: 4.5, d: 1.8, pivot: [2.6, 0.4, 0], pos: [2.6, -1.6, 0],
        uv: { front: [36,52,4,12], back: [44,52,4,12], top: [36,48,4,4], bottom: [40,48,4,4], right: [32,52,4,12], left: [40,52,4,12] } },
      { id: 'miniLeftSleeve', w: 1.8, h: 4.5, d: 1.8, pivot: [2.6, 0.4, 0], pos: [2.6, -1.6, 0], expand: 0.2,
        uv: { front: [52,52,4,12], back: [60,52,4,12], top: [52,48,4,4], bottom: [56,48,4,4], right: [48,52,4,12], left: [56,52,4,12] } },

      { id: 'miniRightLeg', w: 1.8, h: 4.5, d: 1.8, pivot: [-0.9, -3.9, 0], pos: [-0.9, -6.1, 0],
        uv: { front: [4,20,4,12], back: [12,20,4,12], top: [4,16,4,4], bottom: [8,16,4,4], right: [0,20,4,12], left: [8,20,4,12] } },
      { id: 'miniRightPant', w: 1.8, h: 4.5, d: 1.8, pivot: [-0.9, -3.9, 0], pos: [-0.9, -6.1, 0], expand: 0.2,
        uv: { front: [4,36,4,12], back: [12,36,4,12], top: [4,32,4,4], bottom: [8,32,4,4], right: [0,36,4,12], left: [8,36,4,12] } },

      { id: 'miniLeftLeg', w: 1.8, h: 4.5, d: 1.8, pivot: [0.9, -3.9, 0], pos: [0.9, -6.1, 0],
        uv: { front: [20,52,4,12], back: [28,52,4,12], top: [20,48,4,4], bottom: [24,48,4,4], right: [16,52,4,12], left: [24,52,4,12] } },
      { id: 'miniLeftPant', w: 1.8, h: 4.5, d: 1.8, pivot: [0.9, -3.9, 0], pos: [0.9, -6.1, 0], expand: 0.2,
        uv: { front: [4,52,4,12], back: [12,52,4,12], top: [4,48,4,4], bottom: [8,48,4,4], right: [0,52,4,12], left: [8,52,4,12] } }
    ];

    this.miniMeshes = miniParts.map(part => {
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
    const stage = this.canvas.closest('.play-stage') || this.canvas.closest('.cosmetics-preview-panel') || document.querySelector('.play-stage') || this.canvas;
    stage.addEventListener('pointermove', e => {
      if (this.drag.active) return;
      const rect = this.canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.35;
      const dx = (e.clientX - cx) / (window.innerWidth * 0.4);
      const dy = (e.clientY - cy) / (window.innerHeight * 0.4);
      this.mouse.targetX = Math.max(-1, Math.min(1, dx));
      this.mouse.targetY = Math.max(-1, Math.min(1, dy));
    });
    stage.addEventListener('pointerleave', () => {
      if (this.drag.active) return;
      this.mouse.targetX = 0;
      this.mouse.targetY = 0;
    });

    if (this.canvas.id === 'player-skin-canvas' || this.options.draggable === false) {
      // Home screen skin is locked and cannot be dragged or pushed around
      return;
    }

    this.canvas.addEventListener('pointerdown', e => {
      this.drag.active = true;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
      try { this.canvas.setPointerCapture?.(e.pointerId); } catch {}
    });
    window.addEventListener('pointermove', e => {
      if (!this.drag.active) return;
      const dx = e.clientX - this.drag.lastX;
      const dy = e.clientY - this.drag.lastY;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
      this.drag.rotY += dx * 0.015;
      this.drag.rotX = Math.max(-0.6, Math.min(0.6, this.drag.rotX + dy * 0.01));
    });
    window.addEventListener('pointerup', () => {
      if (this.drag.active) {
        this.drag.active = false;
      }
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
    stage.addEventListener('pointerenter', () => {
      this.resume();
    });
    ctx.restore();
  }

  startLoop() {
    this.paused = false;
    this.lastFrameTime = 0;

    const renderFrame = time => {
      this.animFrame = null;

      // Skip render if document is hidden, canvas is detached or not displayed
      if (document.hidden || this.paused || !this.canvas.isConnected || this.canvas.offsetParent === null) {
        return;
      }

      // If window is not focused and user is not dragging, render single frame and sleep
      if (!document.hasFocus() && !this.drag.active) {
        this.render(time);
        return;
      }

      // Cap at ~30 FPS to avoid burning GPU/CPU on monitor refresh rates of 144Hz/240Hz
      if (time - this.lastFrameTime < 33) {
        this.animFrame = requestAnimationFrame(renderFrame);
        return;
      }
      this.lastFrameTime = time;

      if (document.body.classList.contains('no-animation')) {
        this.render(0);
        return;
      }
      this.render(time);
      this.animFrame = requestAnimationFrame(renderFrame);
    };

    this._renderFrame = renderFrame;

    const onVisibilityChange = () => {
      if (document.hidden) {
        this.pause();
      } else {
        this.resume();
      }
    };
    const onWindowBlur = () => {
      this.pause();
    };
    const onWindowFocus = () => {
      this.resume();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);

    this._visibilityHandler = onVisibilityChange;
    this._blurHandler = onWindowBlur;
    this._focusHandler = onWindowFocus;

    this.resume();
  }

  pause() {
    this.paused = true;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  resume() {
    this.paused = false;
    if (!this.animFrame && this._renderFrame) {
      this.animFrame = requestAnimationFrame(this._renderFrame);
    }
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
    mat4RotateX(rootMat, rootMat, (5 * Math.PI / 180) + this.mouse.y * 0.12 + this.drag.rotX);
    mat4RotateY(rootMat, rootMat, (-22 * Math.PI / 180) + this.mouse.x * 0.25 + this.drag.rotY);

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
    let torsoMat = null;
    let headMat = null;

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

      if (mesh.id === 'torso') torsoMat = mat4Copy(mat4Create(), model);
      if (mesh.id === 'head') headMat = mat4Copy(mat4Create(), model);

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

    // Render 3D Cosmetics if active
    if (this.cosmetics && this.cosmeticMeshes) {
      gl.disable(gl.CULL_FACE); // Two-sided rendering for wings and accessories
      gl.uniform1f(this.uniforms.useCustomColor, 1.0);

      const drawPart = (mesh, pMat, col) => {
        if (!mesh) return;
        if (col) {
          gl.uniform4f(this.uniforms.customColor, col[0], col[1], col[2], col[3] ?? 1.0);
        }
        mat4Multiply(mvp, proj, pMat);
        gl.uniformMatrix4fv(this.uniforms.mvp, false, mvp);
        gl.uniformMatrix4fv(this.uniforms.model, false, pMat);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
        gl.enableVertexAttribArray(this.attribs.position);
        gl.vertexAttribPointer(this.attribs.position, 3, gl.FLOAT, false, 32, 0);

        gl.enableVertexAttribArray(this.attribs.texCoord);
        gl.vertexAttribPointer(this.attribs.texCoord, 2, gl.FLOAT, false, 32, 12);

        gl.enableVertexAttribArray(this.attribs.normal);
        gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, 32, 20);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      };

      // 1. Wings (Flügel) - Removed as requested
      const wingType = 'none';
      if ((wingType === 'angel' || wingType === 'dragon') && torsoMat) {
        const flap = Math.sin(time * 0.0048);

        if (wingType === 'angel') {
          // Radiant golden feather tones (matching gold_wings):
          const cBone1 = [0.98, 0.82, 0.22, 1.0];
          const cBone2 = [0.92, 0.72, 0.16, 1.0];
          const cFeatherLong = [1.00, 0.88, 0.30, 0.98];
          const cFeatherMid = [0.95, 0.78, 0.20, 0.96];
          const cFeatherShort = [0.88, 0.68, 0.14, 0.95];

          // Left Angel Wing
          const lw = mat4Copy(mat4Create(), torsoMat);
          mat4Translate(lw, lw, 1.5, 2.5, -2.2);
          mat4RotateY(lw, lw, 0.35 + flap * 0.45);
          mat4RotateZ(lw, lw, -0.12 - Math.abs(flap) * 0.1);

          drawPart(this.cosmeticMeshes.angelBone1, lw, cBone1);
          drawPart(this.cosmeticMeshes.angelBone2, lw, cBone2);
          drawPart(this.cosmeticMeshes.angelFeatherLong, lw, cFeatherLong);
          drawPart(this.cosmeticMeshes.angelFeatherMid, lw, cFeatherMid);
          drawPart(this.cosmeticMeshes.angelFeatherShort, lw, cFeatherShort);

          // Right Angel Wing
          const rw = mat4Copy(mat4Create(), torsoMat);
          mat4Translate(rw, rw, -1.5, 2.5, -2.2);
          mat4RotateY(rw, rw, -0.35 - flap * 0.45);
          mat4RotateZ(rw, rw, 0.12 + Math.abs(flap) * 0.1);
          mat4Scale(rw, rw, -1, 1, 1);

          drawPart(this.cosmeticMeshes.angelBone1, rw, cBone1);
          drawPart(this.cosmeticMeshes.angelBone2, rw, cBone2);
          drawPart(this.cosmeticMeshes.angelFeatherLong, rw, cFeatherLong);
          drawPart(this.cosmeticMeshes.angelFeatherMid, rw, cFeatherMid);
          drawPart(this.cosmeticMeshes.angelFeatherShort, rw, cFeatherShort);
        } else if (wingType === 'dragon') {
          // Authentic Ender Dragon skeletal bones and deep purple membrane:
          const cArm = [0.10, 0.10, 0.12, 1.0];
          const cSpike = [0.30, 0.30, 0.34, 1.0];
          const cRib = [0.15, 0.15, 0.18, 1.0];
          const cWebTop = [0.36, 0.11, 0.52, 0.92];
          const cWebBot = [0.24, 0.05, 0.38, 0.92];

          // Left Dragon Wing
          const lw = mat4Copy(mat4Create(), torsoMat);
          mat4Translate(lw, lw, 1.5, 2.5, -2.2);
          mat4RotateY(lw, lw, 0.38 + flap * 0.52);
          mat4RotateZ(lw, lw, -0.15 - Math.abs(flap) * 0.12);

          drawPart(this.cosmeticMeshes.dragonArm, lw, cArm);
          drawPart(this.cosmeticMeshes.dragonSpike, lw, cSpike);
          drawPart(this.cosmeticMeshes.dragonRibTop, lw, cRib);
          drawPart(this.cosmeticMeshes.dragonRibMid, lw, cRib);
          drawPart(this.cosmeticMeshes.dragonRibBot, lw, cRib);
          drawPart(this.cosmeticMeshes.dragonWebTop, lw, cWebTop);
          drawPart(this.cosmeticMeshes.dragonWebBot, lw, cWebBot);

          // Right Dragon Wing
          const rw = mat4Copy(mat4Create(), torsoMat);
          mat4Translate(rw, rw, -1.5, 2.5, -2.2);
          mat4RotateY(rw, rw, -0.38 - flap * 0.52);
          mat4RotateZ(rw, rw, 0.15 + Math.abs(flap) * 0.12);
          mat4Scale(rw, rw, -1, 1, 1);

          drawPart(this.cosmeticMeshes.dragonArm, rw, cArm);
          drawPart(this.cosmeticMeshes.dragonSpike, rw, cSpike);
          drawPart(this.cosmeticMeshes.dragonRibTop, rw, cRib);
          drawPart(this.cosmeticMeshes.dragonRibMid, rw, cRib);
          drawPart(this.cosmeticMeshes.dragonRibBot, rw, cRib);
          drawPart(this.cosmeticMeshes.dragonWebTop, rw, cWebTop);
          drawPart(this.cosmeticMeshes.dragonWebBot, rw, cWebBot);
        }
      }

      // 2. Head Accessories (Halo & Horns)
      const headType = this.cosmetics.head?.type;
      if (headType === 'halo' && headMat) {
        // Radiant golden celestial sheen:
        const cHaloFB = [0.98, 0.80, 0.10, 1.0];
        const cHaloLR = [1.0, 0.88, 0.25, 1.0];

        const floatBob = Math.sin(time * 0.0032) * 0.6;
        const hm = mat4Copy(mat4Create(), headMat);
        mat4Translate(hm, hm, 0, 9.8 + floatBob, 0);
        mat4RotateY(hm, hm, time * 0.0016);
        mat4RotateX(hm, hm, 0.12);

        const fb1 = mat4Copy(mat4Create(), hm);
        mat4Translate(fb1, fb1, 0, 0, 4.0);
        drawPart(this.cosmeticMeshes.haloBarFB, fb1, cHaloFB);

        const fb2 = mat4Copy(mat4Create(), hm);
        mat4Translate(fb2, fb2, 0, 0, -4.0);
        drawPart(this.cosmeticMeshes.haloBarFB, fb2, cHaloFB);

        const lr1 = mat4Copy(mat4Create(), hm);
        mat4Translate(lr1, lr1, -4.0, 0, 0);
        drawPart(this.cosmeticMeshes.haloBarLR, lr1, cHaloLR);

        const lr2 = mat4Copy(mat4Create(), hm);
        mat4Translate(lr2, lr2, 4.0, 0, 0);
        drawPart(this.cosmeticMeshes.haloBarLR, lr2, cHaloLR);
      } else if (headType === 'horns' && headMat) {
        // Authentic demonic horns fading from obsidian black to crimson to molten tips:
        const cHornBase = [0.10, 0.10, 0.12, 1.0];
        const cHornMid = [0.65, 0.12, 0.12, 1.0];
        const cHornTip = [0.98, 0.42, 0.08, 1.0];

        // Left horn
        const lh = mat4Copy(mat4Create(), headMat);
        mat4Translate(lh, lh, -3.2, 8.2, 2.0);
        mat4RotateZ(lh, lh, -0.28);
        mat4RotateX(lh, lh, -0.2);
        drawPart(this.cosmeticMeshes.hornBase, lh, cHornBase);

        const lm = mat4Copy(mat4Create(), lh);
        mat4Translate(lm, lm, -0.7, 2.2, -0.6);
        mat4RotateZ(lm, lm, -0.22);
        drawPart(this.cosmeticMeshes.hornMid, lm, cHornMid);

        const lt = mat4Copy(mat4Create(), lm);
        mat4Translate(lt, lt, -0.5, 2.1, -0.5);
        mat4RotateZ(lt, lt, -0.2);
        drawPart(this.cosmeticMeshes.hornTip, lt, cHornTip);

        // Right horn
        const rh = mat4Copy(mat4Create(), headMat);
        mat4Translate(rh, rh, 3.2, 8.2, 2.0);
        mat4RotateZ(rh, rh, 0.28);
        mat4RotateX(rh, rh, -0.2);
        drawPart(this.cosmeticMeshes.hornBase, rh, cHornBase);

        const rm = mat4Copy(mat4Create(), rh);
        mat4Translate(rm, rm, 0.7, 2.2, -0.6);
        mat4RotateZ(rm, rm, 0.22);
        drawPart(this.cosmeticMeshes.hornMid, rm, cHornMid);

        const rt = mat4Copy(mat4Create(), rm);
        mat4Translate(rt, rt, 0.5, 2.1, -0.5);
        mat4RotateZ(rt, rt, 0.2);
        drawPart(this.cosmeticMeshes.hornTip, rt, cHornTip);
      }

      // 3. Pet / Companion (MiniMe Sit, Head, Hand, Chain)
      const petType = this.cosmetics.pet?.type;
      const isChibi = ['self', 'custom', 'minime_sit', 'minime_head', 'minime_hand', 'minime_chain'].includes(petType);
      if (isChibi) {
        gl.uniform1f(this.uniforms.useCustomColor, 0.0);
        if (this.petTexture) {
          gl.bindTexture(gl.TEXTURE_2D, this.petTexture);
        } else {
          gl.bindTexture(gl.TEXTURE_2D, this.texture);
        }

        const pm = mat4Copy(mat4Create(), rootMat);

        let petPoses;
        if (petType === 'minime_head') {
          // Perched on top center of the head
          mat4Translate(pm, pm, 0.0, 10.2, 0.0);
          petPoses = {
            miniHead: { rx: -0.05 + Math.sin(time * 0.0022) * 0.05, ry: Math.sin(time * 0.0018) * 0.12, rz: 0.0 },
            miniHat: { rx: -0.05 + Math.sin(time * 0.0022) * 0.05, ry: Math.sin(time * 0.0018) * 0.12, rz: 0.0 },
            miniTorso: { rx: 0.05, ry: 0, rz: 0 },
            miniJacket: { rx: 0.05, ry: 0, rz: 0 },
            miniRightArm: { rx: -0.35, ry: 0.1, rz: -0.15 },
            miniRightSleeve: { rx: -0.35, ry: 0.1, rz: -0.15 },
            miniLeftArm: { rx: -0.35, ry: -0.1, rz: 0.15 },
            miniLeftSleeve: { rx: -0.35, ry: -0.1, rz: 0.15 },
            miniRightLeg: { rx: -1.22, ry: -0.05, rz: -0.05 },
            miniRightPant: { rx: -1.22, ry: -0.05, rz: -0.05 },
            miniLeftLeg: { rx: -1.22, ry: 0.05, rz: 0.05 },
            miniLeftPant: { rx: -1.22, ry: 0.05, rz: 0.05 }
          };
        } else if (petType === 'minime_hand') {
          // Dangling from player's left hand
          mat4Translate(pm, pm, 6.2, -6.5, 0.2);
          petPoses = {
            miniHead: { rx: -0.35, ry: 0, rz: 0 },
            miniHat: { rx: -0.35, ry: 0, rz: 0 },
            miniTorso: { rx: 0.0, ry: 0, rz: 0 },
            miniJacket: { rx: 0.0, ry: 0, rz: 0 },
            miniRightArm: { rx: 2.85, ry: -0.1, rz: -0.15 },
            miniRightSleeve: { rx: 2.85, ry: -0.1, rz: -0.15 },
            miniLeftArm: { rx: 2.85, ry: 0.1, rz: 0.15 },
            miniLeftSleeve: { rx: 2.85, ry: 0.1, rz: 0.15 },
            miniRightLeg: { rx: 0.12, ry: 0.05, rz: 0.0 },
            miniRightPant: { rx: 0.12, ry: 0.05, rz: 0.0 },
            miniLeftLeg: { rx: -0.08, ry: -0.05, rz: 0.0 },
            miniLeftPant: { rx: -0.08, ry: -0.05, rz: 0.0 }
          };
        } else if (petType === 'minime_chain') {
          // Pendant hanging in center of chest
          mat4Translate(pm, pm, 0.0, 0.8, 2.4);
          petPoses = {
            miniHead: { rx: -0.08, ry: 0, rz: 0 },
            miniHat: { rx: -0.08, ry: 0, rz: 0 },
            miniTorso: { rx: 0.0, ry: 0, rz: 0 },
            miniJacket: { rx: 0.0, ry: 0, rz: 0 },
            miniRightArm: { rx: 2.75, ry: -0.10, rz: -0.32 },
            miniRightSleeve: { rx: 2.75, ry: -0.10, rz: -0.32 },
            miniLeftArm: { rx: 2.75, ry: 0.10, rz: 0.32 },
            miniLeftSleeve: { rx: 2.75, ry: 0.10, rz: 0.32 },
            miniRightLeg: { rx: 0.05, ry: 0.05, rz: 0.0 },
            miniRightPant: { rx: 0.05, ry: 0.05, rz: 0.0 },
            miniLeftLeg: { rx: -0.05, ry: -0.05, rz: 0.0 },
            miniLeftPant: { rx: -0.05, ry: -0.05, rz: 0.0 }
          };
        } else {
          // minime_sit (or self / custom): Stable on right shoulder, no floating hover bob, shifted away from head!
          mat4Translate(pm, pm, -7.2, 1.8, 0.0);
          petPoses = {
            miniHead: {
              rx: -0.05 + Math.sin(time * 0.0022) * 0.08,
              ry: 0.35 + Math.sin(time * 0.0018) * 0.15,
              rz: -0.08
            },
            miniHat: {
              rx: -0.05 + Math.sin(time * 0.0022) * 0.08,
              ry: 0.35 + Math.sin(time * 0.0018) * 0.15,
              rz: -0.08
            },
            miniTorso: { rx: 0.06, ry: 0.05, rz: 0 },
            miniJacket: { rx: 0.06, ry: 0.05, rz: 0 },
            miniRightArm: { rx: -0.35, ry: 0.1, rz: -0.15 },
            miniRightSleeve: { rx: -0.35, ry: 0.1, rz: -0.15 },
            miniLeftArm: { rx: -0.35, ry: -0.1, rz: 0.15 },
            miniLeftSleeve: { rx: -0.35, ry: -0.1, rz: 0.15 },
            miniRightLeg: { rx: -1.22, ry: -0.05, rz: -0.05 },
            miniRightPant: { rx: -1.22, ry: -0.05, rz: -0.05 },
            miniLeftLeg: { rx: -1.22, ry: 0.05, rz: 0.05 },
            miniLeftPant: { rx: -1.22, ry: 0.05, rz: 0.05 }
          };
        }

        if (this.miniMeshes) {
          for (const mesh of this.miniMeshes) {
            const pose = petPoses[mesh.id] || { rx: 0, ry: 0, rz: 0 };
            const m = mat4Copy(mat4Create(), pm);
            mat4Translate(m, m, mesh.pivot[0], mesh.pivot[1], mesh.pivot[2]);
            if (pose.rz) mat4RotateZ(m, m, pose.rz);
            if (pose.rx) mat4RotateX(m, m, pose.rx);
            if (pose.ry) mat4RotateY(m, m, pose.ry);
            mat4Translate(m, m, -mesh.pivot[0] + mesh.pos[0], -mesh.pivot[1] + mesh.pos[1], -mesh.pivot[2] + mesh.pos[2]);
            drawPart(mesh, m);
          }
        }
        // Restore texture
        if (this.texture) gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1f(this.uniforms.useCustomColor, 1.0);
      } else if (petType === 'cube' || petType === 'ghost') {
        const petRgb = hexToRgb(this.cosmetics.pet.color || '#38bdf8');
        gl.uniform4f(this.uniforms.customColor, petRgb[0], petRgb[1], petRgb[2], 0.95);

        const pm = mat4Copy(mat4Create(), rootMat);
        const hoverY = Math.sin(time * 0.0035) * 1.3;
        const swayX = Math.cos(time * 0.0022) * 0.7;
        mat4Translate(pm, pm, -9.5 + swayX, 2.0 + hoverY, 3.0 + swayX * 0.5);

        if (petType === 'cube') {
          mat4RotateY(pm, pm, time * 0.0025);
          mat4RotateX(pm, pm, Math.sin(time * 0.003) * 0.18);
          drawPart(this.cosmeticMeshes.petCube, pm);

          // Little satellite orbiter
          const orb = mat4Copy(mat4Create(), pm);
          mat4Translate(orb, orb, Math.cos(time * 0.006) * 3.4, Math.sin(time * 0.006) * 1.8, Math.sin(time * 0.006) * 3.4);
          drawPart(this.cosmeticMeshes.petOrbiter, orb);
        } else if (petType === 'ghost') {
          mat4RotateY(pm, pm, Math.sin(time * 0.002) * 0.3);
          mat4RotateZ(pm, pm, Math.sin(time * 0.003) * 0.1);
          drawPart(this.cosmeticMeshes.ghostHead, pm);

          const gb = mat4Copy(mat4Create(), pm);
          mat4Translate(gb, gb, 0, -2.6, 0);
          drawPart(this.cosmeticMeshes.ghostBody, gb);

          const gt = mat4Copy(mat4Create(), pm);
          mat4Translate(gt, gt, 0, -4.4, Math.sin(time * 0.005) * 0.4);
          drawPart(this.cosmeticMeshes.ghostTail, gt);
        }
      }

      gl.enable(gl.CULL_FACE);
      gl.uniform1f(this.uniforms.useCustomColor, 0.0);
    }
  }

  destroy() {
    this.pause();
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    if (this._blurHandler) {
      window.removeEventListener('blur', this._blurHandler);
      this._blurHandler = null;
    }
    if (this._focusHandler) {
      window.removeEventListener('focus', this._focusHandler);
      this._focusHandler = null;
    }
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

