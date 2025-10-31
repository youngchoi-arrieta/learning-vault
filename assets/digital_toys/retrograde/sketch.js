// === Retrograde Motion v3 ===
// Infinite-Observer + Labeled UI + Zoom/Pan + Angle Plot
// Fixes: (1) sky radius = max(RE,RM)*20  (2) full trail clear on reset/zoom/pan
// Controls: Mouse wheel=Zoom, Drag=Pan, Space=Play/Pause, R=Reset, S=Step

let state = { t: 0, playing: true, stepSize: 0.01 };
let ui = {};
let cam = { sx: 0, sy: 0, scale: 0.5, dragging: false, px: 0, py: 0 };
let trail = [];        // sky-point trail (screen-space)
let phiHistory = [];   // angle history for plot
let center;            // world origin
let trailsG;           // offscreen trails buffer (screen-space)

function setup() {
  createAdaptiveCanvas();
  colorMode(HSB, 360, 100, 100);
  textFont('monospace');
  angleMode(RADIANS);

  // --- UI (labeled sliders) ---
  let x = 12, w = 230, row = 0, gap = 24;
  ui.panel = createDiv('<b>Controls</b>').position(x, 10);
  ui.panel.style('color', '#fff');

  function labeledSlider(label, min, max, val, step) {
    const line = createDiv().position(x, 36 + gap*row++);
    line.style('color', '#ddd');
    const lab = createSpan(label + ' ').parent(line);
    const s = createSlider(min, max, val, step).parent(line);
    s.style('width', w + 'px');
    const valSpan = createSpan('').parent(line);
    s.input(() => valSpan.html('  ' + s.value()));
    valSpan.html('  ' + s.value());
    return s;
  }

  ui.radiusE = labeledSlider('Earth radius (px):', 80, 300, 140, 1);
  ui.periodE = labeledSlider('Earth period (arb):', 60, 500, 120, 1);

  ui.radiusM = labeledSlider('Mars radius (px): ', 120, 500, 260, 1);
  ui.periodM = labeledSlider('Mars period (arb): ', 80, 800, 240, 1);

  ui.speed   = labeledSlider('Sim speed (%):     ', 0, 500, 120, 1);
  ui.fps     = labeledSlider('Frame rate (fps):  ', 10, 90, 45, 1);

  const btnRow = createDiv('').position(x, 36 + gap*row++);
  createButton('⏯ Play/Pause').parent(btnRow).mousePressed(togglePlay);
  createButton('⏭ Step').parent(btnRow).mousePressed(stepOnce).style('margin-left', '8px');
  createButton('↺ Reset').parent(btnRow).mousePressed(resetSim).style('margin-left', '8px');

  const optRow = createDiv('').position(x, 36 + gap*row++);
  optRow.style('color', '#ddd');
  ui.showSkyTrail     = createCheckbox('Sky trail', true).parent(optRow);
  ui.showPlanetTrails = createCheckbox('Planet trails', true).parent(optRow);
  ui.showSkyTrail.style('margin-right', '16px');

  // offscreen trail layer (screen-space)
  trailsG = createGraphics(width, height);
  trailsG.colorMode(HSB, 360, 100, 100);
  trailsG.clear();

  center = createVector(0, 0);
  frameRate(ui.fps.value());
}

function createAdaptiveCanvas() {
  const pad = 20;
  const W = max(1100, windowWidth - pad);
  const H = max(850,  windowHeight - pad);
  createCanvas(W, H);
}

function windowResized() {
  const prev = trailsG ? trailsG.get() : null;
  resizeCanvas(max(1100, windowWidth - 20), max(850, windowHeight - 20));
  const newG = createGraphics(width, height);
  newG.colorMode(HSB, 360, 100, 100);
  newG.clear();
  if (prev) newG.image(prev, 0, 0);
  trailsG = newG;
}

