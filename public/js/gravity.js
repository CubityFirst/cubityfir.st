/**
 * Gravity points
 *
 * A field of drifting particles. Click empty space to drop a gravity point; it pulls on
 * every particle and on the other points. Drag a point to move it. A point that reaches
 * another merges with it and grows; one that grows too big, or that you double-click,
 * collapses and vanishes.
 *
 * Physics and drawing are decoupled. The model below advances in fixed ticks (TICK_RATE
 * per second) whatever the display does, and each display frame draws a blend of the last
 * two ticks, so motion stays smooth when frames and ticks don't line up. Frame times are
 * snapped to the display's measured refresh interval, since raw rAF timestamps jitter and
 * blending would turn that jitter into uneven motion. Trails are drawn per frame and fade
 * by elapsed time, so they look the same at any refresh rate.
 * TICK_RATE = 0 instead runs one tick per display frame with no blending, exactly like the
 * original (which ran faster on faster screens).
 *
 * Model, per tick:
 *   - Points take their turn in creation order. On its turn a point
 *       1. snaps to the pointer if it is being dragged,
 *       2. nudges every particle towards itself by a fixed amount (its pull),
 *       3. eases its visible core size towards its body size (a damped spring),
 *       4. if collapsing: shrinks its body, dies once the core is under 1px, and stops,
 *       5. otherwise checks every other live point: it swallows any it can reach (taking
 *          its pull and area), and nudges each one towards itself by its pull,
 *       6. moves by the nudges it has collected since its last turn (unless dragged),
 *          then forgets them; points have no momentum of their own,
 *       7. starts collapsing if its core has outgrown the limit.
 *   - Then every particle caps its speed and moves. Particles keep their velocity.
 */
