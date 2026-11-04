/**
 * Below the fold (prototype): shared GitHub data, the projects grid, scroll reveals
 *
 * Fetches public repos and activity from the GitHub API once and shares them on
 * `window.site` so the terminal (js/terminal.js) can use the same data. Responses are
 * cached for the browser session so reloads don't eat into the unauthenticated rate
 * limit (60 requests/hour per IP). Everything from the API is written with
 * textContent, never as HTML.
 */
(function () {
    var USER = 'CubityFirst',
        API = 'https://api.github.com/users/' + USER,
        CACHE_MS = 10 * 60 * 1000,
        PROJECT_COUNT = 6;

    // GitHub's linguist colours, a few lightened so they read on the dark background
    var LANG_COLORS = {
        Rust: '#dea584', TypeScript: '#3178c6', JavaScript: '#f1e05a', HTML: '#e34c26',
        CSS: '#663399', PowerShell: '#5391fe', AutoHotkey: '#6594b9', 'C#': '#178600',
        Python: '#3572A5', Go: '#00ADD8', Shell: '#89e051'
    };


    /**
     * Helpers
     */
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function ago(iso) {
        var s = (Date.now() - new Date(iso).getTime()) / 1000;
        if (s < 60) return 'just now';
        var units = [[31536000, 'y'], [2592000, 'mo'], [604800, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm']];
        for (var i = 0; i < units.length; i++) {
            if (s >= units[i][0]) return Math.floor(s / units[i][0]) + units[i][1] + ' ago';
        }
    }

    function stamp(iso) {
        var d = new Date(iso), p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function getJSON(url) {
        var key = 'gh:' + url, cached = null;
        try { cached = JSON.parse(sessionStorage.getItem(key)); } catch (e) {}
        if (cached && Date.now() - cached.t < CACHE_MS) return Promise.resolve(cached.d);

        return fetch(url, { headers: { Accept: 'application/vnd.github+json' } }).then(function (r) {
            if (!r.ok) throw new Error('GitHub ' + r.status);
            return r.json();
        }).then(function (d) {
            try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
            return d;
        });
    }


    /**
     * Data
     */
    // Own, live repos, most recently pushed first
    var repos = getJSON(API + '/repos?per_page=100&sort=pushed').then(function (list) {
        return list.filter(function (r) { return !r.fork && !r.archived && r.name !== USER; })
            .sort(function (a, b) { return new Date(b.pushed_at) - new Date(a.pushed_at); });
    });

    function describe(e) {
        var repo = e.repo.name.replace(USER + '/', ''),
            base = 'https://github.com/' + e.repo.name,
            p = e.payload || {};
        switch (e.type) {
            case 'PushEvent':
                return { text: 'pushed to ' + repo + (p.ref ? ' (' + p.ref.replace('refs/heads/', '') + ')' : ''),
                         href: p.head ? base + '/commit/' + p.head : base };
            case 'PullRequestEvent':
                var verb = p.action === 'closed' && p.pull_request && p.pull_request.merged ? 'merged' : p.action;
                return { text: verb + ' PR #' + p.number + ' in ' + repo,
                         group: verb + ' PR', num: '#' + p.number, where: ' in ' + repo,
                         href: base + '/pull/' + p.number };
            case 'CreateEvent':
                return { text: 'created ' + p.ref_type + (p.ref ? ' ' + p.ref : '') + ' in ' + repo, href: base };
            case 'ReleaseEvent':
                return { text: 'released ' + (p.release && p.release.tag_name || '') + ' of ' + repo,
                         href: p.release && p.release.html_url || base };
            case 'WatchEvent':
                return { text: 'starred ' + e.repo.name, href: base };
            case 'ForkEvent':
                return { text: 'forked ' + e.repo.name, href: base };
            case 'IssuesEvent':
                return { text: p.action + ' an issue in ' + repo, href: base + '/issues' };
            case 'IssueCommentEvent':
                return { text: 'commented in ' + (e.repo.name.indexOf(USER + '/') === 0 ? repo : e.repo.name), href: base };
        }
        return null;
    }

    // Activity as log lines, newest first. Runs are collapsed: five pushes to one repo
    // become "×5", and back-to-back PRs with the same action in one repo become
    // "merged PRs #7, #6, #4 in ShareX".
    var activity = getJSON(API + '/events/public?per_page=50').then(function (events) {
        var lines = [], prev = null;
        events.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
        for (var i = 0; i < events.length; i++) {
            var d = describe(events[i]);
            if (!d) continue;
            if (prev && prev.text === d.text) { prev.count++; continue; }
            if (prev && d.group && prev.group === d.group && prev.where === d.where) {
                if (prev.nums.indexOf(d.num) < 0) prev.nums.push(d.num);
                prev.text = d.group + (prev.nums.length > 1 ? 's ' : ' ') + prev.nums.join(', ') + d.where;
                continue;
            }
            prev = { text: d.text, href: d.href, at: events[i].created_at, count: 1,
                     group: d.group, where: d.where, nums: d.num ? [d.num] : [] };
            lines.push(prev);
        }
        return lines;
    });

    window.site = { user: USER, repos: repos, activity: activity, ago: ago, stamp: stamp };


    /**
     * A: projects
     */
    function renderProjects(list) {
        var grid = document.getElementById('proj-grid');
        if (!grid) return;
        grid.textContent = '';

        list.slice(0, PROJECT_COUNT).forEach(function (r) {
            var a = el('a', 'proj');
            a.href = r.homepage || r.html_url;
            a.target = '_blank';
            a.rel = 'noopener';

            a.appendChild(el('span', 'proj-name', r.name));
            a.appendChild(el('span', 'proj-desc' + (r.description ? '' : ' empty'),
                r.description || 'no description yet'));

            var meta = el('span', 'proj-meta');
            if (r.language) {
                var lang = el('span');
                var dot = el('span', 'lang-dot');
                dot.style.background = LANG_COLORS[r.language] || '#808080';
                lang.appendChild(dot);
                lang.appendChild(document.createTextNode(r.language));
                meta.appendChild(lang);
            }
            if (r.stargazers_count) meta.appendChild(el('span', null, '★ ' + r.stargazers_count));
            meta.appendChild(el('span', null, 'updated ' + ago(r.pushed_at)));
            a.appendChild(meta);

            grid.appendChild(a);
        });
    }

    function projectsFailed() {
        var grid = document.getElementById('proj-grid');
        if (!grid) return;
        grid.textContent = '';
        grid.appendChild(el('p', 'sec-lede', 'couldn’t reach GitHub just now, see the profile instead.'));
    }

    repos.then(renderProjects, projectsFailed);


    /**
     * Prototype C switch: background in the hero only, or all the way down. The class is
     * set early by an inline script in <head> (from ?bg=full) to avoid a flash.
     */
    var root = document.documentElement;
    Array.prototype.forEach.call(document.querySelectorAll('[data-bg]'), function (b, _, all) {
        function sync() {
            Array.prototype.forEach.call(all, function (x) {
                x.setAttribute('aria-pressed', String(root.classList.contains('bg-full') === (x.getAttribute('data-bg') === 'full')));
            });
        }
        b.addEventListener('click', function () {
            var full = b.getAttribute('data-bg') === 'full';
            root.classList.toggle('bg-full', full);
            var url = new URL(location.href);
            if (full) url.searchParams.set('bg', 'full'); else url.searchParams.delete('bg');
            history.replaceState(null, '', url);
            // gravity.js sizes itself to the canvas on resize
            window.dispatchEvent(new Event('resize'));
            sync();
        });
        sync();
    });


    /**
     * Reveal on scroll. Fires a `revealed` event so the terminal can start its intro.
     */
    var reveals = document.querySelectorAll('.reveal');
    function show(n) {
        n.classList.add('shown');
        n.dispatchEvent(new CustomEvent('revealed'));
    }
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) {
                    io.unobserve(en.target);
                    show(en.target);
                }
            });
        }, { threshold: 0.12 });
        Array.prototype.forEach.call(reveals, function (n) { io.observe(n); });
    } else {
        Array.prototype.forEach.call(reveals, show);
    }
})();
