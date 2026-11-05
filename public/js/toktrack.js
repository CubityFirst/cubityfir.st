/**
 * toktrack, in the terminal
 *
 * A look-alike of toktrack's TUI (github.com/mag123c/toktrack) for the terminal's
 * `toktrack` command, drawn from /api/toktrack (src/toktrack.js). Like a real
 * full-screen program it takes over the terminal window until you quit, then hands it
 * back. Three of the app's tabs: Overview, Stats and Models, plus the daily / weekly /
 * monthly table that Enter opens from the Overview (for all usage together, since the
 * export isn't split by source).
 *
 *   TokTrackTUI.open(container, dataPromise)  ->  { close(), done: Promise }
 *
 * Keys: Tab / Shift+Tab or ←/→ switch tabs, 1-3 jump to one, Enter opens the table,
 * q / Esc / Ctrl+C quit. In the table: ↑↓ select, d/w/m switch view, s / S sort, Esc
 * goes back. Everything with a key can be clicked too.
 */
(function () {
    'use strict';

    var TABS = ['Overview', 'Stats', 'Models'];
    var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function num(n) { return Math.round(n).toLocaleString('en-US'); }
    function money(n) { return '$' + n.toFixed(2); }

    function key(text) {
        var s = el('span');
        s.appendChild(el('span', 'tt-key', text[0]));
        s.appendChild(document.createTextNode(': ' + text[1]));
        return s;
    }

    function iso(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // A bar: green fill over a dotted track, like ratatui's gauge in the app
    function bar(frac, cls) {
        var b = el('span', 'tt-bar' + (cls ? ' ' + cls : ''));
        var f = el('span', 'tt-bar-fill');
        f.style.width = Math.max(frac > 0 ? 2 : 0, Math.round(frac * 100)) + '%';
        b.appendChild(f);
        return b;
    }

    /**
     * Overview
     */
    // Same thresholds as the app: quartiles of the days that have any usage
    function levels(values) {
        var v = values.filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
        if (!v.length) return function () { return 0; };
        function at(p) { return v[Math.min(v.length - 1, Math.ceil(v.length * p) - 1)]; }
        var p25 = at(0.25), p50 = at(0.5), p75 = at(0.75);
        return function (t) { return !t ? 0 : t <= p25 ? 1 : t <= p50 ? 2 : t <= p75 ? 3 : 4; };
    }

    function heatmap(data, width) {
        var wrap = el('div', 'tt-heat');
        var byDate = {};
        data.days.forEach(function (d) { byDate[d[0]] = d; });
        var level = levels(data.days.map(function (d) { return d[1]; }));

        // Columns are weeks (Monday first), ending with this week, as many as fit
        var probe = el('span', 'tt-probe', '00');
        wrap.appendChild(probe);
        var cell = probe.getBoundingClientRect().width || 16;
        wrap.removeChild(probe);
        var weeks = Math.max(8, Math.min(52, Math.floor((width - cell * 4) / cell)));

        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);

        var grid = el('div', 'tt-grid');
        grid.style.gridTemplateColumns = 'auto repeat(' + weeks + ', 2ch)';
        for (var r = 0; r < 7; r++) {
            grid.appendChild(el('span', 'tt-daylabel', DAYS[r]));
            for (var w = 0; w < weeks; w++) {
                var d = new Date(monday);
                d.setDate(monday.getDate() + w * 7 + r);
                var c = el('span', 'tt-cell');
                if (d > today) {
                    c.classList.add('tt-future');
                } else {
                    var row = byDate[iso(d)];
                    c.classList.add('tt-l' + level(row ? row[1] : 0));
                    c.title = iso(d) + (row ? '  ' + num(row[1]) + ' tokens  ' + money(row[2]) : '  no usage');
                }
                grid.appendChild(c);
            }
        }

        // Month names under the week where each month starts, if there's room
        grid.appendChild(el('span'));
        var months = el('span', 'tt-months');
        months.style.gridColumn = '2 / span ' + weeks;
        var lastAt = -4;
        for (var k = 0; k < weeks; k++) {
            var start = new Date(monday);
            start.setDate(monday.getDate() + k * 7);
            var prev = new Date(start);
            prev.setDate(start.getDate() - 7);
            if ((k === 0 || start.getMonth() !== prev.getMonth()) && k - lastAt >= 3) {
                var m = el('span', null, MONTHS[start.getMonth()]);
                m.style.left = (k * 2) + 'ch';
                months.appendChild(m);
                lastAt = k;
            }
        }
        grid.appendChild(months);
        wrap.appendChild(grid);

        var legend = el('div', 'tt-legend');
        legend.appendChild(el('span', 'tt-muted', 'Less '));
        for (var l = 1; l <= 4; l++) legend.appendChild(el('span', 'tt-cell tt-l' + l));
        legend.appendChild(el('span', 'tt-muted', ' More'));
        wrap.appendChild(legend);
        return wrap;
    }

    // `select` is called when the total (the one selectable thing here) is chosen
    function overview(data, width, select) {
        var v = el('div', 'tt-overview');

        // The app lists sources here and Enter opens one; the export only has totals
        // across everything, so the total itself is what opens the daily table
        var hero = el('button', 'tt-hero');
        hero.type = 'button';
        hero.title = 'Enter: daily usage';
        hero.appendChild(el('span', 'tt-marker', '▸ '));
        hero.appendChild(document.createTextNode(num(data.stats.totalTokens)));
        hero.addEventListener('click', select);
        v.appendChild(hero);
        v.appendChild(el('div', 'tt-muted', 'tokens'));
        v.appendChild(el('div', 'tt-cost tt-gap', 'Cost: ' + money(data.stats.totalCost)));

        v.appendChild(el('div', 'tt-strong tt-gap', 'Top models:'));
        var list = el('div', 'tt-sources');
        var top = data.models.filter(function (m) { return !m.other; }).slice(0, 4);
        var max = top.length ? top[0].tokens : 1;
        top.forEach(function (m) {
            list.appendChild(el('span', 'tt-src-name', m.name));
            list.appendChild(bar(m.tokens / max));
            list.appendChild(el('span', 'tt-num', num(m.tokens)));
        });
        v.appendChild(list);
        v.appendChild(el('div', 'tt-muted tt-small', '… ' + (data.models.length - top.length) + ' more in Models'));

        v.appendChild(heatmap(data, width));
        return v;
    }

    /**
     * Daily / weekly / monthly table (Enter on the Overview), like the app's source
     * detail view, for all usage together.
     * Rows: [label, tokens, cost, cache tokens, main model, other models]
     */
    var MODES = { d: ['Daily', 'days', 'Date'], w: ['Weekly', 'weeks', 'Week'], m: ['Monthly', 'months', 'Month'] };
    var SORTS = ['date', 'cost', 'tokens'];

    function sortRows(rows, key, dir) {
        var i = key === 'cost' ? 2 : 1, sign = dir === 'asc' ? 1 : -1;
        return rows.slice().sort(function (a, b) {
            var byDate = a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
            if (key === 'date') return byDate * sign;
            return (a[i] - b[i]) * sign || byDate;
        });
    }

    function shortDate(iso) {
        return MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(8, 10);
    }

    function detailHeader(data) {
        var s = data.stats, h = el('div', 'tt-detail-head');
        var l1 = el('div');
        l1.appendChild(el('span', 'tt-accent tt-b', 'All sources'));
        l1.appendChild(el('span', 'tt-num', '  ' + num(s.totalTokens) + '  '));
        l1.appendChild(el('span', 'tt-cost', money(s.totalCost)));
        h.appendChild(l1);
        h.appendChild(el('div', 'tt-date',
            'Active: ' + s.activeDays + 'd  Avg: ' + num(s.dailyAvgTokens) + '/day  Peak: ' +
            (s.peakDay ? shortDate(s.peakDay.date) : 'N/A') + '  Avg Cost: ' + money(s.dailyAvgCost) + '/day'));
        return h;
    }

    function detailTable(data, st, act) {
        var mode = MODES[st.mode], rows = sortRows(data[mode[1]], st.key, st.dir);
        var avg = data.stats.dailyAvgCost;
        var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat(1));
        var v = el('div', 'tt-daily');

        var modes = el('div', 'tt-modes');
        Object.keys(MODES).forEach(function (k) {
            var b = el('button', 'tt-mode' + (k === st.mode ? ' tt-on' : ''), k + ':' + MODES[k][0]);
            b.type = 'button';
            b.addEventListener('click', function () { act('mode', k); });
            modes.appendChild(b);
        });
        var sort = el('button', 'tt-sort');
        sort.type = 'button';
        sort.title = 's: next sort, S: reverse';
        sort.appendChild(el('span', 'tt-muted', '[sort: '));
        sort.appendChild(el('span', 'tt-accent tt-b', st.key + ' ' + (st.dir === 'asc' ? '↑' : '↓')));
        sort.appendChild(el('span', 'tt-muted', ']'));
        sort.addEventListener('click', function () { act('sort'); });
        modes.appendChild(sort);
        v.appendChild(modes);

        var head = el('div', 'tt-row tt-thead');
        [mode[2], 'Model', 'Total', 'Cost', 'Cache', 'Usage'].forEach(function (t, i) {
            head.appendChild(el('span', (i >= 2 ? 'tt-r' : '') + (i >= 4 ? ' tt-wide' : ''), t));
        });
        v.appendChild(head);

        var body = el('div', 'tt-rows');
        rows.forEach(function (r, i) {
            var row = el('div', 'tt-row' + (i === st.sel ? ' tt-sel' : ''));
            row.appendChild(el('span', 'tt-date', r[0]));
            var model = el('span', 'tt-model');
            model.appendChild(el('span', 'tt-accent', r[4]));
            if (r[5]) model.appendChild(el('span', 'tt-muted', ' +' + r[5]));
            row.appendChild(model);
            row.appendChild(el('span', 'tt-num tt-r', num(r[1])));
            // Daily costs well above the average day stand out, as in the app
            var spike = st.mode === 'd' && avg > 0 ? (r[2] >= avg * 2 ? ' tt-high' : r[2] >= avg * 1.5 ? ' tt-warn' : '') : '';
            row.appendChild(el('span', 'tt-num tt-r' + spike, money(r[2])));
            row.appendChild(el('span', 'tt-num tt-r tt-wide', num(r[3])));
            row.appendChild(bar(r[1] / max, 'tt-wide'));
            row.addEventListener('click', function () { act('select', i); });
            body.appendChild(row);
        });
        v.appendChild(body);
        return { node: v, body: body, count: rows.length };
    }

    /**
     * Stats
     */
    function stats(data) {
        var s = data.stats, v = el('div', 'tt-stats');
        v.appendChild(el('div', 'tt-strong tt-center', 'Usage Statistics'));
        var grid = el('div', 'tt-cards');
        var peak = s.peakDay ? s.peakDay.date.slice(5).replace('-', '/') + ' (' + num(s.peakDay.tokens) + ')' : 'N/A';
        [
            ['Total Tokens', num(s.totalTokens), 'c-accent'],
            ['Daily Average', num(s.dailyAvgTokens), 'c-blue'],
            ['Peak Day', peak, 'c-date'],
            ['Total Cost', money(s.totalCost), 'c-warm'],
            ['Daily Avg Cost', money(s.dailyAvgCost), 'c-cost'],
            ['Active Days', String(s.activeDays), 'c-bar']
        ].forEach(function (c) {
            var card = el('div', 'tt-card ' + c[2]);
            card.appendChild(el('div', 'tt-card-title', c[0]));
            card.appendChild(el('div', 'tt-card-value', c[1]));
            grid.appendChild(card);
        });
        v.appendChild(grid);
        if (data.updated) v.appendChild(el('div', 'tt-muted tt-center tt-small', 'data up to ' + data.updated));
        return v;
    }

    /**
     * Models
     */
    function models(data) {
        var t = el('div', 'tt-models');
        ['Model', 'Tokens', 'Cost', 'Usage'].forEach(function (h, i) {
            t.appendChild(el('span', 'tt-th' + (i && i < 3 ? ' tt-r' : '') + (i === 3 ? ' tt-usage' : ''), h));
        });
        var max = Math.max.apply(null, data.models.map(function (m) { return m.tokens; }).concat(1));
        data.models.forEach(function (m) {
            t.appendChild(el('span', m.other ? 'tt-muted' : 'tt-accent', m.name));
            t.appendChild(el('span', 'tt-num tt-r', num(m.tokens)));
            t.appendChild(el('span', 'tt-cost tt-r', money(m.cost)));
            t.appendChild(bar(m.tokens / max, 'tt-usage'));
        });
        return t;
    }


    function open(container, dataPromise) {
        var root = el('div', 'tt');
        root.tabIndex = 0;
        root.setAttribute('role', 'application');
        root.setAttribute('aria-label', 'toktrack. Tab switches view, Enter opens daily usage, q quits.');

        var top = el('div', 'tt-top'), rule1 = el('div', 'tt-rule'),
            view = el('div', 'tt-view'), rule2 = el('div', 'tt-rule'), foot = el('div', 'tt-foot');
        [top, rule1, view, rule2, foot].forEach(function (n) { root.appendChild(n); });

        var current = 0, data = null, finish, closed = false;
        var detail = null, table = null;   // detail: { mode, key, dir, sel } while the table is open
        var done = new Promise(function (r) { finish = r; });

        function button(cls, content, onClick) {
            var b = el('button', cls);
            b.type = 'button';
            b.appendChild(content);
            b.addEventListener('click', function () { onClick(); root.focus({ preventScroll: true }); });
            return b;
        }

        function renderTop() {
            top.textContent = '';
            if (detail && data) return top.appendChild(detailHeader(data));
            var tabs = el('div', 'tt-tabs');
            TABS.forEach(function (name, i) {
                var on = i === current;
                tabs.appendChild(button('tt-tab' + (on ? ' tt-on' : ''), document.createTextNode(on ? '[' + name + ']' : name),
                                        function () { show(i); }));
            });
            top.appendChild(tabs);
        }

        // Every key hint that does something can be clicked too, for mice and phones
        function renderFoot() {
            foot.textContent = '';
            var next = { d: 'w', w: 'm', m: 'd' };
            var keys = detail
                ? [[['↑↓', 'Select']],
                   [['d/w/m', 'View mode'], function () { act('mode', next[detail.mode]); }],
                   [['s/S', 'Sort'], function () { act('sort'); }],
                   [['Esc', 'Back'], back]]
                : [[['Tab', 'Switch view'], function () { show(current + 1); }]]
                    .concat(current === 0 ? [[['Enter', 'Details'], openDetail]] : []);
            keys.push([['q', 'Quit'], function () { close(); }]);
            keys.forEach(function (k) {
                foot.appendChild(k[1] ? button('tt-quit', key(k[0]), k[1]) : key(k[0]));
            });
        }

        function render() {
            renderTop();
            renderFoot();
            view.textContent = '';
            table = null;
            if (!data) return view.appendChild(el('div', 'tt-muted tt-center tt-loading', 'Loading…'));
            if (detail) {
                table = detailTable(data, detail, act);
                view.appendChild(table.node);
                return reveal(true);
            }
            var width = view.clientWidth;
            view.appendChild([overview, stats, models][current](data, width, openDetail));
        }

        function show(i) {
            detail = null;
            current = (i + TABS.length) % TABS.length;
            render();
        }

        // Oldest-first puts the selection on the newest row at the bottom; otherwise the top
        function defaultSel(st) {
            var n = data[MODES[st.mode][1]].length;
            return st.key === 'date' && st.dir === 'asc' ? n - 1 : 0;
        }

        function openDetail() {
            if (!data) return;
            detail = { mode: 'd', key: 'date', dir: 'asc' };
            detail.sel = defaultSel(detail);
            render();
        }

        function back() {
            detail = null;
            render();
        }

        // Keep the selected row in view by scrolling the table, not the page
        function reveal(jump) {
            if (!table) return;
            var rows = table.body.children, row = rows[detail.sel];
            Array.prototype.forEach.call(rows, function (r, i) { r.classList.toggle('tt-sel', i === detail.sel); });
            if (!row) return;
            var b = table.body, y = row.offsetTop - b.offsetTop;
            if (jump) b.scrollTop = y - b.clientHeight / 2;
            else if (y < b.scrollTop) b.scrollTop = y;
            else if (y + row.offsetHeight > b.scrollTop + b.clientHeight) b.scrollTop = y + row.offsetHeight - b.clientHeight;
        }

        function act(what, arg) {
            if (!detail) return;
            if (what === 'select') { detail.sel = arg; return reveal(); }
            if (what === 'move') {
                detail.sel = Math.max(0, Math.min(table.count - 1, detail.sel + arg));
                return reveal();
            }
            if (what === 'mode') detail.mode = arg;
            if (what === 'sort') {
                detail.key = SORTS[(SORTS.indexOf(detail.key) + 1) % SORTS.length];
                detail.dir = detail.key === 'date' ? 'asc' : 'desc';
            }
            if (what === 'reverse') detail.dir = detail.dir === 'asc' ? 'desc' : 'asc';
            detail.sel = defaultSel(detail);
            render();
        }

        // Resolves `done` with the data, or rejects it if loading failed
        function close(error) {
            if (closed) return;
            closed = true;
            if (ro) ro.disconnect();
            root.remove();
            finish(error instanceof Error ? Promise.reject(error) : data);
        }

        root.addEventListener('keydown', function (e) {
            var k = e.key, handled = true;
            if (k === 'q' || (k === 'c' && e.ctrlKey)) close();
            else if (detail) {
                if (k === 'Escape' || k === 'Backspace') back();
                else if (k === 'ArrowDown' || k === 'j') act('move', 1);
                else if (k === 'ArrowUp' || k === 'k') act('move', -1);
                else if (k === 'PageDown') act('move', 10);
                else if (k === 'PageUp') act('move', -10);
                else if (k === 'Home') act('move', -1e6);
                else if (k === 'End') act('move', 1e6);
                else if (k === 'd' || k === 'w' || k === 'm') act('mode', k);
                else if (k === 's') act('sort');
                else if (k === 'S') act('reverse');
                else if (k !== 'Tab') handled = false;
            }
            else if (k === 'Escape') close();
            else if (k === 'Tab') show(current + (e.shiftKey ? -1 : 1));
            else if (k === 'ArrowRight') show(current + 1);
            else if (k === 'ArrowLeft') show(current - 1);
            else if (/^[1-3]$/.test(k)) show(+k - 1);
            else if (k === 'Enter' && current === 0) openDetail();
            else handled = false;
            if (handled) e.preventDefault();
        });

        // Redraw when the terminal changes width (the heatmap fits as many weeks as it can)
        var ro = null, lastWidth = 0;
        if ('ResizeObserver' in window) {
            ro = new ResizeObserver(function () {
                var w = view.clientWidth;
                if (data && current === 0 && !detail && Math.abs(w - lastWidth) > 4) { lastWidth = w; render(); }
            });
            ro.observe(view);
        }

        container.appendChild(root);
        render();
        root.focus({ preventScroll: true });

        dataPromise.then(function (d) {
            if (closed) return;
            data = d;
            lastWidth = view.clientWidth;
            render();
        }, function (err) {
            close(err instanceof Error ? err : new Error(String(err)));
        });

        return { close: close, done: done };
    }

    window.TokTrackTUI = { open: open };
})();