(function () {
    'use strict';

    var canvas = document.getElementById('c');
    if (!canvas) return;

    // Configs
    var BACKGROUND      = 'rgb(54, 57, 63)',
        VIGNETTE        = 0.75,     // corner darkness
        PARTICLE_COUNT  = 400,
        PARTICLE_SIZE   = 1,        // radius, px
        PARTICLE_TOP    = 12,       // max particle speed, px per tick
        TRAIL_FADE      = 0.35,     // share of the trail layer erased each tick
        POINT_SIZE      = 10,       // starting body radius
        POINT_PULL      = 0.05,     // starting pull, px per tick^2
        POINT_LIMIT     = 65,       // core radius that triggers a collapse
        CORE_SPRING     = 0.07,
        CORE_DAMPING    = 0.95,
        REACH           = 0.85,     // share of the summed radii at which points merge
        SWALLOW_KICK    = 0.5,      // how far a swallowed point drags its eater
        BURST           = 1.75,     // core blow-up when a collapse starts
        SHRINK          = 0.75,     // body shrink per tick while collapsing
        TICK_RATE       = 60,       // physics ticks per second; 0 = one per display frame
        MAX_TICKS       = 10;       // per frame, so a slow frame can't snowball


    // State
    var ctx, trail, trailCtx,
        width = 0, height = 0, dpr = 0,
        vignette,
        particles = [],
        points = [],
        shown = [],                 // points to draw: everyone who got a turn last tick
        trailFade,                  // per-frame trail erase, for the frame being drawn
        pointer = { x: 0, y: 0 },
        onScreen = true;


    /**
     * Particles
     */
    function spawnParticles(count) {
        for (var i = 0; i < count; i++) {
            var x = Math.floor(Math.random() * width - PARTICLE_SIZE * 2) + PARTICLE_SIZE + 1,
                y = Math.floor(Math.random() * height - PARTICLE_SIZE * 2) + PARTICLE_SIZE + 1;
            particles.push({
                x: x, y: y,
                lastX: x, lastY: y,         // position one tick ago
                drawX: x, drawY: y,         // where it was last drawn (trail start)
                vx: Math.random() * 2 - 1,
                vy: Math.random() * 2 - 1
            });
        }
    }

    function moveParticles() {
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i],
                speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (speed > PARTICLE_TOP) {
                p.vx = p.vx / speed * PARTICLE_TOP;
                p.vy = p.vy / speed * PARTICLE_TOP;
            }
            p.lastX = p.x;
            p.lastY = p.y;
            p.x += p.vx;
            p.y += p.vy;
        }
    }


    /**
     * Gravity points
     */
    function makePoint(x, y) {
        return {
            x: x, y: y,
            body: POINT_SIZE,           // radius used for hit tests, mass and merging
            core: POINT_SIZE / 2,       // drawn radius; springs towards body
            lastX: x, lastY: y,         // state one tick ago, for blending
            lastBody: POINT_SIZE, lastCore: POINT_SIZE / 2,
            coreVel: 0,
            pull: POINT_PULL,
            nudgeX: 0, nudgeY: 0,       // movement collected since this point's last turn
            grabX: 0, grabY: 0,         // pointer offset while dragged
            dragging: false,
            hovered: false,
            collapsing: false,
            dead: false
        };
    }

    // Move `target` by `amount` px towards (x, y), into its velocity or nudge slot
    function towards(target, x, y, amount, isPoint) {
        var dx = x - target.x,
            dy = y - target.y,
            d = Math.sqrt(dx * dx + dy * dy);
        if (!d) return;
        if (isPoint) {
            target.nudgeX += dx / d * amount;
            target.nudgeY += dy / d * amount;
        } else {
            target.vx += dx / d * amount;
            target.vy += dy / d * amount;
        }
    }

    function startCollapse(pt) {
        pt.core *= BURST;
        pt.collapsing = true;
    }

    function takeTurn(pt) {
        var i, other, dx, dy, area, otherArea;

        for (i = 0; i < particles.length; i++) {
            towards(particles[i], pt.x, pt.y, pt.pull, false);
        }

        pt.coreVel = (pt.coreVel + (pt.body - pt.core) * CORE_SPRING) * CORE_DAMPING;
        pt.core = Math.max(pt.core + pt.coreVel, 0);

        if (pt.collapsing) {
            pt.body *= SHRINK;
            if (pt.core < 1) pt.dead = true;
            return;
        }

        // Area at the start of the turn; several swallows in one turn all build on this
        area = pt.body * pt.body * Math.PI;

        for (i = 0; i < points.length; i++) {
            other = points[i];
            if (other === pt || other.dead) continue;

            dx = other.x - pt.x;
            dy = other.y - pt.y;
            if ((pt.core >= other.body || pt.dragging) &&
                Math.sqrt(dx * dx + dy * dy) < (pt.core + other.body) * REACH) {
                other.dead = true;
                pt.pull += other.pull;

                // Lurch towards the swallowed point, more so the bigger it was
                pt.nudgeX += dx * (other.body / pt.body * SWALLOW_KICK);
                pt.nudgeY += dy * (other.body / pt.body * SWALLOW_KICK);

                otherArea = other.body * other.body * Math.PI;
                pt.core = Math.sqrt((area + otherArea * 3) / Math.PI);
                pt.body = Math.sqrt((area + otherArea) / Math.PI);
            }

            towards(other, pt.x, pt.y, pt.pull, true);
        }

        if (!pt.dragging) {
            pt.x += pt.nudgeX;
            pt.y += pt.nudgeY;
        }
        pt.nudgeX = pt.nudgeY = 0;

        if (pt.core > POINT_LIMIT) startCollapse(pt);
    }

    function tick() {
        // Dead points are dropped as their turn comes up. Anyone who gets a turn is drawn
        // this tick, so a collapse shows its last frame, and a point swallowed after its own
        // turn still shows this tick and is gone the next.
        var survivors = [], pt, i;
        shown = [];
        for (i = 0; i < points.length; i++) {
            pt = points[i];
            pt.lastX = pt.x;
            pt.lastY = pt.y;
            pt.lastBody = pt.body;
            pt.lastCore = pt.core;
        }
        for (i = 0; i < points.length; i++) {
            pt = points[i];
            if (pt.dead) continue;
            if (pt.dragging) {
                pt.x = pointer.x - pt.grabX;
                pt.y = pointer.y - pt.grabY;
            }
            takeTurn(pt);
            shown.push(pt);
            if (!pt.dead) survivors.push(pt);
        }
        points = survivors;

        moveParticles();
    }


    /**
     * Drawing
     */
    // Blend from the previous tick's value to the current one. t = 1 is exactly current.
    function blend(from, to, t) {
        return t >= 1 ? to : from + (to - from) * t;
    }

    function drawTrails(t) {
        var i, p, x, y;

        trailCtx.save();
        trailCtx.globalCompositeOperation = 'destination-out';
        trailCtx.globalAlpha = trailFade;
        trailCtx.fillRect(0, 0, width, height);
        trailCtx.restore();

        trailCtx.fillStyle = trailCtx.strokeStyle = '#fff';
        trailCtx.lineCap = trailCtx.lineJoin = 'round';
        trailCtx.lineWidth = PARTICLE_SIZE * 2;

        // Streak from where each particle was last drawn to where it is now
        trailCtx.beginPath();
        for (i = 0; i < particles.length; i++) {
            p = particles[i];
            x = blend(p.lastX, p.x, t);
            y = blend(p.lastY, p.y, t);
            trailCtx.moveTo(x, y);
            trailCtx.lineTo(p.drawX, p.drawY);
            p.drawX = x;
            p.drawY = y;
        }
        trailCtx.stroke();

        trailCtx.beginPath();
        for (i = 0; i < particles.length; i++) {
            p = particles[i];
            trailCtx.moveTo(p.drawX + PARTICLE_SIZE, p.drawY);
            trailCtx.arc(p.drawX, p.drawY, PARTICLE_SIZE, 0, Math.PI * 2);
        }
        trailCtx.fill();
    }

    function drawPoint(pt, t) {
        var x = blend(pt.lastX, pt.x, t),
            y = blend(pt.lastY, pt.y, t),
            body = blend(pt.lastBody, pt.body, t),
            core = blend(pt.lastCore, pt.core, t),
            halo = body * 5, g, inner;

        // Faint shadow well around the body
        g = ctx.createRadialGradient(x, y, body, x, y, halo);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, halo, 0, Math.PI * 2);
        ctx.fill();

        // Black core with a flickering blue rim
        inner = core * (0.3 + Math.random() * 0.7);
        g = ctx.createRadialGradient(x, y, inner, x, y, core);
        g.addColorStop(0, 'rgba(0, 0, 0, 1)');
        g.addColorStop(1, Math.random() < 0.2 ? 'rgba(43, 57, 84, 0.15)' : 'rgba(64, 97, 163, 0.75)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, core, 0, Math.PI * 2);
        ctx.fill();
    }

    // t: how far between the last two ticks to draw (0..1). ticks: how many ticks' worth
    // of time this frame covers, which sets how much of the trail fades.
    function render(t, ticks) {
        trailFade = ticks === 1 ? TRAIL_FADE : 1 - Math.pow(1 - TRAIL_FADE, ticks);

        ctx.fillStyle = BACKGROUND;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);

        for (var i = 0; i < shown.length; i++) drawPoint(shown[i], t);
        drawTrails(t);

        ctx.drawImage(trail, 0, 0, width, height);
    }


    /**
     * Sizing
     */
    function resize() {
        // Size to the canvas box (the hero), skipping no-op resizes such as the mobile
        // URL bar sliding, since resizing a canvas wipes it.
        var newDpr = Math.min(window.devicePixelRatio || 1, 2),
            w = canvas.clientWidth, h = canvas.clientHeight;
        if (w === width && h === height && newDpr === dpr) return;
        width = w;
        height = h;
        dpr = newDpr;
        canvas.width = trail.width = Math.round(w * dpr);
        canvas.height = trail.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        var cx = w / 2, cy = h / 2;
        vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.sqrt(cx * cx + cy * cy));
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, ' + VIGNETTE + ')');
    }


    /**
     * Input
     *
     * Hover is only re-evaluated when the mouse moves, so a point drifting under a still
     * cursor isn't grabbable until the cursor moves again.
     */
    function setPointer(e) {
        var r = canvas.getBoundingClientRect();
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
    }

    function hoveredPoint() {
        for (var i = points.length - 1; i >= 0; i--) {
            if (points[i].hovered) return points[i];
        }
        return null;
    }

    canvas.addEventListener('mousemove', function (e) {
        setPointer(e);
        // Topmost point under the cursor wins; a point being dragged always counts
        var claimed = false;
        for (var i = points.length - 1; i >= 0; i--) {
            var pt = points[i],
                dx = pointer.x - pt.x,
                dy = pointer.y - pt.y,
                under = !claimed && Math.sqrt(dx * dx + dy * dy) < pt.body;
            pt.hovered = under || pt.dragging;
            if (pt.hovered) claimed = true;
        }
        canvas.style.cursor = claimed ? 'pointer' : 'default';
    });

    canvas.addEventListener('mousedown', function (e) {
        var pt = hoveredPoint();
        if (pt) {
            pt.grabX = pointer.x - pt.x;
            pt.grabY = pointer.y - pt.y;
            pt.dragging = true;
        } else {
            var r = canvas.getBoundingClientRect();
            points.push(makePoint(e.clientX - r.left, e.clientY - r.top));
        }
    });

    canvas.addEventListener('mouseup', function () {
        for (var i = 0; i < points.length; i++) {
            if (points[i].dragging) {
                points[i].dragging = false;
                break;
            }
        }
    });

    canvas.addEventListener('dblclick', function () {
        var pt = hoveredPoint();
        if (pt) startCollapse(pt);
    });


    /**
     * Loop
     */
    ctx = canvas.getContext('2d');
    trail = document.createElement('canvas');
    trailCtx = trail.getContext('2d');
    window.addEventListener('resize', resize);
    resize();
    spawnParticles(PARTICLE_COUNT);

    // Pause while the hero is scrolled out of view
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
            onScreen = entries[0].isIntersecting;
        }).observe(canvas);
    }

    var TICK_MS = 1000 / TICK_RATE, last = null, owed = 0,
        refreshMs = 0, offBeat = 0,     // measured display refresh interval
        slip = 0;                       // real time not yet credited by snapping

    // Turn a raw frame delta into a whole number of display refreshes. rAF timestamps
    // wobble by a fraction of a millisecond while the screen itself refreshes steadily;
    // snapping keeps each frame's step identical so the blended motion stays even.
    // Frames that aren't near a refresh multiple (variable refresh rate displays) are
    // used as-is, and the time snapping skims off is paid back gradually, so the
    // simulation never drifts from the real clock.
    function snap(raw) {
        if (refreshMs && Math.abs(raw - refreshMs) <= refreshMs * 0.25) {
            refreshMs += (raw - refreshMs) * 0.05;  // follow slow drift
            offBeat = 0;
        } else if (!refreshMs || ++offBeat > 10) {
            refreshMs = raw;                        // first frame, or the rate changed
            offBeat = 0;
        }
        var snapped = Math.max(1, Math.round(raw / refreshMs)) * refreshMs,
            used = Math.abs(raw - snapped) <= Math.min(1, refreshMs * 0.15) ? snapped : raw;
        slip += raw - used;
        used += slip * 0.1;
        slip *= 0.9;
        return used;
    }

    function frame(now) {
        requestAnimationFrame(frame);
        if (!onScreen) { last = null; return; }

        if (!TICK_RATE) {
            tick();
            render(1, 1);
            return;
        }

        var elapsed = last === null ? -1 : now - last, n = 0;
        last = now;
        // A long gap (background tab, hero off screen) resumes rather than fast-forwarding
        elapsed = elapsed > 250 || elapsed <= 0 ? TICK_MS : snap(elapsed);

        owed += elapsed;
        while (owed >= TICK_MS && n < MAX_TICKS) {
            tick();
            owed -= TICK_MS;
            n++;
        }
        if (owed >= TICK_MS) owed = 0; // too far behind: drop the backlog

        render(owed / TICK_MS, elapsed / TICK_MS);
    }
    requestAnimationFrame(frame);
})();
