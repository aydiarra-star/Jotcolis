/* Globe de voyage Dakar–Paris : projection sphérique dessinée en Canvas, sans dépendance externe. */
(() => {
  const canvas = document.getElementById("world-canvas");
  if (!canvas || typeof canvas.getContext !== "function") return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  const directionOutput = document.getElementById("flight-direction");
  const resetButton = document.getElementById("globe-reset");
  const westButton = document.getElementById("globe-turn-left");
  const eastButton = document.getElementById("globe-turn-right");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const PARIS = { name: "PARIS", longitude: 2.3522, latitude: 48.8566, color: "gold" };
  const DAKAR = { name: "DAKAR", longitude: -17.4677, latitude: 14.7167, color: "aqua" };
  const TRAVEL_TIME = 7600;
  const STOP_TIME = 1800;
  const FLIGHT_CYCLE = (TRAVEL_TIME + STOP_TIME) * 2;

  // Simplified coastlines: intentionally stylised, not a navigational map.
  const LAND_POLYGONS = [
    [[-17, 37], [-9, 36], [-3, 36], [4, 36], [10, 37], [13, 33], [20, 33], [27, 32], [34, 29], [37, 21], [43, 12], [42, 3], [40, -2], [40, -11], [35, -17], [31, -25], [27, -33], [19, -35], [12, -34], [8, -29], [3, -21], [1, -11], [-5, -3], [-9, 4], [-14, 10], [-17, 15], [-16, 21], [-12, 25], [-17, 29], [-13, 33], [-17, 37]],
    [[-11, 36], [-10, 42], [-8, 47], [-5, 51], [-2, 54], [2, 56], [6, 55], [9, 58], [14, 57], [17, 59], [22, 57], [26, 55], [30, 54], [32, 50], [28, 47], [24, 45], [20, 43], [17, 40], [13, 42], [10, 44], [7, 43], [4, 44], [1, 41], [-3, 42], [-7, 38], [-11, 36]],
    [[4, 56], [6, 60], [7, 64], [10, 68], [14, 71], [18, 69], [19, 65], [23, 61], [21, 58], [17, 57], [13, 59], [10, 56], [4, 56]],
    [[30, 55], [34, 58], [42, 57], [48, 53], [55, 55], [62, 57], [68, 55], [75, 58], [83, 57], [91, 59], [101, 56], [110, 52], [119, 49], [129, 48], [139, 51], [149, 46], [153, 41], [145, 38], [136, 35], [128, 31], [120, 27], [116, 20], [108, 17], [105, 9], [98, 6], [94, 13], [88, 20], [82, 22], [78, 28], [70, 27], [65, 23], [59, 24], [53, 28], [48, 30], [43, 34], [38, 37], [34, 43], [30, 48], [30, 55]],
    [[35, 31], [42, 31], [48, 28], [54, 24], [52, 19], [49, 15], [45, 13], [42, 17], [39, 21], [35, 25], [35, 31]],
    [[-168, 64], [-154, 71], [-140, 69], [-132, 61], [-124, 55], [-128, 48], [-123, 41], [-117, 33], [-109, 30], [-105, 24], [-98, 25], [-92, 19], [-86, 16], [-82, 10], [-78, 9], [-77, 17], [-81, 24], [-80, 31], [-74, 39], [-66, 45], [-71, 50], [-83, 55], [-95, 59], [-107, 61], [-119, 68], [-135, 71], [-151, 73], [-168, 64]],
    [[-81, 12], [-75, 9], [-69, 11], [-63, 9], [-58, 5], [-52, 3], [-49, -3], [-51, -11], [-55, -17], [-58, -24], [-63, -30], [-67, -39], [-71, -50], [-76, -53], [-73, -38], [-78, -25], [-80, -10], [-81, 12]],
    [[47, -13], [50, -16], [50, -23], [47, -26], [45, -20], [47, -13]],
    [[-10, 50], [-7, 55], [-4, 58], [0, 57], [2, 53], [-2, 50], [-6, 50], [-10, 50]]
  ];

  const state = {
    centerLongitude: -7,
    centerLatitude: 23,
    width: 0,
    height: 0,
    radius: 0,
    pixelRatio: 1,
    dragging: false,
    pointerX: 0,
    pointerY: 0,
    longitudeVelocity: 0,
    latitudeVelocity: 0,
    lastFrame: 0,
    frameId: 0,
    hidden: document.hidden,
    visible: true,
    flightStartedAt: performance.now(),
    lastFlightLabel: ""
  };

  function pointInPolygon(longitude, latitude, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const crosses = (yi > latitude) !== (yj > latitude)
        && longitude < ((xj - xi) * (latitude - yi)) / ((yj - yi) || 0.000001) + xi;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function makeLandDots() {
    const dots = [];
    let seed = 781921;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let latitude = -52; latitude <= 74; latitude += 3.1) {
      for (let longitude = -178; longitude <= 178; longitude += 4.2) {
        const land = LAND_POLYGONS.some((polygon) => pointInPolygon(longitude, latitude, polygon));
        if (land && random() > 0.12) {
          dots.push({
            longitude: longitude + (random() - .5) * 2.7,
            latitude: latitude + (random() - .5) * 2.1,
            size: .45 + random() * .72,
            shimmer: random()
          });
        }
      }
    }
    return dots;
  }

  const landDots = makeLandDots();

  function project(longitude, latitude) {
    const phi = latitude * RAD;
    const phi0 = state.centerLatitude * RAD;
    const delta = (longitude - state.centerLongitude) * RAD;
    const cosPhi = Math.cos(phi);
    const depth = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * cosPhi * Math.cos(delta);
    const x = cosPhi * Math.sin(delta);
    const y = Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * cosPhi * Math.cos(delta);
    return {
      x: state.width / 2 + x * state.radius,
      y: state.height / 2 - y * state.radius,
      depth
    };
  }

  function toVector(city) {
    const latitude = city.latitude * RAD;
    const longitude = city.longitude * RAD;
    return [Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude)];
  }

  function greatCirclePoint(start, end, amount) {
    const a = toVector(start);
    const b = toVector(end);
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const angle = Math.acos(dot);
    const sinAngle = Math.sin(angle) || 1;
    const firstWeight = Math.sin((1 - amount) * angle) / sinAngle;
    const secondWeight = Math.sin(amount * angle) / sinAngle;
    const x = a[0] * firstWeight + b[0] * secondWeight;
    const y = a[1] * firstWeight + b[1] * secondWeight;
    const z = a[2] * firstWeight + b[2] * secondWeight;
    return {
      longitude: Math.atan2(z, x) * DEG,
      latitude: Math.atan2(y, Math.hypot(x, z)) * DEG
    };
  }

  const route = Array.from({ length: 81 }, (_, index) => greatCirclePoint(PARIS, DAKAR, index / 80));

  function getFlightState(now) {
    if (reducedMotion.matches) {
      return { routeAmount: .5, label: "Paris → Dakar" };
    }
    const phase = ((now - state.flightStartedAt) % FLIGHT_CYCLE + FLIGHT_CYCLE) % FLIGHT_CYCLE;
    if (phase < TRAVEL_TIME) {
      return { routeAmount: phase / TRAVEL_TIME, label: "Paris → Dakar" };
    }
    if (phase < TRAVEL_TIME + STOP_TIME) {
      return { routeAmount: 1, label: "Escale à Dakar" };
    }
    if (phase < (TRAVEL_TIME * 2) + STOP_TIME) {
      const returnProgress = (phase - TRAVEL_TIME - STOP_TIME) / TRAVEL_TIME;
      return { routeAmount: 1 - returnProgress, label: "Dakar → Paris" };
    }
    return { routeAmount: 0, label: "Escale à Paris" };
  }

  function updateDirectionLabel(label) {
    if (label === state.lastFlightLabel) return;
    state.lastFlightLabel = label;
    if (directionOutput) directionOutput.textContent = label;
  }

  function strokeVisibleLine(points, color, width, shadow = 0) {
    context.save();
    context.beginPath();
    context.lineWidth = width;
    context.strokeStyle = color;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.shadowColor = color;
    context.shadowBlur = shadow;
    let drawing = false;
    for (const point of points) {
      const projected = project(point.longitude, point.latitude);
      if (projected.depth > .025) {
        if (!drawing) context.moveTo(projected.x, projected.y);
        else context.lineTo(projected.x, projected.y);
        drawing = true;
      } else {
        drawing = false;
      }
    }
    context.stroke();
    context.restore();
  }

  function drawGraticule() {
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const points = [];
      for (let longitude = -180; longitude <= 180; longitude += 3) points.push({ longitude, latitude });
      strokeVisibleLine(points, latitude === 0 ? "rgba(146, 182, 197, .21)" : "rgba(134, 174, 192, .14)", latitude === 0 ? .8 : .55);
    }
    for (let longitude = -180; longitude < 180; longitude += 30) {
      const points = [];
      for (let latitude = -87; latitude <= 87; latitude += 3) points.push({ longitude, latitude });
      strokeVisibleLine(points, "rgba(134, 174, 192, .13)", .55);
    }
  }

  function tracePolygon(polygon, closePath) {
    const projected = polygon.map(([longitude, latitude]) => project(longitude, latitude));
    if (closePath && projected.every((point) => point.depth > .025)) {
      context.beginPath();
      context.moveTo(projected[0].x, projected[0].y);
      for (let index = 1; index < projected.length; index += 1) context.lineTo(projected[index].x, projected[index].y);
      context.closePath();
      context.fill();
    }
    context.save();
    context.beginPath();
    context.strokeStyle = "rgba(231, 194, 116, .48)";
    context.lineWidth = .9;
    context.shadowColor = "rgba(213, 179, 107, .25)";
    context.shadowBlur = 4;
    let drawing = false;
    for (const point of projected) {
      if (point.depth > .025) {
        if (!drawing) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
        drawing = true;
      } else {
        drawing = false;
      }
    }
    if (projected.every((point) => point.depth > .025)) context.closePath();
    context.stroke();
    context.restore();
  }

  function drawContinents(now) {
    const landGradient = context.createLinearGradient(
      state.width * .22, state.height * .2, state.width * .77, state.height * .82
    );
    landGradient.addColorStop(0, "rgba(219, 190, 127, .52)");
    landGradient.addColorStop(.48, "rgba(160, 145, 106, .44)");
    landGradient.addColorStop(1, "rgba(75, 123, 139, .42)");
    context.fillStyle = landGradient;
    for (const polygon of LAND_POLYGONS) tracePolygon(polygon, true);

    const shimmer = .75 + Math.sin(now / 1450) * .12;
    context.save();
    for (const dot of landDots) {
      const point = project(dot.longitude, dot.latitude);
      if (point.depth < .04) continue;
      const alpha = Math.min(.72, (.28 + point.depth * .35) * shimmer * (.62 + dot.shimmer * .44));
      context.globalAlpha = alpha;
      context.beginPath();
      context.arc(point.x, point.y, dot.size, 0, Math.PI * 2);
      context.fillStyle = dot.shimmer > .82 ? "#f47721" : "#ff9a52";
      context.fill();
    }
    context.restore();
  }

  function drawRoute(flight) {
    strokeVisibleLine(route, "rgba(235, 190, 103, .2)", 3.4, 8);
    strokeVisibleLine(route, "rgba(245, 211, 137, .78)", 1.25, 5);

    const position = greatCirclePoint(PARIS, DAKAR, flight.routeAmount);
    const point = project(position.longitude, position.latitude);
    if (point.depth <= .025) return;

    const previous = greatCirclePoint(PARIS, DAKAR, Math.max(0, flight.routeAmount - .012));
    const next = greatCirclePoint(PARIS, DAKAR, Math.min(1, flight.routeAmount + .012));
    const previousPoint = project(previous.longitude, previous.latitude);
    const nextPoint = project(next.longitude, next.latitude);
    let angle = Math.atan2(nextPoint.y - previousPoint.y, nextPoint.x - previousPoint.x);
    if (flight.label === "Dakar → Paris" || flight.label === "Escale à Paris") angle += Math.PI;

    context.save();
    context.translate(point.x, point.y);
    context.rotate(angle);
    context.shadowColor = "rgba(255, 210, 112, .95)";
    context.shadowBlur = 16;
    const metal = context.createLinearGradient(-13, -7, 13, 7);
    metal.addColorStop(0, "#fff0e3");
    metal.addColorStop(.48, "#f47721");
    metal.addColorStop(1, "#c65308");
    context.fillStyle = metal;
    context.beginPath();
    context.moveTo(13, 0);
    context.lineTo(1, 2.1);
    context.lineTo(-4.7, 8);
    context.lineTo(-6.2, 7.7);
    context.lineTo(-3.5, 2.2);
    context.lineTo(-10, 1.3);
    context.lineTo(-12.7, 4.1);
    context.lineTo(-14, 3.5);
    context.lineTo(-12, -.4);
    context.lineTo(-13.1, -2.4);
    context.lineTo(-10, -2.5);
    context.lineTo(-3.5, -1.9);
    context.lineTo(-6.1, -7.6);
    context.lineTo(-4.8, -8.2);
    context.lineTo(1, -2.2);
    context.closePath();
    context.fill();
    context.restore();

    context.save();
    context.beginPath();
    context.arc(point.x, point.y, 3.3, 0, Math.PI * 2);
    context.fillStyle = "rgba(255, 229, 162, .86)";
    context.shadowColor = "rgba(255, 198, 94, .9)";
    context.shadowBlur = 13;
    context.fill();
    context.restore();
  }

  function drawCity(city, now) {
    const point = project(city.longitude, city.latitude);
    if (point.depth < .06) return;
    const isParis = city.color === "gold";
    const tint = isParis ? "#ff9a52" : "#f47721";
    const pulse = .5 + (Math.sin(now / 360 + (isParis ? 0 : 1.4)) + 1) * .18;
    context.save();
    context.globalAlpha = pulse;
    context.beginPath();
    context.arc(point.x, point.y, 7.1, 0, Math.PI * 2);
    context.strokeStyle = tint;
    context.lineWidth = .7;
    context.shadowColor = tint;
    context.shadowBlur = 13;
    context.stroke();
    context.restore();
    context.save();
    context.beginPath();
    context.arc(point.x, point.y, 2.8, 0, Math.PI * 2);
    context.fillStyle = tint;
    context.shadowColor = tint;
    context.shadowBlur = 12;
    context.fill();
    context.beginPath();
    context.arc(point.x, point.y, 1, 0, Math.PI * 2);
    context.fillStyle = "#fffaf6";
    context.fill();
    context.font = "700 8px ui-sans-serif, system-ui, sans-serif";
    context.textBaseline = "middle";
    context.textAlign = "left";
    context.shadowBlur = 6;
    context.shadowColor = "rgba(0, 0, 0, .9)";
    context.fillStyle = isParis ? "#fff0e3" : "#ffdfbd";
    context.fillText(city.name, point.x + 10, point.y - 1);
    context.restore();
  }

  function drawGlobe(now) {
    if (!state.width || !state.height) return;
    const width = state.width;
    const height = state.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = state.radius;
    const flight = getFlightState(now);
    updateDirectionLabel(flight.label);
    context.clearRect(0, 0, width, height);

    // Orbital accents remain outside the clipped sphere.
    context.save();
    context.beginPath();
    context.arc(cx, cy, radius + 1.5, 0, Math.PI * 2);
    context.strokeStyle = "rgba(137, 202, 214, .62)";
    context.lineWidth = 1.1;
    context.shadowColor = "rgba(60, 185, 213, .35)";
    context.shadowBlur = 14;
    context.stroke();
    context.restore();

    context.save();
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.clip();

    const ocean = context.createRadialGradient(cx - radius * .36, cy - radius * .39, radius * .03, cx, cy, radius * 1.12);
    ocean.addColorStop(0, "#fff0e3");
    ocean.addColorStop(.45, "#fffaf6");
    ocean.addColorStop(.8, "#fff5ed");
    ocean.addColorStop(1, "#fffaf6");
    context.fillStyle = ocean;
    context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    const surfaceLight = context.createRadialGradient(cx - radius * .34, cy - radius * .38, radius * .04, cx, cy, radius * 1.06);
    surfaceLight.addColorStop(0, "rgba(127, 203, 217, .13)");
    surfaceLight.addColorStop(.58, "rgba(74, 139, 164, .045)");
    surfaceLight.addColorStop(1, "rgba(0, 4, 12, .69)");
    context.fillStyle = surfaceLight;
    context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    drawGraticule();
    drawContinents(now);
    drawRoute(flight);
    drawCity(PARIS, now);
    drawCity(DAKAR, now);
    context.restore();

    // Fine glass rim and the atmospheric lower edge.
    context.save();
    const rim = context.createRadialGradient(cx - radius * .33, cy - radius * .36, radius * .67, cx, cy, radius * 1.02);
    rim.addColorStop(0, "rgba(0, 0, 0, 0)");
    rim.addColorStop(.83, "rgba(1, 7, 14, .08)");
    rim.addColorStop(1, "rgba(108, 195, 213, .17)");
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = rim;
    context.fill();
    context.beginPath();
    context.arc(cx, cy, radius - .4, 0, Math.PI * 2);
    context.strokeStyle = "rgba(184, 221, 222, .22)";
    context.lineWidth = .65;
    context.stroke();
    context.restore();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.width = rect.width;
    state.height = rect.height;
    state.radius = Math.min(rect.width, rect.height) * .415;
    state.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * state.pixelRatio);
    canvas.height = Math.round(rect.height * state.pixelRatio);
    context.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
    drawGlobe(performance.now());
  }

  function clampLatitude(value) {
    return Math.max(-70, Math.min(70, value));
  }

  function wrapLongitude(value) {
    return ((value + 180) % 360 + 360) % 360 - 180;
  }

  function queueFrame() {
    if (!state.hidden && state.visible && state.frameId === 0) state.frameId = window.requestAnimationFrame(animateFrame);
  }

  function animateFrame(now) {
    state.frameId = 0;
    if (state.hidden) return;
    const delta = Math.min(34, Math.max(0, now - (state.lastFrame || now)));
    state.lastFrame = now;
    if (!state.dragging && !reducedMotion.matches) {
      if (Math.abs(state.longitudeVelocity) > .00003 || Math.abs(state.latitudeVelocity) > .00003) {
        state.centerLongitude = wrapLongitude(state.centerLongitude + state.longitudeVelocity * delta);
        state.centerLatitude = clampLatitude(state.centerLatitude + state.latitudeVelocity * delta);
        state.longitudeVelocity *= .91;
        state.latitudeVelocity *= .91;
      } else {
        state.longitudeVelocity = 0;
        state.latitudeVelocity = 0;
      }
    }
    drawGlobe(now);
    if (!reducedMotion.matches || state.dragging || state.longitudeVelocity || state.latitudeVelocity) queueFrame();
  }

  function rotateBy(longitude, latitude = 0) {
    state.centerLongitude = wrapLongitude(state.centerLongitude + longitude);
    state.centerLatitude = clampLatitude(state.centerLatitude + latitude);
    state.longitudeVelocity = 0;
    state.latitudeVelocity = 0;
    drawGlobe(performance.now());
    queueFrame();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    state.dragging = true;
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    state.longitudeVelocity = 0;
    state.latitudeVelocity = 0;
    canvas.classList.add("is-dragging");
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const deltaX = event.clientX - state.pointerX;
    const deltaY = event.clientY - state.pointerY;
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    state.centerLongitude = wrapLongitude(state.centerLongitude - deltaX * .48);
    state.centerLatitude = clampLatitude(state.centerLatitude + deltaY * .42);
    state.longitudeVelocity = -deltaX * .027;
    state.latitudeVelocity = deltaY * .024;
    queueFrame();
  });

  function stopDragging() {
    if (!state.dragging) return;
    state.dragging = false;
    canvas.classList.remove("is-dragging");
    queueFrame();
  }
  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);
  canvas.addEventListener("lostpointercapture", stopDragging);

  if (resetButton) resetButton.addEventListener("click", () => {
    state.centerLongitude = -7;
    state.centerLatitude = 23;
    state.longitudeVelocity = 0;
    state.latitudeVelocity = 0;
    drawGlobe(performance.now());
    queueFrame();
  });
  if (westButton) westButton.addEventListener("click", () => rotateBy(-20));
  if (eastButton) eastButton.addEventListener("click", () => rotateBy(20));

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
  } else {
    window.addEventListener("resize", resizeCanvas, { passive: true });
  }

  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver((entries) => {
      state.visible = Boolean(entries[0] && entries[0].isIntersecting);
      if (!state.visible && state.frameId) {
        window.cancelAnimationFrame(state.frameId);
        state.frameId = 0;
      } else {
        state.lastFrame = 0;
        queueFrame();
      }
    }, { threshold: .02 });
    observer.observe(canvas);
  }

  document.addEventListener("visibilitychange", () => {
    state.hidden = document.hidden;
    if (state.hidden && state.frameId) {
      window.cancelAnimationFrame(state.frameId);
      state.frameId = 0;
    } else {
      state.lastFrame = 0;
      queueFrame();
    }
  });

  if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", () => {
      drawGlobe(performance.now());
      if (!reducedMotion.matches) queueFrame();
    });
  }

  resizeCanvas();
  if (!reducedMotion.matches) queueFrame();
})();
