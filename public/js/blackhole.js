/**
 * Gravity wells
 *
 * Click empty space to drop a black hole. It pulls on the particle field (and on the
 * other holes), swallows whatever strays inside its horizon and grows. Drag a hole to
 * move it, let go mid-drag to fling it. Holes that touch merge; one that grows past
 * the limit, or that you double-click, goes unstable and detonates, scattering
 * everything nearby.
 */
(function () {
    var canvas = document.getElementById('c');
    if (!canvas) return;

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Configs
    var BACKGROUND     = '#2f3136',
        G              = 0.15,     // well pull; acceleration = G * mass / distance
        SOFTENING      = 140,      // px^2, keeps close passes finite
        MAX_SPEED      = 12,
        PARTICLE_DRAG  = 0.999,
        WELL_DRAG      = 0.97,
        START_RADIUS   = 10,
        RADIUS_LIMIT   = 65,
        EAT_GROWTH     = 2.2,      // px^2 of horizon area gained per particle eaten
        MAX_WELLS      = 16,
        UNSTABLE_TIME  = 45,       // frames a well shakes before it detonates
        TRAIL_FADE     = 0.28,
        SWIRL          = 0.35,     // sideways share of a well's pull, so infall spirals
        STIR_RADIUS    = 90,
        BLAST_RADIUS   = 420,
        // Slow -> fast particle colours
        SPEED_BANDS    = ['#8f9bb3', '#c3cde0', '#e6ecf7', '#ffffff', '#bfe0ff'];


    // Vars
    var ctx, buf, bufCtx,
        width, height, dpr,
        particles = [],
        wells = [],
        blasts = [],
        pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, inside: false },
        hovered = null,
        dragged = null,
        vignette;


    /**
     * Particle
     */
    function placeParticle(p, onEdge) {
        if (onEdge) {
            // Drift back in from a random edge
            var side = Math.floor(Math.random() * 4);
            p.x = side === 0 ? -5 : side === 1 ? width + 5 : Math.random() * width;
            p.y = side === 2 ? -5 : side === 3 ? height + 5 : Math.random() * height;
            p.vx = (width / 2 - p.x) * 0.002 + (Math.random() - 0.5) * 0.6;
            p.vy = (height / 2 - p.y) * 0.002 + (Math.random() - 0.5) * 0.6;
        } else {
            p.x = Math.random() * width;
            p.y = Math.random() * height;
            p.vx = Math.random() * 2 - 1;
            p.vy = Math.random() * 2 - 1;
        }
        p.px = p.x;
        p.py = p.y;
        return p;
    }

    function populate() {
        var n = Math.round(Math.min(Math.max(width * height / 2200, 300), 900));
        if (reducedMotion) n = Math.round(n * 0.6);
        while (particles.length < n) particles.push(placeParticle({}, false));
        particles.length = n;
    }


    /**
     * Well
     */
    function Well(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = START_RADIUS;     // physical horizon
        this.shown = 0;                 // drawn radius, springs toward `radius`
        this.shownVel = 0;
        this.glow = 1;                  // flares when it feeds or merges
        this.dying = 0;                 // > 0 while unstable, counts up to detonation
        this.spin = Math.random() < 0.5 ? -SWIRL : SWIRL;
    }

    Well.prototype.mass = function () {
        return this.radius * this.radius;
    };

    Well.prototype.grow = function (area) {
        this.radius = Math.sqrt(this.radius * this.radius + area);
        if (this.radius > RADIUS_LIMIT && !this.dying) this.dying = 1;
    };

    Well.prototype.hit = function (x, y) {
        var dx = x - this.x, dy = y - this.y, r = Math.max(this.shown * 1.4, 18);
        return dx * dx + dy * dy < r * r;
    };

    function detonate(w) {
        var i = wells.indexOf(w);
        if (i < 0) return;
        wells.splice(i, 1);
        if (dragged === w) dragged = null;
        if (hovered === w) hovered = null;
        blasts.push({
            x: w.x, y: w.y, r: w.shown, prev: 0,
            power: 0.6 + w.radius / RADIUS_LIMIT * 0.8,
            flash: 1
        });
        updateCursor();
    }


    /**
     * Sizing
     */
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = buf.width = Math.round(width * dpr);
        canvas.height = buf.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bufCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        var cx = width / 2, cy = height / 2;
        vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.7)');

        populate();
    }


    /**
     * Input
     */
    function topWellAt(x, y) {
        for (var i = wells.length - 1; i >= 0; i--) {
            if (wells[i].hit(x, y)) return wells[i];
        }
        return null;
    }

    function updateCursor() {
        canvas.style.cursor = dragged ? 'grabbing' : hovered ? 'grab' : 'crosshair';
    }

    window.addEventListener('pointermove', function (e) {
        if (pointer.inside) {
            // Smoothed pointer velocity, used for stirring and for flinging a dragged well
            pointer.vx = pointer.vx * 0.5 + (e.clientX - pointer.x) * 0.5;
            pointer.vy = pointer.vy * 0.5 + (e.clientY - pointer.y) * 0.5;
        }
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.inside = true;
        if (!dragged) hovered = topWellAt(pointer.x, pointer.y);
        updateCursor();
    });

    document.addEventListener('pointerleave', function () {
        pointer.inside = false;
        hovered = null;
    });

    canvas.addEventListener('pointerdown', function (e) {
        canvas.setPointerCapture(e.pointerId);
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.vx = pointer.vy = 0;

        var w = topWellAt(pointer.x, pointer.y);
        if (w) {
            dragged = w;
            w.offX = w.x - pointer.x;
            w.offY = w.y - pointer.y;
        } else if (wells.length < MAX_WELLS) {
            wells.push(new Well(pointer.x, pointer.y));
        }
        updateCursor();
    });

    function endDrag() {
        if (dragged) {
            var s = Math.hypot(pointer.vx, pointer.vy), cap = 14;
            var k = s > cap ? cap / s : 1;
            dragged.vx = pointer.vx * k * 0.6;
            dragged.vy = pointer.vy * k * 0.6;
        }
        dragged = null;
        updateCursor();
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('dblclick', function (e) {
        var w = topWellAt(e.clientX, e.clientY);
        if (w && !w.dying) w.dying = 1;
    });


    /**
     * Simulation
     */
    function stepWells(dt) {
        var i, j, a, b, dx, dy, d2, d, f, big, small, ma, mb;

        for (i = 0; i < wells.length; i++) {
            a = wells[i];

            for (j = i + 1; j < wells.length; j++) {
                b = wells[j];
                dx = b.x - a.x;
                dy = b.y - a.y;
                d2 = dx * dx + dy * dy;
                d = Math.sqrt(d2) || 1;

                // Merge: the bigger one keeps the combined area and momentum
                if (d < (a.radius + b.radius) * 0.7) {
                    big = a.radius >= b.radius ? a : b;
                    small = big === a ? b : a;
                    ma = big.mass();
                    mb = small.mass();
                    if (big !== dragged) {
                        big.vx = (big.vx * ma + small.vx * mb) / (ma + mb);
                        big.vy = (big.vy * ma + small.vy * mb) / (ma + mb);
                    }
                    big.grow(mb);
                    big.glow = 1;
                    big.shownVel += 2;
                    if (small === dragged) {
                        dragged = big;
                        big.offX = big.x - pointer.x;
                        big.offY = big.y - pointer.y;
                    }
                    if (small === hovered) hovered = big;
                    wells.splice(wells.indexOf(small), 1);
                    if (small === a) { i--; break; }
                    j--;
                    continue;
                }

                f = G * 0.12 * dt / (d2 + SOFTENING);
                a.vx += dx * f * b.mass();
                a.vy += dy * f * b.mass();
                b.vx -= dx * f * a.mass();
                b.vy -= dy * f * a.mass();
            }
        }

        for (i = wells.length - 1; i >= 0; i--) {
            a = wells[i];

            if (a === dragged) {
                a.x = pointer.x + a.offX;
                a.y = pointer.y + a.offY;
                a.vx = a.vy = 0;
            } else {
                a.vx *= Math.pow(WELL_DRAG, dt);
                a.vy *= Math.pow(WELL_DRAG, dt);
                a.x += a.vx * dt;
                a.y += a.vy * dt;
                // Bounce off the screen edges so flung wells stay in play
                if (a.x < 0)      { a.x = 0;      a.vx =  Math.abs(a.vx) * 0.5; }
                if (a.x > width)  { a.x = width;  a.vx = -Math.abs(a.vx) * 0.5; }
                if (a.y < 0)      { a.y = 0;      a.vy =  Math.abs(a.vy) * 0.5; }
                if (a.y > height) { a.y = height; a.vy = -Math.abs(a.vy) * 0.5; }
            }

            // Springy display radius, as in the original
            a.shownVel = (a.shownVel + (a.radius - a.shown) * 0.07 * dt) * Math.pow(0.9, dt);
            a.shown = Math.max(0, a.shown + a.shownVel * dt);
            a.glow *= Math.pow(0.95, dt);

            if (a.dying) {
                a.dying += dt;
                if (a.dying > UNSTABLE_TIME) detonate(a);
            }
        }
    }

    function stepParticles(dt) {
        var i, j, p, w, dx, dy, d2, f, s, n = particles.length, nw = wells.length,
            stir = pointer.inside && !dragged && (Math.abs(pointer.vx) + Math.abs(pointer.vy) > 0.5),
            s2 = STIR_RADIUS * STIR_RADIUS,
            drag = Math.pow(PARTICLE_DRAG, dt);

        for (i = 0; i < n; i++) {
            p = particles[i];

            for (j = 0; j < nw; j++) {
                w = wells[j];
                dx = w.x - p.x;
                dy = w.y - p.y;
                d2 = dx * dx + dy * dy;
                if (d2 < w.radius * w.radius * 0.6) {
                    w.grow(EAT_GROWTH);
                    w.glow = Math.min(1, w.glow + 0.15);
                    placeParticle(p, true);
                    break;
                }
                // 2D gravity falls off as 1/r, which gives nice long orbits
                f = G * w.mass() * dt / (d2 + SOFTENING);
                p.vx += (dx - dy * w.spin) * f;
                p.vy += (dy + dx * w.spin) * f;
            }

            if (stir) {
                dx = p.x - pointer.x;
                dy = p.y - pointer.y;
                d2 = dx * dx + dy * dy;
                if (d2 < s2) {
                    f = (1 - Math.sqrt(d2) / STIR_RADIUS) * 0.05 * dt;
                    p.vx += pointer.vx * f;
                    p.vy += pointer.vy * f;
                }
            }

            p.vx *= drag;
            p.vy *= drag;
            s = p.vx * p.vx + p.vy * p.vy;
            if (s > MAX_SPEED * MAX_SPEED) {
                s = MAX_SPEED / Math.sqrt(s);
                p.vx *= s;
                p.vy *= s;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Wrap around the screen; NaN fails every comparison, so recycle those too
            if (!(p.x > -30 && p.x < width + 30 && p.y > -30 && p.y < height + 30)) {
                if (p.x !== p.x || p.y !== p.y) {
                    placeParticle(p, true);
                } else {
                    if (p.x < -30) p.x += width + 60; else if (p.x > width + 30) p.x -= width + 60;
                    if (p.y < -30) p.y += height + 60; else if (p.y > height + 30) p.y -= height + 60;
                    p.px = p.x;
                    p.py = p.y;
                }
            }
        }
    }

    function stepBlasts(dt) {
        var i, j, b, p, w, dx, dy, d, f, n = particles.length;

        for (i = blasts.length - 1; i >= 0; i--) {
            b = blasts[i];
            b.prev = b.r;
            b.r += 11 * dt;
            b.flash *= Math.pow(0.88, dt);

            // Kick everything once, as the front sweeps past it
            for (j = 0; j < n; j++) {
                p = particles[j];
                dx = p.x - b.x;
                dy = p.y - b.y;
                d = Math.sqrt(dx * dx + dy * dy) || 1;
                if (d >= b.prev && d < b.r) {
                    f = b.power * 9 * (1 - d / BLAST_RADIUS) / d;
                    p.vx += dx * f;
                    p.vy += dy * f;
                }
            }
            for (j = 0; j < wells.length; j++) {
                w = wells[j];
                dx = w.x - b.x;
                dy = w.y - b.y;
                d = Math.sqrt(dx * dx + dy * dy) || 1;
                if (d >= b.prev && d < b.r && w !== dragged) {
                    f = b.power * 4 * (1 - d / BLAST_RADIUS) / d;
                    w.vx += dx * f;
                    w.vy += dy * f;
                }
            }

            if (b.r > BLAST_RADIUS) blasts.splice(i, 1);
        }
    }


    /**
     * Rendering
     */
    var bands = SPEED_BANDS.map(function () { return []; });

    function drawParticles() {
        var i, b, p, list, s, n = particles.length;

        bufCtx.save();
        bufCtx.globalCompositeOperation = 'destination-out';
        bufCtx.globalAlpha = TRAIL_FADE;
        bufCtx.fillRect(0, 0, width, height);
        bufCtx.restore();

        for (b = 0; b < bands.length; b++) bands[b].length = 0;
        for (i = 0; i < n; i++) {
            p = particles[i];
            s = Math.sqrt(p.vx * p.vx + p.vy * p.vy) / MAX_SPEED;
            b = Math.min(bands.length - 1, Math.floor(Math.sqrt(s) * bands.length)) || 0;
            bands[b].push(p);
        }

        bufCtx.save();
        bufCtx.lineCap = 'round';
        bufCtx.globalCompositeOperation = 'lighter';
        for (b = 0; b < bands.length; b++) {
            list = bands[b];
            if (!list.length) continue;
            bufCtx.strokeStyle = SPEED_BANDS[b];
            bufCtx.globalAlpha = 0.55 + b * 0.1;
            bufCtx.lineWidth = 1.6 + b * 0.15;
            bufCtx.beginPath();
            for (i = 0; i < list.length; i++) {
                p = list[i];
                bufCtx.moveTo(p.px, p.py);
                bufCtx.lineTo(p.x + 0.01, p.y);
            }
            bufCtx.stroke();
        }
        bufCtx.restore();
    }

    function wellPose(w) {
        var x = w.x, y = w.y, r = w.shown, t;
        // Unstable: shake and pinch inward before detonating
        if (w.dying) {
            t = Math.min(1, w.dying / UNSTABLE_TIME);
            x += (Math.random() - 0.5) * t * t * 8;
            y += (Math.random() - 0.5) * t * t * 8;
            r *= 1 - t * 0.35;
        }
        return { x: x, y: y, r: r };
    }

    function drawWellGlow(w, pose) {
        var x = pose.x, y = pose.y, r = pose.r, g;
        if (r < 0.5) return;

        var heat = w.dying
            ? Math.min(1, w.dying / UNSTABLE_TIME)
            : Math.max(0, (w.radius / RADIUS_LIMIT - 0.75) * 4) * 0.4;
        var lit = 0.55 + w.glow * 0.45 + (w === hovered || w === dragged ? 0.25 : 0);
        var flicker = 0.85 + Math.random() * 0.15;
        // The original's blue, shading to white-hot as it destabilises
        var rgb = Math.round(64 + heat * 191) + ',' + Math.round(97 + heat * 120) + ',' + Math.round(163 + heat * 60);

        // Lensing shadow, as in the original
        g = ctx.createRadialGradient(x, y, r, x, y, r * 5);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 5, 0, Math.PI * 2);
        ctx.fill();

        // Accretion glow
        g = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 2.4);
        g.addColorStop(0, 'rgba(' + rgb + ',' + (0.75 * lit * flicker).toFixed(3) + ')');
        g.addColorStop(0.35, 'rgba(' + rgb + ',' + (0.22 * lit).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        w.ring = 'rgba(' + rgb.split(',').map(function (c, k) {
            return Math.min(255, +c + [150, 130, 92][k]);
        }).join(',') + ',' + Math.min(1, 0.35 + 0.5 * lit * flicker).toFixed(3) + ')';
    }

    function drawWellCore(w, pose) {
        var x = pose.x, y = pose.y, r = pose.r, g;
        if (r < 0.5) return;

        // Horizon goes over the trails so swallowed particles vanish into it
        g = ctx.createRadialGradient(x, y, r * 0.7, x, y, r);
        g.addColorStop(0, '#000');
        g.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Photon ring
        ctx.strokeStyle = w.ring;
        ctx.lineWidth = 1.2 + w.glow;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawBlasts() {
        var i, b, life, g, fr;
        for (i = 0; i < blasts.length; i++) {
            b = blasts[i];
            life = Math.max(0, 1 - b.r / BLAST_RADIUS);
            if (b.flash > 0.02) {
                fr = 160 * b.power;
                g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, fr);
                g.addColorStop(0, 'rgba(235, 242, 255, ' + (b.flash * 0.8).toFixed(3) + ')');
                g.addColorStop(1, 'rgba(120, 160, 255, 0)');
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(b.x, b.y, fr, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            ctx.strokeStyle = 'rgba(190, 215, 255, ' + (life * 0.45).toFixed(3) + ')';
            ctx.lineWidth = 1 + life * 3;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.stroke();
        }
    }


    /**
     * Loop
     */
    ctx = canvas.getContext('2d');
    buf = document.createElement('canvas');
    bufCtx = buf.getContext('2d');
    window.addEventListener('resize', resize);
    resize();
    updateCursor();

    var last = performance.now();
    function frame(now) {
        requestAnimationFrame(frame);
        // rAF timestamps can predate the performance.now() taken at startup, so floor at 0
        var dt = Math.min(Math.max((now - last) / (1000 / 60), 0), 3) * (reducedMotion ? 0.5 : 1);
        var i, k, poses = [];
        last = now;

        for (i = 0; i < particles.length; i++) {
            particles[i].px = particles[i].x;
            particles[i].py = particles[i].y;
        }
        // Two half-steps keep tight orbits around small wells stable
        for (k = 0; k < 2; k++) {
            stepWells(dt / 2);
            stepParticles(dt / 2);
            stepBlasts(dt / 2);
        }
        pointer.vx *= Math.pow(0.85, dt);
        pointer.vy *= Math.pow(0.85, dt);

        ctx.fillStyle = BACKGROUND;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);

        for (i = 0; i < wells.length; i++) {
            poses[i] = wellPose(wells[i]);
            drawWellGlow(wells[i], poses[i]);
        }
        drawParticles();
        ctx.drawImage(buf, 0, 0, width, height);
        for (i = 0; i < wells.length; i++) drawWellCore(wells[i], poses[i]);
        drawBlasts();
    }
    requestAnimationFrame(frame);
})();
