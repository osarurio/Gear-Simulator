const stage = document.getElementById("stage");
      const ctx = stage.getContext("2d");
      const runBtn = document.getElementById("runBtn");
      const clearBtn = document.getElementById("clearBtn");
      const langBtn = document.getElementById("langBtn");
      const statusBadge = document.getElementById("statusBadge");
      const modeValue = document.getElementById("modeValue");
      const selectedValue = document.getElementById("selectedValue");
      const gearEditor = document.getElementById("gearEditor");
      const gearTeethLabel = document.getElementById("gearTeethLabel");
      const teethInput = document.getElementById("teethInput");
      const smallTeethRow = document.getElementById("smallTeethRow");
      const smallTeethLabel = document.getElementById("smallTeethLabel");
      const smallTeethInput = document.getElementById("smallTeethInput");
      const motorSpeedRow = document.getElementById("motorSpeedRow");
      const motorSpeedLabel = document.getElementById("motorSpeedLabel");
      const motorSpeedInput = document.getElementById("motorSpeedInput");
      const deleteBtn = document.getElementById("deleteBtn");
      const tray = document.getElementById("tray");

      const paletteItems = [...tray.querySelectorAll(".tray-item")];
      const gears = [];
      const drag = { active: false, gear: null, offsetX: 0, offsetY: 0, source: null, pointerId: null, group: null, box: null, snapshotTaken: false };
      const dragTemplate = { kind: null, teeth: 0, radius: 0 };
      const sim = { running: false, lastT: performance.now(), scale: 1 };
      const world = { width: 0, height: 0, sidebarWidth: 260, headerHeight: 72 };
      const gearKinds = ["gear", "two-stage", "ratchet", "motor"];
      const ui = { lang: "ja", error: "" };
      const history = { undo: [], redo: [], limit: 5 };
      const strings = {
        ja: {
          title: "ギアシミュレーター",
          subtitle: "ギアを置いて、かみ合わせて、Runで回す。",
          run: "Run",
          stop: "Stop",
          clear: "clear",
          language: "English",
          library: "Gear Library",
          mode: "Mode",
          selected: "Selected",
          ready: "Ready",
          running: "Running",
          stopped: "Stopped",
          motorActive: "Motor active",
          motorSpeed: "Seconds / 1 rev",
          dragHint: "ライブラリから歯車をドラッグして置きます。近づくとスナップし、Runでモーターが動きます。",
          selectHint: "歯車を選ぶと歯数を編集できます。Shiftで複数選択できます。",
          teeth: "歯数",
          bigTeeth: "大歯数",
          smallTeeth: "小歯数",
          delete: "削除",
          noSelection: "歯車を選択してください。",
          selectedOne: "選択中",
          selectedMany: "選択中",
          errorSameDirection: "エラー: 同じ向きで回る歯車がかみ合っています",
          errorRatchet: "ラチェットは逆方向の回転を受け流します",
          leftMotor: "モーター",
          leftStandard: "標準",
          leftTwoStage: "2段",
          leftRatchet: "ラチェット",
        },
        en: {
          title: "Gear Simulator",
          subtitle: "Place gears, snap them together, and press Run.",
          run: "Run",
          stop: "Stop",
          clear: "Clear",
          language: "日本語",
          library: "Gear Library",
          mode: "Mode",
          selected: "Selected",
          ready: "Ready",
          running: "Running",
          stopped: "Stopped",
          motorActive: "Motor active",
          motorSpeed: "Seconds / 1 rev",
          dragHint: "Drag gears from the library into the workspace. Nearby gears snap and Run animates the motor gear.",
          selectHint: "Select a gear to edit its teeth. Hold Shift for multi-select.",
          teeth: "Teeth",
          bigTeeth: "Big",
          smallTeeth: "Small",
          delete: "Delete",
          noSelection: "Select a gear.",
          selectedOne: "Selected",
          selectedMany: "Selected",
          errorSameDirection: "Error: meshed gears are rotating the same way",
          errorRatchet: "Ratchet lets reverse motion slip through",
          leftMotor: "Motor",
          leftStandard: "Standard",
          leftTwoStage: "Two-stage",
          leftRatchet: "Ratchet",
        },
      };
      const t = (key) => strings[ui.lang][key] ?? key;

      function applyLanguage() {
        document.documentElement.lang = ui.lang === "ja" ? "ja" : "en";
        document.querySelector(".title h1").textContent = t("title");
        document.querySelector(".title p").textContent = t("subtitle");
        document.getElementById("runBtn").textContent = sim.running ? t("stop") : t("run");
        document.getElementById("clearBtn").textContent = t("clear");
        document.getElementById("langBtn").textContent = t("language");
        document.querySelector(".panel-label").textContent = t("library");
        document.querySelector(".hud .hud-row:nth-child(1) span").textContent = t("mode");
        document.querySelector(".hud .hud-row:nth-child(2) span").textContent = t("selected");
        document.querySelector(".hint").textContent = t("dragHint");
        gearTeethLabel.textContent = t("teeth");
        if (selectedGear?.kind === "two-stage") {
          gearTeethLabel.textContent = t("bigTeeth");
        }
        smallTeethLabel.textContent = t("smallTeeth");
        motorSpeedLabel.textContent = t("motorSpeed");
        deleteBtn.title = t("delete");
        if (!selectedGearIds.size) selectedValue.textContent = "None";
        updateLanguageInTray();
        draw();
      }

      function captureState() {
        return {
          gears: gears.map((g) => ({ ...g })),
          selectedIds: [...selectedGearIds],
          primaryId: primarySelectedGear?.id || null,
          lang: ui.lang,
        };
      }

      function pushHistory() {
        history.undo.push(captureState());
        if (history.undo.length > history.limit) history.undo.shift();
        history.redo.length = 0;
      }

      function restoreState(state) {
        gears.length = 0;
        for (const g of state.gears) gears.push({ ...g });
        selectedGearIds.clear();
        for (const id of state.selectedIds) selectedGearIds.add(id);
        primarySelectedGear = gears.find((g) => g.id === state.primaryId) || gears[0] || null;
        selectedGear = primarySelectedGear;
        ui.lang = state.lang || "ja";
        applyLanguage();
        updateSelection();
        resolveConnections();
      }

      function undo() {
        if (!history.undo.length) return;
        history.redo.push(captureState());
        const state = history.undo.pop();
        restoreState(state);
      }

      function redo() {
        if (!history.redo.length) return;
        history.undo.push(captureState());
        const state = history.redo.pop();
        restoreState(state);
      }

      function updateLanguageInTray() {
        const items = tray.querySelectorAll(".tray-item");
        items.forEach((item) => {
          const kind = item.dataset.kind;
          const strong = item.querySelector("strong");
          const span = item.querySelector("span");
          if (kind === "motor") {
            strong.textContent = ui.lang === "ja" ? "モーター" : "Motor";
            span.textContent = ui.lang === "ja" ? "24歯。Runで回り始める起点。" : "24 teeth. Starts the system when Run is active.";
          } else if (kind === "gear") {
            strong.textContent = ui.lang === "ja" ? "標準" : "Standard";
            span.textContent = ui.lang === "ja" ? "24歯。基本の歯車。" : "24 teeth. Plain gear for everyday chaining.";
          } else if (kind === "two-stage") {
            strong.textContent = ui.lang === "ja" ? "2段" : "Two-stage";
            span.textContent = ui.lang === "ja" ? "24歯。二段構成。" : "24 teeth. Compact dual-level transmission.";
          } else if (kind === "ratchet") {
            strong.textContent = ui.lang === "ja" ? "ラチェット" : "Ratchet";
            span.textContent = ui.lang === "ja" ? "24歯。片方向だけ受ける。" : "24 teeth. One-way motion feel.";
          }
        });
      }

      function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        world.width = stage.clientWidth;
        world.height = stage.clientHeight;
        stage.width = world.width * dpr;
        stage.height = world.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function gearPath(ctx, cx, cy, radius, teeth, rotation, stroke = "#eaf5ff", kind = "gear", options = {}) {
        const toothDepth = radius * 0.1;
        const innerRadius = radius - toothDepth;
        const holeRadius = options.holeRadius ?? radius * 0.45;
        const drawHole = options.drawHole !== false;
        const step = Math.PI * 2 / teeth;
        const toothWidth = step * 0.26;
        const valleyWidth = step * 0.18;
        ctx.beginPath();
        for (let i = 0; i < teeth; i++) {
          const base = rotation + i * step;
          const leftTip = base - toothWidth * 0.45;
          const rightTip = base + toothWidth * 0.45;
          const valleyPrev = base - step * 0.5 + valleyWidth * 0.5;
          const valleyNext = base + step * 0.5 - valleyWidth * 0.5;
          const pLeft = [cx + Math.cos(leftTip) * radius, cy + Math.sin(leftTip) * radius];
          const pTip = [cx + Math.cos(base) * radius, cy + Math.sin(base) * radius];
          const pRight = [cx + Math.cos(rightTip) * radius, cy + Math.sin(rightTip) * radius];
          const pPrev = [cx + Math.cos(valleyPrev) * innerRadius, cy + Math.sin(valleyPrev) * innerRadius];
          const pNext = [cx + Math.cos(valleyNext) * innerRadius, cy + Math.sin(valleyNext) * innerRadius];
          if (i === 0) ctx.moveTo(pPrev[0], pPrev[1]);
          ctx.quadraticCurveTo(pLeft[0], pLeft[1], pTip[0], pTip[1]);
          ctx.quadraticCurveTo(pRight[0], pRight[1], pNext[0], pNext[1]);
          if (kind === "ratchet") {
            ctx.lineTo(cx + Math.cos(base + step * 0.06) * (radius + toothDepth * 0.35), cy + Math.sin(base + step * 0.06) * (radius + toothDepth * 0.35));
          }
        }
        ctx.closePath();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = options.lineWidth || 1.6;
        ctx.stroke();
        if (drawHole) {
          ctx.save();
          ctx.fillStyle = options.holeFill || "#081b31";
          ctx.beginPath();
          ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = options.holeStrokeWidth || 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, holeRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      function createGear({ x, y, teeth, radius, kind }) {
        return {
          id: crypto.randomUUID(),
          x,
          y,
          teeth,
          smallTeeth: kind === "two-stage" ? 12 : null,
          radius,
          pitch: radius / teeth,
          kind,
          angle: 0,
          secondsPerRev: kind === "motor" ? 1.2 : null,
          speed: kind === "motor" ? (Math.PI * 2) / 1.2 : 0,
          running: kind === "motor",
          fixed: false,
          snappedTo: null,
          orientation: 0,
          smallRadius: kind === "two-stage" ? Math.max(10, (radius / teeth) * 12) : null,
        };
      }

      function addGear(template, x, y) {
        const gear = createGear({
          x,
          y,
          teeth: template.teeth,
          radius: template.radius,
          kind: template.kind,
        });
        gears.push(gear);
        selectSingle(gear);
        return gear;
      }

      function pointInGear(g, x, y) {
        const dx = x - g.x;
        const dy = y - g.y;
        return Math.hypot(dx, dy) <= g.radius + 10;
      }

      function gearAt(x, y) {
        for (let i = gears.length - 1; i >= 0; i--) {
          if (pointInGear(gears[i], x, y)) return gears[i];
        }
        return null;
      }

      function pointerToStage(e) {
        const rect = stage.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }

      function snapGear(moving, fixed) {
        const dx = moving.x - fixed.x;
        const dy = moving.y - fixed.y;
        const dist = Math.hypot(dx, dy) || 1;
        const target = moving.radius + fixed.radius;
        const nx = dx / dist;
        const ny = dy / dist;
        moving.x = fixed.x + nx * target;
        moving.y = fixed.y + ny * target;

        const fixedStep = Math.PI * 2 / fixed.teeth;
        const movingStep = Math.PI * 2 / moving.teeth;
        const facing = Math.atan2(dy, dx);
        const contactFixed = facing;
        const contactMoving = facing + Math.PI;
        const toothCenterOffsetFixed = fixedStep * 0.14;
        const toothCenterOffsetMoving = movingStep * 0.14;
        const nearestFixed = Math.round((contactFixed - toothCenterOffsetFixed) / fixedStep) * fixedStep + toothCenterOffsetFixed;
        const nearestMoving = Math.round((contactMoving - toothCenterOffsetMoving) / movingStep) * movingStep + toothCenterOffsetMoving;
        fixed.angle = nearestFixed;
        moving.angle = nearestMoving;
        moving.snappedTo = fixed.id;
      }

      function resolveConnections() {
        for (const g of gears) {
          g.snappedTo = null;
        }
        for (let i = 0; i < gears.length; i++) {
          for (let j = i + 1; j < gears.length; j++) {
            const a = gears[i];
            const b = gears[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            const target = a.radius + b.radius;
            if (Math.abs(dist - target) < 14) {
              if (!drag.active || drag.gear !== a) snapGear(a, b);
            }
          }
        }
        checkForErrors();
      }

      function checkForErrors() {
        ui.error = "";
        for (let i = 0; i < gears.length; i++) {
          for (let j = i + 1; j < gears.length; j++) {
            const a = gears[i];
            const b = gears[j];
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            if (Math.abs(dist - (a.radius + b.radius)) > 14) continue;
            const sameDirection = Math.sign(a.speed || 0) === Math.sign(b.speed || 0) && Math.sign(a.speed || 0) !== 0;
            if (sameDirection && a.kind !== "ratchet" && b.kind !== "ratchet") {
              ui.error = t("errorSameDirection");
              statusBadge.textContent = ui.error;
              return;
            }
          }
        }
        if (statusBadge.textContent === t("errorSameDirection")) {
          statusBadge.textContent = sim.running ? t("motorActive") : t("ready");
        }
      }

      function updateMotion(dt) {
        if (!sim.running) return;
        const visited = new Set();
        const queue = gears.filter((g) => g.kind === "motor" && g.running).map((g) => ({ gear: g, omega: g.speed }));
        while (queue.length) {
          const { gear: g, omega } = queue.shift();
          if (visited.has(g.id)) continue;
          visited.add(g.id);
          g.speed = omega;
          g.angle += omega * dt;
          for (const other of gears) {
            if (other.id === g.id) continue;
            const dx = other.x - g.x;
            const dy = other.y - g.y;
            const dist = Math.hypot(dx, dy);
            const target = g.radius + other.radius;
            if (Math.abs(dist - target) < 16) {
              const ratio = g.teeth / other.teeth;
              const nextOmega = -omega * ratio;
              if (g.kind === "ratchet" && omega < 0) continue;
              if (other.kind === "ratchet" && nextOmega < 0) continue;
              other.angle += nextOmega * dt;
              other.speed = nextOmega;
              other.running = true;
              queue.push({ gear: other, omega: nextOmega });
            }
          }
        }
        for (const g of gears) {
          if (!visited.has(g.id) && g.kind !== "motor") {
            g.running = false;
            g.speed = 0;
          }
        }
        checkForErrors();
      }

      function drawGrid() {
        const step = 32;
        ctx.save();
        ctx.strokeStyle = "rgba(180, 220, 255, 0.08)";
        ctx.lineWidth = 1;
        for (let x = 0; x < world.width; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, world.height);
          ctx.stroke();
        }
        for (let y = 0; y < world.height; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(world.width, y);
          ctx.stroke();
        }
        ctx.restore();
      }

      function drawGear(g) {
        ctx.save();
        ctx.lineWidth = g.kind === "motor" ? 2.2 : 1.8;
        ctx.shadowColor = "rgba(104, 191, 255, 0.25)";
        ctx.shadowBlur = 10;
        const stroke = g.kind === "motor" ? "#f4fbff" : "#d7ecff";
        ctx.translate(g.x, g.y);
        ctx.rotate(g.orientation || 0);
        if (g.kind === "two-stage") {
          gearPath(ctx, 0, 0, g.radius, g.teeth, g.angle, stroke, g.kind, { drawHole: false, lineWidth: 1.6 });
          const innerRadius = g.smallRadius || Math.max(12, g.radius * 0.48);
          gearPath(ctx, 0, 0, innerRadius, g.smallTeeth || 12, -g.angle * 1.4, stroke, g.kind, { drawHole: false, lineWidth: 1.2 });
        } else {
          gearPath(ctx, 0, 0, g.radius, g.teeth, g.angle, stroke, g.kind, { holeRadius: g.radius * 0.42 });
        }

        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1;
        const markerX = Math.cos(g.angle) * g.radius * 0.92;
        const markerY = Math.sin(g.angle) * g.radius * 0.92;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(markerX, markerY);
        ctx.stroke();

        ctx.fillStyle = g.kind === "motor" ? "#87d4ff" : "#7fbbe7";
        ctx.beginPath();
        ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
        ctx.fill();

        if (g.kind === "motor") {
          ctx.strokeStyle = "rgba(135, 212, 255, 0.95)";
          ctx.beginPath();
          ctx.arc(0, 0, g.radius + 6, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (selectedGearIds.has(g.id)) {
          ctx.strokeStyle = "rgba(171, 229, 255, 0.95)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, g.radius + 12, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      function drawConnectionHint() {
        if (!drag.active || !drag.gear) return;
        for (const other of gears) {
          if (other.id === drag.gear.id) continue;
          const dx = other.x - drag.gear.x;
          const dy = other.y - drag.gear.y;
          const dist = Math.hypot(dx, dy);
          const target = other.radius + drag.gear.radius;
          if (Math.abs(dist - target) < 14) {
            ctx.save();
            ctx.strokeStyle = "rgba(156, 220, 255, 0.9)";
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(drag.gear.x, drag.gear.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
            ctx.restore();
            break;
          }
        }
      }

      function drawSelectionBox() {
        if (!drag.box) return;
        const { x1, y1, x2, y2 } = drag.box;
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        ctx.save();
        ctx.fillStyle = "rgba(121, 195, 255, 0.12)";
        ctx.strokeStyle = "rgba(171, 229, 255, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 5]);
        ctx.fillRect(left, top, width, height);
        ctx.strokeRect(left, top, width, height);
        ctx.restore();
      }

      function draw() {
        const now = performance.now();
        const dt = Math.min((now - sim.lastT) / 1000, 0.033);
        sim.lastT = now;
        if (sim.running) updateMotion(dt);
        ctx.clearRect(0, 0, world.width, world.height);
        drawGrid();

        const panelX = world.sidebarWidth + 18;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX, 16, world.width - panelX - 32, world.height - 32);
        ctx.restore();

        for (const g of gears) drawGear(g);
        drawConnectionHint();
        drawSelectionBox();

        if (!gears.length) {
          ctx.save();
          ctx.fillStyle = "rgba(234,245,255,0.78)";
          ctx.font = "600 18px Yu Gothic UI, Yu Gothic, Meiryo, sans-serif";
          ctx.fillText("Drag a gear from the library to start.", panelX + 24, 52);
          ctx.fillStyle = "rgba(159,192,222,0.9)";
          ctx.font = "14px Yu Gothic UI, Yu Gothic, Meiryo, sans-serif";
          ctx.fillText("Snap-tooth alignment is automatic when gears get close enough.", panelX + 24, 78);
          ctx.restore();
        }

        requestAnimationFrame(draw);
      }

      function setRunning(next) {
        sim.running = next;
        runBtn.classList.toggle("active", next);
        runBtn.textContent = next ? t("stop") : t("run");
        modeValue.textContent = next ? t("running") : t("stopped");
        statusBadge.textContent = next ? t("motorActive") : t("ready");
        for (const gear of gears) {
          if (gear.kind === "motor" && gear.secondsPerRev) {
            gear.speed = (Math.PI * 2) / gear.secondsPerRev;
            gear.running = next;
          }
        }
      }

      const selectedGearIds = new Set();
      let primarySelectedGear = null;
      let selectedGear = null;
      let lastPickKey = null;
      let lastPickIndex = 0;

      function getSelectedGears() {
        return gears.filter((g) => selectedGearIds.has(g.id));
      }

      function setSelection(gearsToSelect, primary = null) {
        selectedGearIds.clear();
        for (const gear of gearsToSelect) selectedGearIds.add(gear.id);
        primarySelectedGear = primary || gearsToSelect[0] || null;
        updateSelection();
      }

      function selectSingle(gear) {
        setSelection(gear ? [gear] : [], gear || null);
      }

      function gearsAtPoint(x, y) {
        const hits = [];
        for (let i = gears.length - 1; i >= 0; i--) {
          if (pointInGear(gears[i], x, y)) hits.push(gears[i]);
        }
        return hits;
      }

      function selectAtPoint(x, y, shiftKey = false) {
        const hits = gearsAtPoint(x, y);
        if (!hits.length) {
          if (!shiftKey) setSelection([]);
          if (!shiftKey) {
            lastPickKey = null;
            lastPickIndex = 0;
          }
          return null;
        }
        const key = `${Math.round(x)}:${Math.round(y)}`;
        if (shiftKey) {
          const target = hits[0];
          if (selectedGearIds.has(target.id)) {
            selectedGearIds.delete(target.id);
            if (primarySelectedGear?.id === target.id) primarySelectedGear = getSelectedGears()[0] || null;
          } else {
            selectedGearIds.add(target.id);
            primarySelectedGear = target;
          }
          lastPickKey = key;
          lastPickIndex = 0;
          updateSelection();
          return target;
        }
        if (lastPickKey === key) {
          lastPickIndex = (lastPickIndex + 1) % hits.length;
        } else {
          lastPickKey = key;
          lastPickIndex = 0;
        }
        const target = hits[lastPickIndex];
        setSelection([target], target);
        return target;
      }

      function rectIntersectsGear(rect, gear) {
        const left = Math.min(rect.x1, rect.x2);
        const right = Math.max(rect.x1, rect.x2);
        const top = Math.min(rect.y1, rect.y2);
        const bottom = Math.max(rect.y1, rect.y2);
        const closestX = Math.max(left, Math.min(gear.x, right));
        const closestY = Math.max(top, Math.min(gear.y, bottom));
        const dx = gear.x - closestX;
        const dy = gear.y - closestY;
        return dx * dx + dy * dy <= gear.radius * gear.radius;
      }

      function selectByBox(rect, shiftKey = false) {
        const hits = gears.filter((gear) => rectIntersectsGear(rect, gear));
        if (!hits.length) {
          if (!shiftKey) setSelection([]);
          return;
        }
        if (shiftKey) {
          const merged = new Map(getSelectedGears().map((g) => [g.id, g]));
          for (const gear of hits) merged.set(gear.id, gear);
          setSelection([...merged.values()], hits[hits.length - 1]);
        } else {
          setSelection(hits, hits[hits.length - 1]);
        }
      }

      function connectedGearsOf(gear) {
        return gears.filter((other) => {
          if (other.id === gear.id) return false;
          const dist = Math.hypot(other.x - gear.x, other.y - gear.y);
          return Math.abs(dist - (other.radius + gear.radius)) < 16;
        });
      }

      function updateSelection() {
        const selected = getSelectedGears();
        if (!selected.length) {
          selectedValue.textContent = "None";
          gearEditor.classList.remove("active");
          teethInput.value = "";
          smallTeethRow.style.display = "none";
          motorSpeedRow.style.display = "none";
          motorSpeedInput.value = "";
          selectedGear = null;
          return;
        }
        const gear = primarySelectedGear || selected[0];
        selectedGear = gear;
        selectedValue.textContent = selected.length > 1 ? `${selected.length} selected` : (ui.lang === "ja" ? (gear.kind === "two-stage" ? "2段ギア" : "歯車") : (gear.kind === "two-stage" ? "Two-stage" : "Gear"));
        gearEditor.classList.add("active");
        teethInput.value = String(gear.teeth);
        smallTeethRow.style.display = gear.kind === "two-stage" ? "grid" : "none";
        smallTeethInput.value = gear.kind === "two-stage" ? String(gear.smallTeeth || 12) : "";
        motorSpeedRow.style.display = gear.kind === "motor" ? "grid" : "none";
        if (gear.kind === "motor") {
          const secondsPerRev = gear.secondsPerRev || 1.2;
          motorSpeedInput.value = String(Number(secondsPerRev.toFixed(1)));
        } else {
          motorSpeedInput.value = "";
        }
      }

      function deleteSelectedGear() {
        const ids = new Set(selectedGearIds);
        if (!ids.size) return;
        pushHistory();
        for (let i = gears.length - 1; i >= 0; i--) {
          if (ids.has(gears[i].id)) gears.splice(i, 1);
        }
        selectedGearIds.clear();
        primarySelectedGear = null;
        selectedGear = null;
        updateSelection();
      }

      function cycleType() {
        const gear = primarySelectedGear;
        if (!gear) return;
        const idx = gearKinds.indexOf(gear.kind);
        gear.kind = gearKinds[(idx + 1) % gearKinds.length];
        if (gear.kind === "bevel") gear.orientation = Math.PI / 2;
        if (gear.kind === "motor") {
          gear.running = true;
          gear.speed = 1.2;
        } else if (gear.speed === 1.2) {
          gear.speed = 0;
        }
        updateSelection();
      }

      function rotateSelected() {
        const gear = primarySelectedGear;
        if (!gear) return;
        gear.orientation = (gear.orientation || 0) + Math.PI / 2;
        updateSelection();
      }

      function resizeGearWithPitch(gear, teeth) {
        const oldRadius = gear.radius;
        const oldTeeth = gear.teeth || 1;
        const pitch = gear.pitch || (oldRadius / oldTeeth);
        const neighbors = connectedGearsOf(gear);
        const anchor = neighbors.length ? neighbors[Math.floor(Math.random() * neighbors.length)] : null;
        const oldAngle = anchor ? Math.atan2(gear.y - anchor.y, gear.x - anchor.x) : null;

        gear.teeth = teeth;
        gear.pitch = pitch;
        gear.radius = Math.max(10, pitch * teeth);
        if (gear.kind === "two-stage" && gear.smallTeeth) {
          gear.smallRadius = Math.max(10, pitch * gear.smallTeeth);
        }

        if (anchor) {
          const target = gear.radius + anchor.radius;
          gear.x = anchor.x + Math.cos(oldAngle) * target;
          gear.y = anchor.y + Math.sin(oldAngle) * target;
        }
      }
      paletteItems.forEach((item) => {
        const c = item.querySelector("canvas");
        const cctx = c.getContext("2d");
        const teeth = Number(item.dataset.teeth);
        const radius = Number(item.dataset.radius);
        const kind = item.dataset.kind;
        if (kind === "two-stage") {
          gearPath(cctx, 32, 32, radius * 0.55, teeth, 0, "#d9ecff", kind, { drawHole: false, lineWidth: 1.2 });
          gearPath(cctx, 32, 32, radius * 0.28, 12, Math.PI / 7, "#d9ecff", kind, { drawHole: false, lineWidth: 1 });
        } else {
          gearPath(cctx, 32, 32, radius * 0.55, teeth, kind === "bevel" ? -Math.PI / 2 : 0, kind === "motor" ? "#f8fdff" : "#d9ecff", kind);
        }

        item.addEventListener("dragstart", (e) => {
          dragTemplate.kind = kind;
          dragTemplate.teeth = teeth;
          dragTemplate.radius = radius;
          e.dataTransfer?.setData("text/plain", JSON.stringify({ kind, teeth, radius }));
          e.dataTransfer?.setDragImage(c, 32, 32);
          item.classList.add("dragging");
        });
        item.addEventListener("dragend", () => item.classList.remove("dragging"));
      });

      stage.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      stage.addEventListener("drop", (e) => {
        e.preventDefault();
        const data = e.dataTransfer?.getData("text/plain");
        const payload = data ? JSON.parse(data) : dragTemplate;
        if (!payload?.kind) return;
        pushHistory();
        const rect = stage.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const gear = createGear({
          x: Math.max(world.sidebarWidth + payload.radius + 18, Math.min(world.width - payload.radius - 18, x)),
          y: Math.max(88 + payload.radius + 18, Math.min(world.height - payload.radius - 18, y)),
          teeth: payload.teeth,
          radius: payload.radius,
          kind: payload.kind,
        });
        gears.push(gear);
        selectSingle(gear);
        resolveConnections();
        drag.active = false;
        drag.gear = null;
      });

      stage.addEventListener("pointerdown", (e) => {
        const pt = pointerToStage(e);
        const gear = selectAtPoint(pt.x, pt.y, e.shiftKey);
        if (!gear) {
          drag.active = true;
          drag.gear = null;
          drag.box = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, shiftKey: e.shiftKey };
          drag.pointerId = e.pointerId;
          drag.source = "box";
          stage.setPointerCapture(e.pointerId);
          if (!e.shiftKey) {
            selectedGearIds.clear();
            primarySelectedGear = null;
            selectedGear = null;
            updateSelection();
          }
          return;
        }
        drag.active = true;
        drag.gear = gear;
        drag.snapshotTaken = false;
        const selected = getSelectedGears();
        drag.offsetX = pt.x - gear.x;
        drag.offsetY = pt.y - gear.y;
        drag.group = selected.map((g) => ({ gear: g, x: g.x, y: g.y }));
        drag.source = "workspace";
        drag.pointerId = e.pointerId;
        stage.setPointerCapture(e.pointerId);
      });

      stage.addEventListener("pointermove", (e) => {
        const pt = pointerToStage(e);
        if (drag.active && drag.box) {
          drag.box.x2 = pt.x;
          drag.box.y2 = pt.y;
          return;
        }
        if (!drag.active || !drag.gear) return;
        const dx = (pt.x - drag.offsetX) - drag.gear.x;
        const dy = (pt.y - drag.offsetY) - drag.gear.y;
        if (!drag.snapshotTaken && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
          pushHistory();
          drag.snapshotTaken = true;
        }
        if (drag.group?.length > 1 && selectedGearIds.has(drag.gear.id)) {
          for (const item of drag.group) {
            item.gear.x = item.x + dx;
            item.gear.y = item.y + dy;
          }
        } else {
          drag.gear.x = pt.x - drag.offsetX;
          drag.gear.y = pt.y - drag.offsetY;
        }
      });

      function finishDrag() {
        if (!drag.active) return;
        if (drag.box) {
          selectByBox(drag.box, drag.box.shiftKey);
          drag.active = false;
          drag.box = null;
          drag.gear = null;
          drag.group = null;
          return;
        }
        if (!drag.gear) return;
        if (drag.group?.length > 1 && selectedGearIds.has(drag.gear.id)) {
          for (const item of drag.group) {
            item.gear.x = Math.max(world.sidebarWidth + item.gear.radius + 10, Math.min(world.width - item.gear.radius - 10, item.gear.x));
            item.gear.y = Math.max(88 + item.gear.radius + 10, Math.min(world.height - item.gear.radius - 10, item.gear.y));
          }
        } else {
          drag.gear.x = Math.max(world.sidebarWidth + drag.gear.radius + 10, Math.min(world.width - drag.gear.radius - 10, drag.gear.x));
          drag.gear.y = Math.max(88 + drag.gear.radius + 10, Math.min(world.height - drag.gear.radius - 10, drag.gear.y));
        }
        resolveConnections();
        if (drag.gear.kind === "motor") {
          drag.gear.running = true;
          drag.gear.speed = 1.2;
        }
        drag.active = false;
        drag.gear = null;
        drag.group = null;
        drag.snapshotTaken = false;
      }

      stage.addEventListener("pointerup", finishDrag);
      stage.addEventListener("pointercancel", finishDrag);
      runBtn.addEventListener("click", () => {
        setRunning(!sim.running);
        if (sim.running) {
          const motor = gears.find((g) => g.kind === "motor");
          if (motor) {
            motor.running = true;
            motor.speed = 1.2;
          }
        }
      });

      langBtn.addEventListener("click", () => {
        ui.lang = ui.lang === "ja" ? "en" : "ja";
        applyLanguage();
      });

      clearBtn.addEventListener("click", () => {
        if (gears.length) pushHistory();
        gears.length = 0;
        primarySelectedGear = null;
        updateSelection();
        setRunning(false);
        statusBadge.textContent = "Ready";
      });
      teethInput.addEventListener("change", () => {
        const selected = getSelectedGears();
        if (!selected.length) return;
        const teeth = Math.max(6, Math.round(Number(teethInput.value) || selected[0].teeth));
        pushHistory();
        for (const gear of selected) {
          if (gear.kind === "two-stage") {
            resizeGearWithPitch(gear, teeth);
          } else {
            resizeGearWithPitch(gear, teeth);
          }
        }
        updateSelection();
        resolveConnections();
      });
      smallTeethInput.addEventListener("change", () => {
        const gear = primarySelectedGear;
        if (!gear || gear.kind !== "two-stage") return;
        const smallTeeth = Math.max(3, Math.round(Number(smallTeethInput.value) || gear.smallTeeth || 12));
        pushHistory();
        gear.smallTeeth = smallTeeth;
        updateSelection();
        resolveConnections();
      });
      motorSpeedInput.addEventListener("change", () => {
        const gear = primarySelectedGear;
        if (!gear || gear.kind !== "motor") return;
        const secondsPerRev = Math.max(0.1, Number(motorSpeedInput.value) || gear.secondsPerRev || 1.2);
        pushHistory();
        gear.secondsPerRev = secondsPerRev;
        gear.speed = (Math.PI * 2) / secondsPerRev;
        gear.running = true;
        updateSelection();
      });
      deleteBtn.addEventListener("click", deleteSelectedGear);

      window.addEventListener("keydown", (e) => {
        if (e.key === "Delete") {
          if (selectedGearIds.size) {
            e.preventDefault();
            deleteSelectedGear();
          }
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
      });

      window.addEventListener("resize", resize);
      resize();
      applyLanguage();
      updateSelection();
      updateSelection();
      draw();