function draw() {
  background(0, 0, 8);
  frameRate(ui.fps.value());
  if (state.playing) state.t += ui.speed.value() * 0.0005;

  push();
  applyCamera();
  drawWorldGrid();

  const RE = ui.radiusE.value();
  const RM = ui.radiusM.value();
  const PE = ui.periodE.value();
  const PM = ui.periodM.value();

  const thetaE = TWO_PI * (state.t / PE);
  const thetaM = TWO_PI * (state.t / PM);

  const earth = createVector(RE * cos(thetaE), RE * sin(thetaE));
  const mars  = createVector(RM * cos(thetaM), RM * sin(thetaM));

  // Orbits
  stroke(0, 0, 28); noFill();
  circle(center.x, center.y, 2*RE);
  circle(center.x, center.y, 2*RM);

  // Sun
  noStroke(); fill(50, 100, 100);
  circle(center.x, center.y, 24);

  // Planet trails (world → screen plotted into trailsG)
  if (ui.showPlanetTrails.checked()) {
    trailsG.push();
    trailsG.stroke(210, 100, 90, 60); trailsG.strokeWeight(2);
    let eScreen = worldToScreen(earth.x, earth.y);
    trailsG.point(eScreen.x, eScreen.y);
    trailsG.stroke(0, 80, 90, 60);
    let mScreen = worldToScreen(mars.x, mars.y);
    trailsG.point(mScreen.x, mScreen.y);
    trailsG.pop();
  }

  // Planets
  stroke(0,0,100,30);
  fill(210, 100, 100); circle(earth.x, earth.y, 14);
  fill(0, 80, 100);    circle(mars.x,  mars.y,  16);

  // Infinite observer: huge sky circle around Earth (dynamic, ~infinite)
  const skyR = max(RE, RM) * 3; // << 무한원 (역행현상의 관측면)의정반지름 설정
  stroke(0,0,40); noFill();
  circle(earth.x, earth.y, 2*skyR);

  // Apparent direction
  const rel = p5.Vector.sub(mars, earth);
  const dir = rel.copy().normalize();
  const skyPt = p5.Vector.add(earth, p5.Vector.mult(dir, skyR));

  // Ray + sky point
  stroke(0,0,85,60); line(earth.x, earth.y, skyPt.x, skyPt.y);
  noStroke(); fill(0,0,100);
  circle(skyPt.x, skyPt.y, 8);

  // Sky-point trail (screen-space)
  if (ui.showSkyTrail.checked() && state.playing) {
    const sp = worldToScreen(skyPt.x, skyPt.y);
    trail.push(createVector(sp.x, sp.y));
    if (trail.length > 1500) trail.shift();
  }

  pop();                // end camera
  image(trailsG, 0, 0); // draw planet trails layer
  if (ui.showSkyTrail.checked()) drawSkyTrailScreen();

  // Angle history φ(t)
  const phi = Math.atan2(rel.y, rel.x); // [-π, π]
  if (state.playing) {
    phiHistory.push({ t: state.t, phi: phi });
    if (phiHistory.length > 1200) phiHistory.shift();
  }

  drawAnglePlot(phiHistory);
  drawHUD(RE, RM, PE, PM, phi);
}

// ---------------- Camera / Transforms ----------------
function applyCamera() {
  translate(width/2 + cam.sx, height/2 + cam.sy);
  scale(cam.scale);
}
function worldToScreen(wx, wy) {
  const x = (width/2 + cam.sx) + cam.scale * wx;
  const y = (height/2 + cam.sy) + cam.scale * wy;
  return createVector(x, y);
}
function screenToWorld(sx, sy) {
  const x = (sx - (width/2 + cam.sx)) / cam.scale;
  const y = (sy - (height/2 + cam.sy)) / cam.scale;
  return createVector(x, y);
}

// --- Zoom/Pan with clean trails ---
function mouseWheel(e) {
  trailsG.clear();  // << 핵심: 줌 시 잔상 제거
  trail = [];       // sky trail도 정리
  const zoom = e.delta > 0 ? 0.9 : 1.1;

  // zoom about mouse pointer
  const before = screenToWorld(mouseX, mouseY);
  cam.scale *= zoom;
  const after = screenToWorld(mouseX, mouseY);
  const shift = p5.Vector.sub(worldToScreen(before.x, before.y), createVector(mouseX, mouseY));
  cam.sx -= shift.x;
  cam.sy -= shift.y;

  return false;
}
function mousePressed() {
  //  UI 요소(슬라이더, 버튼 등)를 클릭한 경우 카메라 드래그 비활성화
  const target = document.activeElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON')) return;

  // 캔버스 영역 안에서만 드래그 시작
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;

  cam.dragging = true;
  cam.px = mouseX;
  cam.py = mouseY;
}
function mouseReleased() { cam.dragging = false; }
function mouseDragged() {
  // 슬라이더나 버튼 위에서 드래그 중이면 무시
  const target = document.activeElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'BUTTON')) return;

  // 캔버스 영역 밖이면 무시
  if (!cam.dragging || mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;

  // 팬 로직
  trailsG.clear();
  trail = [];

  const dx = mouseX - cam.px;
  const dy = mouseY - cam.py;
  cam.sx += dx;
  cam.sy += dy;
  cam.px = mouseX;
  cam.py = mouseY;
}

