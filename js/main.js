/* ================================================
   ACADEMIC HOMEPAGE — Grok two-pass light system
   Pass 1: Trail (FBO feedback) → flowing smoke
   Pass 2: Star + trail composite → final
   ================================================ */
(() => {
  'use strict';

  /* ---- Shared vertex shader ---- */
  const VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
    vUv = 0.5 * aPosition + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

  /* ---- PASS 1: Trail shader (FBO feedback = flowing smoke) ---- */
  const TRAIL_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;
uniform float uTime;
uniform float uDeltaTime;
uniform vec2 uMouse;
uniform vec2 uMouseVelocity;
uniform vec2 uResolution;
uniform sampler2D uNoiseTexture;
uniform sampler2D uPreviousFrame;

#define TRAIL_FALLOFF 9000.0
#define FADE_EXP vec4(0.02, 0.02, 0.1, 0.1)
#define SCROLL_SPEED 0.0005
#define DISTORT_SPEED 0.02

#define TURB_NUM 8.0
#define TURB_AMP 0.6
#define TURB_SPEED 0.5
#define TURB_VEL vec2(0.1, 0.0)
#define TURB_FREQ 50.0
#define TURB_EXP 1.3

vec2 turbulence(vec2 p) {
    mat2 rot = mat2(0.6, -0.8, 0.8, 0.6);
    vec2 turb = vec2(0.0);
    float freq = TURB_FREQ;
    for (float i = 0.0; i < TURB_NUM; i++) {
        vec2 pos = p + TURB_SPEED * i * uTime * TURB_VEL;
        float phase = freq * (pos * rot).y + TURB_SPEED * uTime * freq * 0.1;
        turb += rot[0] * sin(phase) / freq;
        rot *= mat2(0.6, -0.8, 0.8, 0.6);
        freq *= TURB_EXP;
    }
    return turb;
}

void main() {
    vec2 ratio = min(uResolution.yx / uResolution.xy, 1.0);
    float delta = 144.0 * uDeltaTime;

    // Scroll velocity
    vec2 scroll = SCROLL_SPEED * vec2(1.0, vUv.y - 0.5) * ratio;
    // Turbulent distortion
    vec2 turb = turbulence((vUv + scroll) / ratio);
    vec2 distort = DISTORT_SPEED * turb;
    // Distorted UVs — the feedback loop
    vec2 distortedUv = vUv + delta * scroll + delta * distort * ratio;

    // Sample previous frame
    vec4 prev = texture2D(uPreviousFrame, distortedUv);

    // Mouse trail
    vec2 trailA = vUv + 0.01 * delta * turb * ratio - uMouse;
    vec2 trailB = -uMouseVelocity;
    float trailD = dot(trailB, trailB);
    vec2 trailDif = trailA / ratio;
    float falloff = 0.0;
    if (trailD > 0.0) {
        float f = clamp(dot(trailA, trailB) / trailD, 0.0, 1.0);
        trailDif -= f * trailB / ratio;
        falloff = 1.0 / (1.0 + TRAIL_FALLOFF * dot(trailDif, trailDif));
        falloff *= min(trailD / (0.001 + trailD), 1.0);
    }

    // Brightness at mouse position
    vec2 suv = (uMouse - uMouseVelocity) * 2.0 - 1.0;
    float vig = 1.0 - abs(suv.y);
    vig *= 0.5 + 0.5 * suv.x;

    // Noise for decay dithering
    vec2 nuv = gl_FragCoord.xy / 64.0 + uTime * vec2(7.1, 9.1);
    float noise = texture2D(uNoiseTexture, nuv).r;

    // Fade with noise
    vec4 fade = pow(vec4(noise), FADE_EXP);
    fade = exp(-2.0 * fade * uDeltaTime);
    vec4 decay = mix(vec4(0.5, 0.5, 0.0, 0.0), prev, fade);

    vec4 col = decay;

    // Trail velocity
    vec2 vel = (-trailB) / (0.01 + length(trailB));
    col.rg -= (0.5 - abs(decay.rg - 0.5)) * (falloff * vel);
    col.ba += falloff * (1.0 - decay.ba) * vec2(1.0, vig * vig);

    // Dithering
    col += (noise - 0.5) / 255.0;
    gl_FragColor = col;
}
`;

  /* ---- PASS 2: Main star + composite ---- */
  const MAIN_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uOffset;
uniform float uFade;
uniform sampler2D uNoiseTexture;
uniform sampler2D uTrailTexture;

#define STAR 5.0
#define FLARE 4.0
#define COLOR vec3(0.2, 0.3, 0.8)

#define STAR_NUM 12.0
#define STAR_AMP 0.5
#define STAR_SPEED 0.01
#define STAR_VEL vec2(1.0, 0.0)
#define STAR_FREQ 8.0
#define STAR_EXP 1.5

#define GLOW_STRENGTH 12.0
#define GLOW_RED vec3(0.5, 0.2, 0.2)
#define GLOW_BLUE vec3(0.3, 0.3, 0.6)
#define GLOW_TINT 3.0
#define LIGHT_EXP 30.0
#define TRAIL_EXP vec3(1.4, 1.2, 1.0)
#define TRAIL_STRENGTH 0.4

#define DITHER 0.01
#define DITHER_RES 64.0

vec3 gamma_encode(vec3 lrgb) { return sqrt(lrgb); }

vec2 turbulence(vec2 p, float freq, float num) {
    mat2 rot = mat2(0.6, -0.8, 0.8, 0.6);
    vec2 turb = vec2(0.0);
    for (float i = 0.0; i < STAR_NUM; i++) {
        if (i >= num) break;
        vec2 pos = p + turb + STAR_SPEED * i * uTime * STAR_VEL;
        float phase = freq * (pos * rot).y + STAR_SPEED * uTime * freq;
        turb += rot[0] * sin(phase) / freq;
        rot *= mat2(0.6, -0.8, 0.8, 0.6);
        freq *= STAR_EXP;
    }
    return turb;
}

vec3 star(vec2 p) {
    #define STAR_STRETCH 0.7
    #define STAR_CURVE 0.5

    vec2 suv = p * 2.0 - 1.0;
    vec2 right = suv - vec2(1.0, 0.0);
    right.x *= STAR_STRETCH * uResolution.x / uResolution.y;

    float factor = 1.0 + 0.4 * sin(9.0 * suv.y) * sin(5.0 * (suv.x + 5.0 * uTime * STAR_SPEED));
    vec2 turb = right + factor * STAR_AMP * turbulence(right, STAR_FREQ, STAR_NUM);
    turb.x -= STAR_CURVE * suv.y * suv.y;

    float fade = max(4.0 * suv.y * suv.y - suv.x + 1.2, 0.001);
    float atten = fade * max(0.5 * turb.x, -turb.x);

    float ft = 0.4 * uTime;
    vec2 fp = 8.0 * (turb + 0.5 * STAR_VEL * ft);
    fp *= mat2(0.4, -0.3, 0.3, 0.4);
    float f = cos(fp.x) * sin(fp.y) - 0.5;
    float flare = f * f + 0.5 * suv.y * suv.y - 1.5 * turb.x
                  + 0.6 * cos(0.42 * ft + 1.6 * turb.y) * cos(0.31 * ft - turb.y);

    vec3 col = 0.1 * COLOR * (STAR / (atten * atten) + FLARE / (flare * flare));

    const vec3 chrom = vec3(0.0, 0.1, 0.2);
    col *= exp(p.x *
                cos(turb.y * 5.0 + 0.4 * (uTime + turb.x * 1.0) + chrom) *
                cos(turb.y * 7.0 - 0.5 * (uTime - turb.x * 1.5) + chrom) *
                cos(turb.y * 9.0 + 0.6 * (uTime + turb.x * 2.0) + chrom)
        );

    return col;
}

void main() {
    vec2 duv = 0.9 * gl_FragCoord.xy / DITHER_RES * mat2(0.8, -0.6, 0.6, 0.8);
    float dither = texture2D(uNoiseTexture, duv).r - 0.5;

    vec2 ratio = min(uResolution.yx / uResolution.xy, 1.0);
    vec4 trailTex = texture2D(uTrailTexture, vUv);

    vec2 suv = vUv * 2.0 - 1.0;

    // Star with trail distortion (the smoke effect)
    vec2 starUv = vUv + uOffset;
    starUv += 0.3 * (trailTex.rg - 0.5) * trailTex.b * ratio;
    vec3 col = star(starUv);

    // Vignette
    float vig = 1.0 - abs(suv.y);
    vig *= 0.5 + 0.5 * suv.x;
    col *= vig * vig;

    // Tonemap + gamma
    col /= 1.0 + col;
    col = clamp(col, 0.0, 1.0);
    col = gamma_encode(col);

    // Light gradient
    float yy = suv.y + 0.03;
    yy = max(1.0 - 1e1 * yy * yy / max(0.5 + 1.5 * starUv.x, 0.1), 0.0);
    float light = max(0.5 + 0.5 * starUv.x, 0.0) * yy;

    // Glow hue
    vec3 hue = mix(GLOW_RED, GLOW_BLUE, 1.0 + suv.x);
    // Add trail glow (the warm smoke wisps)
    col += TRAIL_STRENGTH * hue * pow(trailTex.aaa, TRAIL_EXP);

    // Entrance fade
    col *= uFade;

    // Dither
    col += DITHER * dither;

    gl_FragColor = vec4(col, 1.0);
}
`;

  class GrokLight {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
      if (!gl) return;
      this.gl = gl;

      this.mouse = [0.5, 0.5];
      this.prevMouse = [0.5, 0.5];
      this.fade = 0;
      this.lastTime = 0;
      this.pingpong = 0;
      this.dpr = Math.min(window.devicePixelRatio || 1, 1);

      this._initGL();
      this._resize();
      this._bind();
      requestAnimationFrame(t => this._loop(t));
    }

    _compileShader(type, src) {
      const gl = this.gl, s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(s)); return null;
      }
      return s;
    }

    _createProgram(vertSrc, fragSrc) {
      const gl = this.gl;
      const vs = this._compileShader(gl.VERTEX_SHADER, vertSrc);
      const fs = this._compileShader(gl.FRAGMENT_SHADER, fragSrc);
      if (!vs || !fs) return null;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('Link error:', gl.getProgramInfoLog(prog)); return null;
      }
      return prog;
    }

    _createFBOTexture() {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                    this.canvas.width, this.canvas.height,
                    0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return { tex, fbo };
    }

    _initGL() {
      const gl = this.gl;

      // Two programs
      this.trailProg = this._createProgram(VERT, TRAIL_FRAG);
      this.mainProg = this._createProgram(VERT, MAIN_FRAG);
      if (!this.trailProg || !this.mainProg) return;

      // Fullscreen quad
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      this.quadBuf = buf;

      // Get uniform locations — Trail
      this.uTrail = {};
      ['uTime','uDeltaTime','uMouse','uMouseVelocity','uResolution',
       'uNoiseTexture','uPreviousFrame'].forEach(n => {
        this.uTrail[n] = gl.getUniformLocation(this.trailProg, n);
      });

      // Get uniform locations — Main
      this.uMain = {};
      ['uTime','uResolution','uOffset','uFade',
       'uNoiseTexture','uTrailTexture'].forEach(n => {
        this.uMain[n] = gl.getUniformLocation(this.mainProg, n);
      });

      // Load noise texture
      this.noiseTex = this._loadTexture('assets/noise.png', true);

      // Create ping-pong FBOs
      this.fbos = [this._createFBOTexture(), this._createFBOTexture()];
    }

    _loadTexture(src, repeat) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                    new Uint8Array([128,128,128,255]));

      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      };
      img.onerror = () => {
        // fallback random noise
        const s = 128, cv = document.createElement('canvas');
        cv.width = cv.height = s;
        const cx = cv.getContext('2d'), id = cx.createImageData(s, s);
        for (let i = 0; i < id.data.length; i += 4) {
          const v = Math.random() * 255 | 0;
          id.data[i] = id.data[i+1] = id.data[i+2] = v; id.data[i+3] = 255;
        }
        cx.putImageData(id, 0, 0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      };
      img.src = src;
      return tex;
    }

    _useProgram(prog) {
      const gl = this.gl;
      gl.useProgram(prog);
      const loc = gl.getAttribLocation(prog, 'aPosition');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    _resize() {
      const r = this.canvas.parentElement.getBoundingClientRect();
      const w = Math.floor(r.width * this.dpr), h = Math.floor(r.height * this.dpr);
      this.canvas.width = w; this.canvas.height = h;
      this.canvas.style.width = r.width + 'px';
      this.canvas.style.height = r.height + 'px';
      this.gl.viewport(0, 0, w, h);

      // Resize FBO textures
      if (this.fbos) {
        const gl = this.gl;
        this.fbos.forEach(f => {
          gl.bindTexture(gl.TEXTURE_2D, f.tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        });
      }
    }

    _bind() {
      let rt;
      window.addEventListener('resize', () => {
        clearTimeout(rt); rt = setTimeout(() => this._resize(), 150);
      });
      const hero = this.canvas.parentElement;
      hero.addEventListener('mousemove', e => {
        const r = hero.getBoundingClientRect();
        this.mouse = [(e.clientX - r.left) / r.width, 1.0 - (e.clientY - r.top) / r.height];
      });
      hero.addEventListener('touchmove', e => {
        const t = e.touches[0], r = hero.getBoundingClientRect();
        this.mouse = [(t.clientX - r.left) / r.width, 1.0 - (t.clientY - r.top) / r.height];
      }, { passive: true });
    }

    _loop(now) {
      const timeSec = now * 0.001;
      const dt = this.lastTime > 0 ? Math.min((now - this.lastTime) * 0.001, 0.05) : 0.0167;
      this.lastTime = now;

      // Entrance fade
      if (this.fade < 1) this.fade = Math.min(1, this.fade + dt * 0.4);
      const ef = this.fade * this.fade * (3 - 2 * this.fade);

      // Mouse velocity
      const vel = [this.mouse[0] - this.prevMouse[0], this.mouse[1] - this.prevMouse[1]];
      this.prevMouse = [...this.mouse];

      const gl = this.gl;
      const w = this.canvas.width, h = this.canvas.height;
      const next = (this.pingpong + 1) % 2;

      /* ---- PASS 1: Trail → FBO ---- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[next].fbo);
      this._useProgram(this.trailProg);

      gl.uniform1f(this.uTrail.uTime, timeSec);
      gl.uniform1f(this.uTrail.uDeltaTime, dt);
      gl.uniform2f(this.uTrail.uMouse, this.mouse[0], this.mouse[1]);
      gl.uniform2f(this.uTrail.uMouseVelocity, vel[0], vel[1]);
      gl.uniform2f(this.uTrail.uResolution, w, h);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
      gl.uniform1i(this.uTrail.uNoiseTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos[this.pingpong].tex);
      gl.uniform1i(this.uTrail.uPreviousFrame, 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      /* ---- PASS 2: Star + trail → Screen ---- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this._useProgram(this.mainProg);

      gl.uniform1f(this.uMain.uTime, timeSec);
      gl.uniform2f(this.uMain.uResolution, w, h);
      gl.uniform2f(this.uMain.uOffset, 0.0, 0.0);
      gl.uniform1f(this.uMain.uFade, ef);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
      gl.uniform1i(this.uMain.uNoiseTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos[next].tex);
      gl.uniform1i(this.uMain.uTrailTexture, 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      this.pingpong = next;
      requestAnimationFrame(t => this._loop(t));
    }
  }

  /* ================================================ THEME ================================================ */
  class ThemeManager {
    constructor() {
      this.btn = document.getElementById('themeToggle');
      this.icon = document.getElementById('themeIcon');
      this.root = document.documentElement;
      const saved = localStorage.getItem('theme');
      if (saved) this.root.setAttribute('data-theme', saved);
      this._updateIcon();
      this.btn.addEventListener('click', () => this._toggle());
    }
    _toggle() {
      const next = this.root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      this.root.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      this._updateIcon();
    }
    _updateIcon() {
      this.icon.className = this.root.getAttribute('data-theme') === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
  }

  /* ================================================ NAVBAR ================================================ */
  class Navbar {
    constructor() {
      this.nav = document.getElementById('navbar');
      this.btn = document.getElementById('navToggle');
      this.menu = document.getElementById('navMenu');
      this.links = document.querySelectorAll('.nav-link');
      let ticking = false;
      window.addEventListener('scroll', () => {
        if (!ticking) { requestAnimationFrame(() => { this._tick(); ticking = false; }); ticking = true; }
      });
      this.btn.addEventListener('click', () => { this.btn.classList.toggle('active'); this.menu.classList.toggle('open'); });
      this.links.forEach(l => l.addEventListener('click', () => { this.btn.classList.remove('active'); this.menu.classList.remove('open'); }));
    }
    _tick() {
      this.nav.classList.toggle('scrolled', window.scrollY > 50);
      let cur = '';
      document.querySelectorAll('.section,.hero').forEach(s => { if (window.scrollY >= s.offsetTop - 120) cur = s.id; });
      this.links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + cur));
    }
  }

  /* ================================================ SCROLL REVEAL ================================================ */
  function initReveal() {
    const sel = '.section-title,.section-subtitle,.about-text-only,.pub-card,.text-list,.text-paragraph,.subsection-title';
    document.querySelectorAll(sel).forEach(el => el.classList.add('reveal'));
    document.querySelectorAll('.pub-list').forEach(el => el.classList.add('stagger'));
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    document.querySelectorAll('.reveal,.stagger').forEach(el => obs.observe(el));
  }

  /* (counters removed — no longer needed) */

  /* ================================================ SMOOTH SCROLL ================================================ */
  function initSmooth() {
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const t = document.querySelector(a.getAttribute('href'));
        if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 46, behavior: 'smooth' });
      });
    });
  }

  /* ================================================ FOOTER QUOTES ================================================ */
  class FooterQuotes {
    constructor() {
      this.footer = document.getElementById('footerQuoteTrigger');
      this.leftEl = document.getElementById('footerQuoteLeft');
      this.rightEl = document.getElementById('footerQuoteRight');
      this.quotes = [];
      this.currentIndex = -1;
      this.isSwitching = false;
      if (!this.footer || !this.leftEl || !this.rightEl) return;
      this._init();
    }

    async _init() {
      try {
        const res = await fetch('assets/su_shi.json');
        if (!res.ok) throw new Error('Failed to load quotes');
        this.quotes = await res.json();
        if (!Array.isArray(this.quotes) || !this.quotes.length) return;
        this._showRandomInitial();
        this.footer.addEventListener('click', () => this.nextQuote());
      } catch (err) {
        console.error(err);
      }
    }

    _pickNextIndex() {
      if (this.quotes.length <= 1) return 0;
      let next = this.currentIndex;
      while (next === this.currentIndex) {
        next = Math.floor(Math.random() * this.quotes.length);
      }
      return next;
    }

    _setQuote(index) {
      const quote = this.quotes[index];
      this.currentIndex = index;
      this.leftEl.textContent = quote.left;
      this.rightEl.textContent = quote.right;
    }

    _showRandomInitial() {
      const index = Math.floor(Math.random() * this.quotes.length);
      this._setQuote(index);
    }

    nextQuote() {
      if (this.isSwitching || !this.quotes.length) return;
      this.isSwitching = true;
      this.leftEl.classList.add('is-switching');
      this.rightEl.classList.add('is-switching');

      window.setTimeout(() => {
        this._setQuote(this._pickNextIndex());
        this.leftEl.classList.remove('is-switching');
        this.rightEl.classList.remove('is-switching');
        window.setTimeout(() => {
          this.isSwitching = false;
        }, 360);
      }, 220);
    }
  }

  /* ================================================ BOOT ================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    const c = document.getElementById('lightCanvas');
    if (c) new GrokLight(c);
    new ThemeManager();
    new Navbar();
    initReveal();
    initSmooth();
    new FooterQuotes();
  });
})();
