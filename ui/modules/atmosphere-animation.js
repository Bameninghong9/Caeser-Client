/**
 * Universal Launcher Atmosphere Animation
 * Rich dynamic canvas animations for all themes:
 * - Cosmic Nebula: Swirling, breathing galactic gas clouds & floating radiant stardust
 * - Cyber Grid: 3D perspective infinite rolling synthwave wireframe highway + horizon neon glow & digital data particles
 * - Starry Space: Multi-directional drifting stars + realistic shooting stars (Sternschnuppen)
 * - Rain: Multi-layered atmospheric falling rain with wind slant, ground splash ripples, and gentle sheet lightning
 */
export function initAtmosphereAnimation() {
  const canvas = document.getElementById('space-canvas') || document.getElementById('atmosphere-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  let animFrameId = null;
  let isRunning = false;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let currentAtmo = 'nebula';

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  // --- 1. Cosmic Nebula State ---
  const NEBULA_STAR_COUNT = 75;
  const nebulaStars = [];
  let nebulaTime = 0;

  function initNebula() {
    nebulaStars.length = 0;
    for (let i = 0; i < NEBULA_STAR_COUNT; i++) {
      nebulaStars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: randomRange(0.8, 2.5),
        vx: randomRange(-0.15, 0.15),
        vy: randomRange(-0.15, 0.15),
        alpha: randomRange(0.25, 0.85),
        twinkleSpeed: randomRange(0.015, 0.04),
        twinklePhase: Math.random() * Math.PI * 2,
        color: Math.random() > 0.6 ? '168, 85, 247' : (Math.random() > 0.3 ? '99, 102, 241' : '217, 70, 239')
      });
    }
  }

  // --- 2. Cyber Grid State (3D Perspective Synthwave Highway) ---
  let gridOffset = 0;
  const CYBER_PARTICLE_COUNT = 35;
  const cyberParticles = [];

  function initCyberParticles() {
    cyberParticles.length = 0;
    for (let i = 0; i < CYBER_PARTICLE_COUNT; i++) {
      cyberParticles.push({
        x: Math.random() * width,
        y: randomRange(height * 0.2, height * 0.85),
        size: randomRange(1.5, 3.5),
        vy: -randomRange(0.4, 1.4),
        vx: randomRange(-0.25, 0.25),
        alpha: randomRange(0.3, 0.8),
        color: Math.random() > 0.5 ? '0, 240, 255' : '178, 60, 238'
      });
    }
  }

  // --- 3. Starry Space State ---
  const STAR_COUNT = 130;
  const stars = [];
  const shootingStars = [];
  let nextShootingStarTime = Date.now() + 3000;

  function createStar(randomInitial = false) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomRange(0.06, 0.22);
    const colorType = Math.random();
    let colorRgb = '255, 255, 255';
    if (colorType > 0.85) colorRgb = '190, 220, 255';
    else if (colorType > 0.72) colorRgb = '225, 190, 255';

    return {
      x: randomInitial ? Math.random() * width : (Math.random() < 0.5 ? -10 : width + 10),
      y: randomInitial ? Math.random() * height : (Math.random() < 0.5 ? -10 : height + 10),
      radius: randomRange(0.7, 2.4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      baseAlpha: randomRange(0.35, 0.95),
      twinkleSpeed: randomRange(0.018, 0.045),
      twinklePhase: Math.random() * Math.PI * 2,
      colorRgb
    };
  }

  function spawnShootingStar() {
    const toRight = Math.random() > 0.2;
    const startX = toRight ? randomRange(-50, width * 0.65) : randomRange(width * 0.35, width + 50);
    const startY = randomRange(-30, height * 0.35);
    const baseAngle = toRight ? randomRange(0.45, 0.75) : randomRange(Math.PI - 0.75, Math.PI - 0.45);
    // Sternenschnuppen sanfter & ein wenig langsamer
    const speed = randomRange(6.8, 10.5);

    shootingStars.push({
      x: startX,
      y: startY,
      length: randomRange(110, 190),
      speed,
      vx: Math.cos(baseAngle) * speed,
      vy: Math.sin(baseAngle) * speed,
      angle: baseAngle,
      age: 0,
      maxLife: Math.floor(randomRange(60, 92)),
      headRadius: randomRange(1.6, 2.5),
      thickness: randomRange(1.4, 2.2)
    });
  }

  // --- 4. Rain State ---
  const RAIN_COUNT = 150;
  const raindrops = [];
  const ripples = [];
  const activeBolts = [];
  let flashSequence = [];
  let flashIndex = 0;
  let nextLightningTime = Date.now() + 10000;

  function createRaindrop(randomY = true) {
    const layer = Math.random();
    let speed, len, widthSize, alpha;
    if (layer < 0.32) {
      // 1. Sehr sanfter, schwebender Nieselregen (ruhig & langsam: 2.2 - 4.2)
      speed = randomRange(2.2, 4.2);
      len = speed * randomRange(2.0, 2.7);
      widthSize = 0.85;
      alpha = randomRange(0.20, 0.35);
    } else if (layer < 0.68) {
      // 2. Gemächlicher, ruhiger Regen (5.0 - 7.8)
      speed = randomRange(5.0, 7.8);
      len = speed * randomRange(1.8, 2.4);
      widthSize = 1.1;
      alpha = randomRange(0.35, 0.55);
    } else if (layer < 0.88) {
      // 3. Etwas flotterer Regen für spürbaren Kontrast (8.5 - 12.0)
      speed = randomRange(8.5, 12.0);
      len = speed * randomRange(1.8, 2.2);
      widthSize = 1.35;
      alpha = randomRange(0.55, 0.75);
    } else {
      // 4. Schnellste Stufe – weiterhin ruhig und nicht übertrieben (12.5 - 15.5)
      speed = randomRange(12.5, 15.5);
      len = speed * randomRange(1.8, 2.2);
      widthSize = 1.6;
      alpha = randomRange(0.70, 0.88);
    }

    return {
      x: Math.random() * (width + 200) - 100,
      y: randomY ? Math.random() * (height + 100) - 50 : -randomRange(15, 60),
      speed,
      len,
      widthSize,
      alpha,
      groundY: height - randomRange(5, 55)
    };
  }

  function initRain() {
    raindrops.length = 0;
    for (let i = 0; i < RAIN_COUNT; i++) {
      raindrops.push(createRaindrop(true));
    }
    activeBolts.length = 0;
    flashSequence.length = 0;
    flashIndex = 0;
    nextLightningTime = Date.now() + randomRange(9000, 18000);
  }

  function triggerLightning() {
    // Blitze kommen einzeln (keine Überlappung)
    if (activeBolts.length > 0 || flashIndex < flashSequence.length) return;

    const startX = randomRange(width * 0.2, width * 0.8);
    const mainBranch = [{ x: startX, y: -5 }];
    let curX = startX;
    let curY = 0;
    const targetY = randomRange(height * 0.55, height * 0.85);

    // Ein einzelner, klarer gezackter Blitzpfad
    while (curY < targetY) {
      curY += randomRange(22, 42);
      curX += randomRange(-18, 18);
      mainBranch.push({ x: curX, y: curY });
    }

    const maxLife = 26;
    activeBolts.push({
      main: mainBranch,
      life: maxLife,
      maxLife
    });

    // Ein einzelnes klares Aufleuchten mit sanftem, spürbar längerem Nachleuchten
    flashSequence = [
      0.44, 0.42, 0.40, 0.36, 0.32, 0.28, 0.24, 0.20, 0.16, 0.12, 0.09, 0.06, 0.04, 0.02, 0.01
    ];
    flashIndex = 0;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);

    initNebula();
    initCyberParticles();
    initRain();

    if (stars.length === 0) {
      for (let i = 0; i < STAR_COUNT; i++) {
        stars.push(createStar(true));
      }
    }
  }

  // --- DRAW FUNCTIONS ---

  function drawNebula() {
    nebulaTime += 0.008;

    // 1. Procedural breathing gas clouds
    const clouds = [
      { fx: 0.72, fy: 0.30, rx: width * 0.12, ry: height * 0.10, baseR: Math.min(width, height) * 0.42, color: '168, 85, 247', alpha: 0.16, sx: 0.8, sy: 0.6 },
      { fx: 0.28, fy: 0.68, rx: width * 0.14, ry: height * 0.12, baseR: Math.min(width, height) * 0.48, color: '99, 102, 241', alpha: 0.14, sx: 0.6, sy: 0.9 },
      { fx: 0.50, fy: 0.45, rx: width * 0.10, ry: height * 0.08, baseR: Math.min(width, height) * 0.36, color: '217, 70, 239', alpha: 0.12, sx: 1.1, sy: 0.7 },
      { fx: 0.85, fy: 0.78, rx: width * 0.08, ry: height * 0.10, baseR: Math.min(width, height) * 0.38, color: '56, 189, 248', alpha: 0.10, sx: 0.7, sy: 1.0 }
    ];

    for (const c of clouds) {
      const cx = width * c.fx + Math.cos(nebulaTime * c.sx) * c.rx;
      const cy = height * c.fy + Math.sin(nebulaTime * c.sy) * c.ry;
      const r = c.baseR * (0.92 + 0.12 * Math.sin(nebulaTime * 0.8 + c.sx));

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(${c.color}, ${c.alpha.toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(${c.color}, ${(c.alpha * 0.45).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${c.color}, 0)`);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 2. Floating stardust
    for (let i = 0; i < nebulaStars.length; i++) {
      const s = nebulaStars[i];
      s.x += s.vx;
      s.y += s.vy;
      s.twinklePhase += s.twinkleSpeed;

      if (s.x < -10) s.x = width + 10;
      else if (s.x > width + 10) s.x = -10;
      if (s.y < -10) s.y = height + 10;
      else if (s.y > height + 10) s.y = -10;

      const alpha = Math.max(0.1, Math.min(1, s.alpha * (0.7 + 0.3 * Math.sin(s.twinklePhase))));

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${s.color}, ${(alpha * 0.25).toFixed(3)})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx.fill();
    }
  }

  function drawCyberGrid() {
    const horizonY = height * 0.54;
    gridOffset = (gridOffset + 0.006) % 1;

    // 1. Horizon Neon Glow
    const horizonGlow = ctx.createRadialGradient(width / 2, horizonY, 0, width / 2, horizonY, width * 0.6);
    horizonGlow.addColorStop(0, 'rgba(0, 240, 255, 0.24)');
    horizonGlow.addColorStop(0.35, 'rgba(178, 60, 238, 0.12)');
    horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, horizonY - 140, width, 280);

    // 2. Floating Cyber Data Particles
    for (let i = 0; i < cyberParticles.length; i++) {
      const p = cyberParticles[i];
      p.y += p.vy;
      p.x += p.vx;
      if (p.y < horizonY - 180) {
        p.y = height + 10;
        p.x = Math.random() * width;
      }
      const fade = Math.sin(((p.y - (horizonY - 180)) / (height - (horizonY - 180))) * Math.PI);
      const alpha = Math.max(0.05, Math.min(1, p.alpha * fade));

      ctx.save();
      ctx.fillStyle = `rgba(${p.color}, ${alpha.toFixed(3)})`;
      ctx.shadowColor = `rgba(${p.color}, 0.8)`;
      ctx.shadowBlur = 6;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    }

    // 3. Perspective Moving Horizontal Lines (Highway)
    const lineCount = 14;
    for (let i = 0; i < lineCount; i++) {
      const progress = (i + gridOffset) / lineCount;
      // Exponential curve for depth perception
      const depthY = horizonY + Math.pow(progress, 2.6) * (height - horizonY);
      const alpha = Math.pow(progress, 1.4) * 0.75;
      const lineWidth = 0.6 + progress * 2.2;

      const grad = ctx.createLinearGradient(0, depthY, width, depthY);
      grad.addColorStop(0, 'rgba(0, 240, 255, 0.05)');
      grad.addColorStop(0.2, `rgba(0, 240, 255, ${(alpha * 0.8).toFixed(3)})`);
      grad.addColorStop(0.5, `rgba(180, 255, 250, ${alpha.toFixed(3)})`);
      grad.addColorStop(0.8, `rgba(178, 60, 238, ${(alpha * 0.8).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(178, 60, 238, 0.05)');

      ctx.beginPath();
      ctx.moveTo(0, depthY);
      ctx.lineTo(width, depthY);
      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // 4. Perspective Radiating Vertical Lines
    const vpX = width / 2;
    const vpY = horizonY;
    const vSteps = 18;
    const spread = width * 1.5;

    for (let i = -vSteps; i <= vSteps; i++) {
      const bottomX = vpX + (i / vSteps) * spread;
      const topX = vpX + (i / vSteps) * (width * 0.04);

      const grad = ctx.createLinearGradient(topX, vpY, bottomX, height);
      grad.addColorStop(0, 'rgba(0, 240, 255, 0)');
      grad.addColorStop(0.15, 'rgba(0, 240, 255, 0.25)');
      grad.addColorStop(1, 'rgba(178, 60, 238, 0.65)');

      ctx.beginPath();
      ctx.moveTo(topX, vpY);
      ctx.lineTo(bottomX, height);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    // 5. Razor-sharp Horizon Laser Line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(width, horizonY);
    ctx.strokeStyle = 'rgba(180, 255, 250, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
  }

  function drawSpace() {
    // 1. Drifting Stars
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.x += s.vx;
      s.y += s.vy;
      s.twinklePhase += s.twinkleSpeed;

      if (s.x < -15) s.x = width + 15;
      else if (s.x > width + 15) s.x = -15;
      if (s.y < -15) s.y = height + 15;
      else if (s.y > height + 15) s.y = -15;

      const alpha = Math.max(0.15, Math.min(1, s.baseAlpha * (0.68 + 0.32 * Math.sin(s.twinklePhase))));

      if (s.radius > 1.6) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.colorRgb}, ${(alpha * 0.22).toFixed(3)})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${s.colorRgb}, ${alpha.toFixed(3)})`;
      ctx.fill();
    }

    // 2. Shooting Stars (Sternschnuppen) - sanft und elegant
    const now = Date.now();
    if (now >= nextShootingStarTime) {
      spawnShootingStar();
      if (Math.random() < 0.25) {
        setTimeout(() => { if (isRunning && currentAtmo === 'space') spawnShootingStar(); }, randomRange(400, 900));
      }
      nextShootingStarTime = now + randomRange(4500, 9000);
    }

    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const m = shootingStars[i];
      m.age++;
      m.x += m.vx;
      m.y += m.vy;

      if (m.age >= m.maxLife) {
        shootingStars.splice(i, 1);
        continue;
      }

      let alpha = 1;
      if (m.age < 8) alpha = m.age / 8;
      else if (m.age > m.maxLife - 20) alpha = (m.maxLife - m.age) / 20;
      alpha = Math.max(0, Math.min(1, alpha));

      const tailX = m.x - Math.cos(m.angle) * m.length;
      const tailY = m.y - Math.sin(m.angle) * m.length;

      const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
      grad.addColorStop(0, 'rgba(178, 60, 238, 0)');
      grad.addColorStop(0.35, `rgba(180, 215, 255, ${(alpha * 0.35).toFixed(3)})`);
      grad.addColorStop(0.85, `rgba(240, 245, 255, ${(alpha * 0.85).toFixed(3)})`);
      grad.addColorStop(1, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);

      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(m.x, m.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = m.thickness;
      ctx.lineCap = 'round';
      ctx.stroke();

      const headGlow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.headRadius * 3.5);
      headGlow.addColorStop(0, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
      headGlow.addColorStop(0.4, `rgba(200, 230, 255, ${(alpha * 0.6).toFixed(3)})`);
      headGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.arc(m.x, m.y, m.headRadius * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = headGlow;
      ctx.fill();
    }
  }

  function drawRain() {
    const windSlant = 0.85; // sehr sanfter, natürlicher Neigungswinkel

    // 1. Blitze einzeln (alle 12-22s, ohne Hektik)
    const now = Date.now();
    if (activeBolts.length === 0 && flashIndex >= flashSequence.length && now >= nextLightningTime) {
      triggerLightning();
      nextLightningTime = now + randomRange(12000, 22000);
    }

    // Sky Flash (einzelner klarer Lichtschein)
    if (flashIndex < flashSequence.length) {
      const fAlpha = flashSequence[flashIndex++];
      ctx.fillStyle = `rgba(215, 230, 255, ${fAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }

    // Einzelner Blitz am Himmel (bleibt spürbar länger sichtbar & verglimmt sanft)
    for (let b = activeBolts.length - 1; b >= 0; b--) {
      const bolt = activeBolts[b];
      const maxL = bolt.maxLife || 26;
      let boltAlpha = 1;
      const holdFrames = 8;
      if (bolt.life < maxL - holdFrames) {
        boltAlpha = bolt.life / (maxL - holdFrames);
      }
      boltAlpha = Math.max(0, Math.min(1, boltAlpha));

      if (boltAlpha > 0) {
        ctx.save();
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'round';

        // Äußeres elektrisches Leuchten (Cyan / Blau)
        ctx.strokeStyle = `rgba(160, 215, 255, ${(boltAlpha * 0.75).toFixed(3)})`;
        ctx.lineWidth = 4.2;
        ctx.shadowColor = '#80c8ff';
        ctx.shadowBlur = 14;

        ctx.beginPath();
        for (let i = 0; i < bolt.main.length; i++) {
          if (i === 0) ctx.moveTo(bolt.main[i].x, bolt.main[i].y);
          else ctx.lineTo(bolt.main[i].x, bolt.main[i].y);
        }
        ctx.stroke();

        // Intensiver weißer Blitzkern
        ctx.strokeStyle = `rgba(255, 255, 255, ${boltAlpha.toFixed(3)})`;
        ctx.lineWidth = 1.9;
        ctx.shadowBlur = 0;
        ctx.stroke();

        ctx.restore();
      }

      bolt.life--;
      if (bolt.life <= 0) {
        activeBolts.splice(b, 1);
      }
    }

    // 2. Raindrops mit unterschiedlichen ruhigen Geschwindigkeiten (eher langsam)
    for (let i = 0; i < raindrops.length; i++) {
      const drop = raindrops[i];
      drop.x += windSlant * (drop.speed / 6);
      drop.y += drop.speed;

      // Check ground splash impact
      if (drop.y >= drop.groundY) {
        if (Math.random() < 0.65) {
          ripples.push({
            x: drop.x,
            y: drop.groundY,
            r: 1,
            maxR: randomRange(5, 11),
            alpha: drop.alpha * 0.65
          });
        }
        // Tropfen neu erzeugen mit variierender Geschwindigkeitsstufe
        Object.assign(drop, createRaindrop(false));
      }

      if (drop.x > width + 100) drop.x = -50;

      const tailX = drop.x - windSlant * (drop.len / drop.speed);
      const tailY = drop.y - drop.len;

      const grad = ctx.createLinearGradient(tailX, tailY, drop.x, drop.y);
      grad.addColorStop(0, 'rgba(190, 220, 255, 0)');
      grad.addColorStop(0.65, `rgba(205, 230, 255, ${(drop.alpha * 0.5).toFixed(3)})`);
      grad.addColorStop(1, `rgba(235, 245, 255, ${drop.alpha.toFixed(3)})`);

      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(drop.x, drop.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = drop.widthSize;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 3. Ground Ripples / Splashes
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rip = ripples[i];
      rip.r += 0.55;
      const progress = rip.r / rip.maxR;
      const alpha = Math.max(0, (1 - progress) * rip.alpha);

      if (progress >= 1 || alpha <= 0) {
        ripples.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.ellipse(rip.x, rip.y, rip.r * 2.2, rip.r * 0.7, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200, 225, 255, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  }

  function updateAndDraw() {
    if (!isRunning) return;

    ctx.clearRect(0, 0, width, height);

    if (currentAtmo === 'space') {
      drawSpace();
    } else if (currentAtmo === 'grid') {
      drawCyberGrid();
    } else if (currentAtmo === 'rain' || currentAtmo === 'aurora') {
      drawRain();
    } else {
      drawNebula();
    }

    animFrameId = requestAnimationFrame(updateAndDraw);
  }

  function checkState() {
    if (document.body.classList.contains('atmo-space')) currentAtmo = 'space';
    else if (document.body.classList.contains('atmo-grid')) currentAtmo = 'grid';
    else if (document.body.classList.contains('atmo-rain') || document.body.classList.contains('atmo-aurora')) currentAtmo = 'rain';
    else currentAtmo = 'nebula';

    const isAnimAllowed = !document.body.classList.contains('no-animation');
    const shouldRun = isAnimAllowed && !document.hidden;

    if (shouldRun && !isRunning) {
      isRunning = true;
      resize();
      animFrameId = requestAnimationFrame(updateAndDraw);
    } else if (!shouldRun && isRunning) {
      isRunning = false;
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      ctx.clearRect(0, 0, width, height);
    }
  }

  window.addEventListener('resize', () => {
    if (isRunning) resize();
  });

  document.addEventListener('visibilitychange', checkState);

  const observer = new MutationObserver(() => {
    checkState();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  checkState();
}