// ---------------- Drawing helpers ----------------
function drawWorldGrid() {
  stroke(0, 0, 18); strokeWeight(1/cam.scale);
  const step = 50;
  for (let x = -2000; x <= 2000; x += step) line(x, -2000, x, 2000);
  for (let y = -2000; y <= 2000; y += step) line(-2000, y, 2000, y);
  stroke(0, 0, 30); strokeWeight(2/cam.scale);
  line(-2000, 0, 2000, 0);
  line(0, -2000, 0, 2000);
}
function drawSkyTrailScreen() {
  noStroke(); fill(0, 0, 100, 70);
  for (const p of trail) circle(p.x, p.y, 4);
}
function drawAnglePlot(hist) {
  const margin = 12, W = 420, H = 160;
  const x0 = width - W - margin, y0 = height - H - margin;

  noStroke(); fill(0, 0, 15, 90);
  rect(x0, y0, W, H, 10);

  stroke(0, 0, 50); strokeWeight(1);
  line(x0+40, y0+H-30, x0+W-10, y0+H-30);
  line(x0+40, y0+20,   x0+40,   y0+H-30);

  const yForPhi = (phi) => map(phi, -PI, PI, y0+H-30, y0+20);
  fill(0, 0, 80); noStroke(); textSize(10);
  text('π',   x0+12, yForPhi(PI)   + 4);
  text('0',   x0+16, yForPhi(0)    + 4);
  text('-π',  x0+8,  yForPhi(-PI)  + 4);

  const Tspan = 30;  // seconds-like window
  const tmax = hist.length ? hist[hist.length-1].t : 0;
  const tmin = tmax - Tspan;

  noFill(); stroke(200, 80, 100); strokeWeight(2);
  beginShape();
  for (const p of hist) {
    if (p.t < tmin) continue;
    const xx = map(p.t, tmin, tmax, x0+40, x0+W-10);
    const yy = yForPhi(wrapPi(p.phi));
    vertex(xx, yy);
  }
  endShape();

  fill(0, 0, 90); noStroke(); textSize(12);
  text('Apparent angle φ(t) [Earth view]', x0+60, y0+16);
  textSize(10);
  text(`${nf(max(tmin,0),1,1)}s`, x0+40,   y0+H-14);
  text(`${nf(tmax,1,1)}s`,       x0+W-48, y0+H-14);
}
function wrapPi(a) {
  let x = a;
  while (x >  PI) x -= TWO_PI;
  while (x < -PI) x += TWO_PI;
  return x;
}
function drawHUD(RE, RM, PE, PM, phi) {
  const pad = 10, boxW = 500, boxH = 100;
  noStroke(); fill(0, 0, 15, 90);
  rect(pad, height - boxH - pad, boxW, boxH, 10);

  fill(0, 0, 95); textSize(12);
  const lines = [
    `t=${state.t.toFixed(3)}  |  playing=${state.playing}  |  FPS=${ui.fps.value()}  |  zoom=${cam.scale.toFixed(2)}`,
    `Earth: R=${RE}px, P=${PE}   |   Mars: R=${RM}px, P=${PM}`,
    `φ(t)=atan2(M−E) = ${degrees(phi).toFixed(2)}°   (retrograde when dφ/dt < 0)`
  ];
  let y = height - boxH + 18;
  for (const s of lines) { text(s, pad + 12, y); y += 18; }
}

// ---------------- Controls ----------------
function togglePlay() { state.playing = !state.playing; }
function stepOnce()   { state.playing = false; state.t += state.stepSize; }
function resetSim() {
  state.t = 0;
  trail = [];
  phiHistory = [];
  trailsG.clear();   // << 핵심: 버퍼 완전 초기화
}
function keyPressed() {
  if (key === ' ') togglePlay();
  if (key === 'R' || key === 'r') resetSim();
  if (key === 'S' || key === 's') stepOnce();
}
