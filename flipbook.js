'use strict';

/* ══════════════════════════════════════════════════════════════
   1. Partículas flotantes de fondo
   Canvas de estrellas sutiles — movimiento lento y orgánico
══════════════════════════════════════════════════════════════ */
(function(){
  const cv = document.getElementById('particles');
  const cx = cv.getContext('2d');
  let W, H, stars = [];

  function resize(){
    W = cv.width  = window.innerWidth;
    H = cv.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for(let i = 0; i < 100; i++){
    stars.push({
      x  : Math.random() * window.innerWidth,
      y  : Math.random() * window.innerHeight,
      r  : Math.random() * 1.4 + .3,
      dx : (Math.random() - .5) * .2,
      dy : (Math.random() - .5) * .2,
      a  : Math.random(),
      da : (Math.random() - .5) * .006,
      hue: Math.random() < .3 ? 0 : 220,
    });
  }

  function tick(){
    cx.clearRect(0, 0, W, H);
    for(const s of stars){
      s.x += s.dx; s.y += s.dy; s.a += s.da;
      if(s.a < 0){ s.a = 0; s.da *= -1; }
      if(s.a > 1){ s.a = 1; s.da *= -1; }
      if(s.x < 0) s.x = W;  if(s.x > W) s.x = 0;
      if(s.y < 0) s.y = H;  if(s.y > H) s.y = 0;
      cx.beginPath();
      cx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      cx.fillStyle = `hsla(${s.hue},75%,75%,${s.a * .65})`;
      cx.fill();
    }
    requestAnimationFrame(tick);
  }
  tick();
})();

/* ══════════════════════════════════════════════════════════════
   2. Configuración de PDF.js y ensamblado de datos
   Los PDFs están divididos en partes para que cada archivo JS
   sea < 25 MB. Aquí se reensamblan antes de usarlos.
══════════════════════════════════════════════════════════════ */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* Ensambla los fragmentos cargados por los scripts de datos */
const PDF_DATA = {
  '1': PDF1A + PDF1B,   /* pdf1a.js + pdf1b.js */
  '2': PDF2,            /* pdf2.js              */
};

function b64ToUint8(b64){
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

/* ══════════════════════════════════════════════════════════════
   3. Clase FlipBook
   — Renderiza páginas PDF en dos canvas alternados
   — Aplica animaciones CSS de cambio de página suaves
   — Soporta zoom, pantalla completa, swipe y scroll
══════════════════════════════════════════════════════════════ */
class FlipBook {
  constructor(opts){
    this.data    = opts.data;
    this.canA    = document.getElementById(opts.canA);
    this.canB    = document.getElementById(opts.canB);
    this.loadEl  = document.getElementById(opts.loading);
    this.prevBtn = document.getElementById(opts.prev);
    this.nextBtn = document.getElementById(opts.next);
    this.piEl    = document.getElementById(opts.pi);
    this.pbEl    = document.getElementById(opts.pb);
    this.zoBtn   = document.getElementById(opts.zo);
    this.ziBtn   = document.getElementById(opts.zi);
    this.fsBtn   = document.getElementById(opts.fs);
    this.dlBtn   = document.getElementById(opts.dl);
    this.flashEl = document.getElementById(opts.flash);
    this.section = document.getElementById(opts.sec);

    /* Duración de la animación en ms — debe coincidir con --flip-duration en CSS */
    this.FLIP_MS = 480;

    this.pdf    = null;
    this.page   = 1;
    this.total  = 0;
    this.scale  = 1.5;
    this.busy   = false;
    this.cache  = {};
    this.active = this.canA;
    this.hidden = this.canB;

    this._boot();
  }

  /* ── Carga el PDF y muestra la primera página ── */
  async _boot(){
    try{
      const buf  = b64ToUint8(this.data);
      const task = pdfjsLib.getDocument({
        data: buf,
        cMapUrl    : 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked : true,
      });
      this.pdf   = await task.promise;
      this.total = this.pdf.numPages;

      await this._renderTo(1, this.active);
      this.loadEl.style.display = 'none';

      /* Genera el enlace de descarga a partir del blob embebido */
      const blob = new Blob([buf], { type: 'application/pdf' });
      this.dlBtn.href = URL.createObjectURL(blob);

      this._updateUI();
      this._bind();
      if(this.total > 1) this._preRender(2);

    }catch(err){
      this.loadEl.innerHTML =
        `<p style="color:#f44;padding:20px;text-align:center;font-size:.83rem">
          Error al cargar el PDF.<br><small>${err.message}</small>
        </p>`;
    }
  }

  /* ── Renderiza la página num en el canvas destino ── */
  async _renderTo(num, canvas){
    if(this.cache[num]){
      const c = this.cache[num];
      canvas.width  = c.width;
      canvas.height = c.height;
      canvas.getContext('2d').drawImage(c, 0, 0);
      return;
    }
    const pg = await this.pdf.getPage(num);
    const vp = pg.getViewport({ scale: this.scale });
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    /* Guarda snapshot en caché */
    const snap = document.createElement('canvas');
    snap.width  = canvas.width;
    snap.height = canvas.height;
    snap.getContext('2d').drawImage(canvas, 0, 0);
    this.cache[num] = snap;
  }

  /* ── Pre-renderiza una página en segundo plano ── */
  async _preRender(num){
    if(num < 1 || num > this.total || this.cache[num]) return;
    const pg   = await this.pdf.getPage(num);
    const vp   = pg.getViewport({ scale: this.scale });
    const snap = document.createElement('canvas');
    snap.width  = vp.width;
    snap.height = vp.height;
    await pg.render({ canvasContext: snap.getContext('2d'), viewport: vp }).promise;
    this.cache[num] = snap;
  }

  /* ── Navega a la página target con animación de volteo ──
     dir > 0 → avanza (página sale por izquierda)
     dir < 0 → retrocede (página sale por derecha)
  ── */
  async goTo(target, dir){
    if(this.busy || target < 1 || target > this.total) return;
    this.busy = true;

    /* Prepara el canvas oculto para recibir la nueva página */
    this.hidden.style.cssText =
      'position:absolute;top:0;left:0;width:100%;display:block;z-index:1;';
    this.active.style.zIndex   = '2';
    this.active.style.position = 'relative';

    await this._renderTo(target, this.hidden);

    /* Dispara el reflejo de luz en el papel */
    this.flashEl.classList.remove('active');
    void this.flashEl.offsetWidth; /* fuerza reflow para reiniciar animación */
    this.flashEl.classList.add('active');

    /* Clases de animación según dirección */
    const outC = dir > 0 ? 'anim-out-fwd' : 'anim-out-bwd';
    const inC  = dir > 0 ? 'anim-in-fwd'  : 'anim-in-bwd';

    /* Fase 1 — página actual sale */
    this.active.classList.add(outC);
    await this._wait(this.FLIP_MS);
    this.active.classList.remove(outC);
    this.active.style.display = 'none';

    /* Fase 2 — nueva página entra */
    this.hidden.style.position = 'relative';
    this.hidden.style.zIndex   = '';
    this.hidden.classList.add(inC);
    await this._wait(this.FLIP_MS);
    this.hidden.classList.remove(inC);

    /* Intercambia referencias de canvas activo/oculto */
    [this.active, this.hidden] = [this.hidden, this.active];
    this.active.style.display = 'block';
    this.hidden.style.display = 'none';

    this.page  = target;
    this.busy  = false;
    this._updateUI();

    /* Pre-renderiza vecinos en segundo plano */
    this._preRender(target + 1);
    this._preRender(target - 1);
  }

  /* ── Actualiza contador, barra y estado de botones ── */
  _updateUI(){
    this.piEl.textContent     = `${this.page} / ${this.total}`;
    this.prevBtn.disabled     = (this.page <= 1);
    this.nextBtn.disabled     = (this.page >= this.total);
    this.pbEl.style.width     =
      `${((this.page - 1) / Math.max(this.total - 1, 1)) * 100}%`;
  }

  /* ── Re-renderiza la página actual al cambiar escala ── */
  async _rerender(){
    delete this.cache[this.page];
    await this._renderTo(this.page, this.active);
  }

  /* ── Conecta todos los eventos de interacción ── */
  _bind(){
    /* Botones de navegación */
    this.prevBtn.addEventListener('click', () => this.goTo(this.page - 1, -1));
    this.nextBtn.addEventListener('click', () => this.goTo(this.page + 1,  1));

    /* Zoom */
    this.ziBtn.addEventListener('click', () => {
      if(this.scale >= 3.0) return;
      this.scale = Math.min(this.scale + .25, 3.0);
      this.cache = {};
      this._rerender();
    });
    this.zoBtn.addEventListener('click', () => {
      if(this.scale <= .75) return;
      this.scale = Math.max(this.scale - .25, .75);
      this.cache = {};
      this._rerender();
    });

    /* Pantalla completa */
    this.fsBtn.addEventListener('click', () => {
      if(!document.fullscreenElement){
        (this.section.requestFullscreen || this.section.webkitRequestFullscreen)
          .call(this.section);
      }else{
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
    });

    /* Teclado (solo en modo fullscreen) */
    document.addEventListener('keydown', (e) => {
      if(document.fullscreenElement !== this.section) return;
      if(e.key === 'ArrowRight' || e.key === 'ArrowDown') this.goTo(this.page + 1,  1);
      if(e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   this.goTo(this.page - 1, -1);
    });

    /* Swipe táctil */
    let touchStartX = 0;
    const stack = this.active.parentElement;
    stack.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    stack.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if(Math.abs(dx) > 45){
        dx < 0 ? this.goTo(this.page + 1, 1) : this.goTo(this.page - 1, -1);
      }
    });

    /* Rueda del ratón sobre el libro */
    this.section.addEventListener('wheel', e => {
      if(e.deltaY >  30) this.goTo(this.page + 1,  1);
      if(e.deltaY < -30) this.goTo(this.page - 1, -1);
    }, { passive: true });
  }

  _wait(ms){ return new Promise(r => setTimeout(r, ms)); }
}

/* ══════════════════════════════════════════════════════════════
   4. Inicialización de los flipbooks
══════════════════════════════════════════════════════════════ */
new FlipBook({
  data   : PDF_DATA['1'],
  canA   : 'c1a',  canB    : 'c1b',
  loading: 'ld1',
  prev   : 'prev1', next   : 'next1',
  pi     : 'pi1',   pb     : 'pb1',
  zo     : 'zo1',   zi     : 'zi1',
  fs     : 'fs1',   dl     : 'dl1',
  flash  : 'ff1',   sec    : 'sec1',
});

new FlipBook({
  data   : PDF_DATA['2'],
  canA   : 'c2a',  canB    : 'c2b',
  loading: 'ld2',
  prev   : 'prev2', next   : 'next2',
  pi     : 'pi2',   pb     : 'pb2',
  zo     : 'zo2',   zi     : 'zi2',
  fs     : 'fs2',   dl     : 'dl2',
  flash  : 'ff2',   sec    : 'sec2',
});
