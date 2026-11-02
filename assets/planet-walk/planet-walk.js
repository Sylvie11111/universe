/* EarthWalk · 无依赖 Canvas 动画图层（可嵌入 Vue3/Nuxt/普通 HTML）
   public API: PlanetWalk.mount(element, {assetBase, speed, paused, cover})
   instance: pause(), resume(), setSpeed(n), destroy()
   资源独立放在 assets/ 下；不修改现有标题、导航和业务逻辑。
*/
;(function(global) {
  'use strict';
  function mount(host, options) {
    if (!host || !(host instanceof HTMLElement)) throw new TypeError('PlanetWalk.mount 需要一个容器元素');
    options = options || {};
    const W = 1905, H = 911;
    const assetBase = String(options.assetBase || './assets').replace(/\/$/, '');
    const stage = document.createElement('div');
    stage.style.cssText = 'width:1905px;height:911px;position:absolute;top:50%;left:50%;transform-origin:center center;pointer-events:none;';
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    canvas.setAttribute('aria-hidden','true');
    stage.appendChild(canvas);
    const priorHostPosition = host.style.position;
    const priorHostOverflow = host.style.overflow;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.overflow = 'hidden';
    host.appendChild(stage);
    const ctx = canvas.getContext('2d', {alpha:true});
    const images = {};
    const sources = {
      girl: 'characters/girl-full.png',
      cat: 'characters/cat-full.png',
      planet: 'earth/pink-planet.png'
    };
    for (const [name, relative] of Object.entries(sources)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = options.assets?.[name] || assetBase + '/' + relative;
      images[name] = img;
    }
    let destroyed = false;
    let paused = options.paused ?? !!(global.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches);
    let speed = Number.isFinite(options.speed) && options.speed > 0 ? options.speed : 1;
    let elapsed = 0, lastTime = 0, raf = 0;
  const rand = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s,1664525)+1013904223) >>> 0) / 4294967296); };
  const rng = rand(42877);

  // 粉色星球：整颗球顺时针自转，人和猫站在顶部原地走路（地面在脚下向后滚动）。
  const PLANET = { cx: 952, cy: 1085, r: 470 };   // r = 粉色球体（不含草）半径，舞台坐标
  const PL_IMG = { cx: 515, cy: 512, r: 398 };      // 原图里球体中心与半径
  const LIFT = -12;                                  // 人和猫画在草的前面，草保持原高度
  const MOW = { off: true, from: -16, to: 22, fade: 14, grass: 10 };  // 修剪区间（度）与保留草高
  const GH = 210, GW = GH*236/392;
  const CH = 92,  CW = CH*413/382;
  const SPIN = -0.07;                               // 弧度/秒，逆时针（人和猫朝右走，地面向左滚）
  const surfaceY = x => PLANET.cy - Math.sqrt(Math.max(0, PLANET.r*PLANET.r - (x-PLANET.cx)*(x-PLANET.cx)));

  const planetImg = images.planet;
  const stars=Array.from({length:88},(_,i)=>({
    x:37+rng()*1830, y:300+rng()*560,
    size:.9+rng()*3.6, phase:rng()*6.283,
    kind:i%5, opacity:.12+rng()*.56
  }));

  function star(s,t) {
    const pulse=.64+.36*Math.sin(t*.85+s.phase);
    ctx.save(); ctx.translate(s.x,s.y); ctx.globalAlpha=s.opacity*pulse;
    if(s.kind===0 || s.kind===3) {
      ctx.strokeStyle='#fff2de';ctx.lineWidth=1.65;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(-s.size*1.8,0);ctx.lineTo(s.size*1.8,0);ctx.moveTo(0,-s.size*1.8);ctx.lineTo(0,s.size*1.8);ctx.stroke();
    }else if(s.kind===1){
      ctx.fillStyle='#fff3d9';ctx.shadowColor='#fff2d6';ctx.shadowBlur=14;
      ctx.beginPath();ctx.moveTo(0,-s.size*2.2);ctx.quadraticCurveTo(s.size*.5,-s.size*.5,s.size*2.2,0);
      ctx.quadraticCurveTo(s.size*.5,s.size*.5,0,s.size*2.2);
      ctx.quadraticCurveTo(-s.size*.5,s.size*.5,-s.size*2.2,0);
      ctx.quadraticCurveTo(-s.size*.5,-s.size*.5,0,-s.size*2.2);ctx.fill();
    }else{
      ctx.fillStyle='#ffefd4';ctx.beginPath();ctx.arc(0,0,s.size*.36,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  function drawPlanet(t) {
    if (!planetImg.complete || !planetImg.naturalWidth) return;
    const k = PLANET.r / PL_IMG.r;
    const sx = planetImg.naturalWidth / 1024;           // 兼容换图后尺寸变化
    ctx.save();
    // 柔和光晕
    const glow = ctx.createRadialGradient(PLANET.cx,PLANET.cy,PLANET.r*.9,PLANET.cx,PLANET.cy,PLANET.r*1.35);
    glow.addColorStop(0,'rgba(255,190,210,.28)'); glow.addColorStop(1,'rgba(255,190,210,0)');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(PLANET.cx,PLANET.cy,PLANET.r*1.35,0,Math.PI*2); ctx.fill();
    // 方案二：顶部人和猫走路的这一段，草被"修剪"成短草（裁剪半径变小），两侧保持原样。
    if (!MOW.off) {
    ctx.beginPath();
    for (let deg = -180; deg <= 180; deg += 1) {
      const a = deg * Math.PI / 180;            // 0 = 正上方，正值向右
      let k2 = 0;                               // 0 = 不修剪，1 = 完全修剪
      if (deg >= MOW.from && deg <= MOW.to) k2 = 1;
      else if (deg > MOW.from - MOW.fade && deg < MOW.from) k2 = (deg - (MOW.from - MOW.fade)) / MOW.fade;
      else if (deg > MOW.to && deg < MOW.to + MOW.fade) k2 = ((MOW.to + MOW.fade) - deg) / MOW.fade;
      k2 = k2*k2*(3-2*k2);
      const R = PLANET.r * 1.5 * (1-k2) + (PLANET.r + MOW.grass) * k2;
      const x = PLANET.cx + Math.sin(a) * R, y = PLANET.cy - Math.cos(a) * R;
      deg === -180 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.clip();
    }
    ctx.translate(PLANET.cx, PLANET.cy);
    ctx.rotate(t * SPIN);                                // 正角度 = 顺时针
    ctx.scale(k/sx, k/sx);
    ctx.drawImage(planetImg, -PL_IMG.cx*sx, -PL_IMG.cy*sx);
    ctx.restore();
  }

  // 角色站在球面某个 x 处：脚底贴地，身体沿法线方向立起。
  function standOn(x, lift) {
    lift = lift || 0;
    const ang = Math.asin((x-PLANET.cx)/PLANET.r);
    const gx = PLANET.cx + Math.sin(ang)*(PLANET.r+lift);
    const gy = PLANET.cy - Math.cos(ang)*(PLANET.r+lift);
    ctx.translate(gx, gy); ctx.rotate(ang);
  }

  function drawPeople(t) {
    const step = t*2*Math.PI/.72;
    // 女孩：整张原画一起动（不再拆腿，脚和身体不会分离），朝右走，地面向左滚
    const g = images.girl;
    if (g.complete && g.naturalWidth) {
      ctx.save(); standOn(905, LIFT);
      ctx.globalAlpha=.22; ctx.fillStyle='#7a4a5a'; ctx.beginPath(); ctx.ellipse(0,2,36,6,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
      ctx.translate(0, -Math.abs(Math.sin(step))*3);
      ctx.rotate(Math.sin(step)*.035);
      ctx.drawImage(g, -GW*0.52, -GH, GW, GH);           // 新原画：完整双脚，脚底即图片底边
      ctx.restore();
    }
    // 猫走在女孩前面（右侧）
    const c = images.cat;
    if (c.complete && c.naturalWidth) {
      ctx.save(); standOn(1050, LIFT);
      ctx.globalAlpha=.22; ctx.fillStyle='#7a4a5a'; ctx.beginPath(); ctx.ellipse(0,2,28,5,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
      ctx.translate(0, -Math.abs(Math.sin(step*1.15))*2.5);
      ctx.drawImage(c, -CW*0.55, -CH, CW, CH);           // 爪底即图片底边
      ctx.restore();
    }
  }

  function render() {
    ctx.clearRect(0,0,W,H);
    stars.forEach(s=>star(s,elapsed));
    drawPlanet(elapsed);
    drawPeople(elapsed);
  }
  function animate(now) {
    if (destroyed) return;
    if (lastTime > 0) {
      const dt = Math.min((now - lastTime) / 1000, .05);
      if (!paused) elapsed += dt * speed;
    }
    lastTime = now;
    render();
    raf = global.requestAnimationFrame(animate);
  }
  function resize() {
    if (destroyed) return;
    const bounds = host.getBoundingClientRect();
    const fit = options.cover === false
      ? Math.min(bounds.width/W, bounds.height/H)
      : Math.max(bounds.width/W, bounds.height/H);
    stage.style.transform = 'translate(-50%, -50%) scale(' + Math.max(0.001,fit) + ')';
  }
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(host);
  global.addEventListener('resize', resize);
  for (const img of Object.values(images)) img.addEventListener('load', render);
  resize();
  raf = global.requestAnimationFrame(animate);
  return {
    pause() { paused = true; },
    resume() { paused = false; lastTime = 0; },
    setSpeed(next) { if (Number.isFinite(next) && next > 0) speed = next; },
    getState() { return {paused, speed, elapsed}; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      global.cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      global.removeEventListener('resize',resize);
      stage.remove();
      host.style.position = priorHostPosition;
      host.style.overflow = priorHostOverflow;
    }
  };
  }
  global.PlanetWalk = {mount};
})(window);
