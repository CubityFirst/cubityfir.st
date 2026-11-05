/**
 * Interactive terminal
 *
 * A small fake shell that doubles as the FAQ. Known commands run directly; anything else
 * is sent to /api/ask (src/worker.js) for a generated answer. If that's unreachable (or
 * busy), it falls back to matching the built-in FAQ below by keyword.
 *
 * The intro (whoami, ls, tail) types itself out the first time the terminal scrolls into
 * view. Clicking the terminal, or any command link, skips to the end.
 *
 * Uses GitHub data shared by js/below.js on window.site. Text from the API is only ever
 * written with textContent.
 */
(function () {
    'use strict';

    var section = document.getElementById('terminal'),
        body = document.getElementById('term-body'),
        out = document.getElementById('term-out'),
        form = document.getElementById('term-form'),
        input = document.getElementById('term-input');
    if (!section || !body || !out || !form || !input) return;

    var site = window.site || {},
        reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        history = [],
        historyAt = 0,
        queue = Promise.resolve(),
        skipIntro = false,
        introDone = false,
        focusAfterIntro = false;

    // Name, email and hostname for the domain we're on (set in index.html's <head>)
    var ID = window.identity || { key: 'cf', name: 'cubityfirst', user: 'cubity', host: 'cubityfir.st', email: 'cubity@cubityfir.st' };

    var LINKS = {
        email:     { label: ID.email,                        href: 'mailto:' + ID.email },
        github:    { label: 'github.com/CubityFirst',        href: 'https://github.com/CubityFirst' },
        bluesky:   { label: 'bsky.app/profile/cubityfir.st', href: 'https://bsky.app/profile/cubityfir.st' },
        twitter:   { label: 'twitter.com/cubityfirst',       href: 'https://twitter.com/cubityfirst' },
        telegram:  { label: 't.me/cubityfirst',              href: 'https://t.me/cubityfirst' },
        discord:   { label: 'cubityfir.st/discord',          href: 'https://cubityfir.st/discord' },
        keybase:   { label: 'keybase.io/cubityfirst',        href: 'https://keybase.io/cubityfirst' },
        steam:     { label: 'steamcommunity.com/id/cubityfirst', href: 'http://steamcommunity.com/id/cubityfirst' },
        instagram: { label: 'instagram.com/cubityfirst',     href: 'https://instagram.com/cubityfirst' },
        reddit:    { label: 'reddit.com/u/Cubity_First',     href: 'https://reddit.com/u/Cubity_First' },
        twitch:    { label: 'twitch.tv/CubityFirst',         href: 'https://twitch.tv/CubityFirst' }
    };

    var TAGLINE = [['developer', 'w1'], ['engineer', 'w2'], ['memer', 'w3'], ['sysadmin', 'w4'], ['and more', 'w5']];


    /**
     * Output
     */
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function scrollDown() {
        body.scrollTop = body.scrollHeight;
    }

    // print('plain', node, dim('grey'), ...) appends one line
    function print() {
        var line = el('div', 'line');
        for (var i = 0; i < arguments.length; i++) {
            var p = arguments[i];
            line.appendChild(typeof p === 'string' ? document.createTextNode(p) : p);
        }
        out.appendChild(line);
        scrollDown();
        return line;
    }

    function span(text, cls) { return el('span', cls, text); }
    function dim(text) { return span(text, 'dim'); }
    function err(text) { return span(text, 'err'); }

    function link(text, href) {
        var a = el('a', null, text);
        a.href = href;
        if (!/^mailto:/.test(href)) {
            a.target = '_blank';
            a.rel = 'noopener';
        }
        return a;
    }

    // A clickable bit of text that runs a command, so phones don't have to type
    function cmd(text, command) {
        var b = el('button', 'cmd-link', text);
        b.type = 'button';
        b.addEventListener('click', function () { submit(command || text); });
        return b;
    }

    function pad(text, n) {
        while (text.length < n) text += ' ';
        return text;
    }

    function promptNode() {
        var p = el('span', 'prompt');
        p.appendChild(span(ID.user + '@' + ID.host, 'p-user'));
        p.appendChild(document.createTextNode(':'));
        p.appendChild(span('~', 'p-path'));
        p.appendChild(document.createTextNode('$ '));
        return p;
    }

    function echo(text) {
        return print(promptNode(), span(text, 'p-cmd'));
    }

    function wait(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }


    /**
     * Shared answers
     */
    function tagline() {
        var line = print();
        TAGLINE.forEach(function (t, i) {
            line.appendChild(span(t[0], t[1]));
            line.appendChild(document.createTextNode(i < TAGLINE.length - 1 ? '; ' : ';'));
        });
    }

    function contact() {
        print(pad('email', 10), link(LINKS.email.label, LINKS.email.href), dim('  (best)'));
        print(pad('telegram', 10), link(LINKS.telegram.label, LINKS.telegram.href));
        print(pad('discord', 10), link(LINKS.discord.label, LINKS.discord.href));
        print(pad('keybase', 10), link('keybase.io/cubityfirst/chat', 'https://keybase.io/cubityfirst/chat'));
        print(pad('pgp', 10), cmd('cat pgp-key'));
    }

    function socials() {
        ['github', 'bluesky', 'twitter', 'steam', 'twitch', 'instagram', 'reddit', 'telegram', 'discord', 'keybase']
            .forEach(function (k) { print(pad(k, 11), link(LINKS[k].label, LINKS[k].href)); });
    }

    function workingOn() {
        if (!site.repos) return print(err('can’t see GitHub from here'));
        return site.repos.then(function (list) {
            print('lately, mostly:');
            list.slice(0, 3).forEach(function (r) {
                print('  ', link(r.name, r.html_url), dim('  ' + site.ago(r.pushed_at)));
                if (r.description) print(dim('    ' + r.description));
            });
            print('more with ', cmd('projects'), '.');
        }, function () { print(err('GitHub is unreachable right now')); });
    }

    // about.txt: a short bio that reads as one piece, rather than a pile of other answers
    function about() {
        print(span(ID.name, 'q'));
        tagline();
        print();
        print('Senior Technical Engineer since 2024, working on cloud infrastructure and cybersecurity. based in the south of England.');
        print();
        print('outside work I help with support and build features for ', link('ShareX', 'https://getsharex.com'),
              ' (since 2016), and make whatever else ends up in ', cmd('projects'), '.');
        print();
        print('always open to work and collaboration: ', cmd('contact'), '.');
    }

    /**
     * age: how old I am, to ten decimal places, ticking up live until the next command
     * (or Ctrl+C). Born 8 October 2000; a birthday starts at midnight UK time, which
     * in October is BST, so 23:00 UTC the day before. The fraction is how far through
     * the current birthday-to-birthday year we are.
     */
    var ticker = null;

    function stopTicker() {
        if (ticker) { ticker(); ticker = null; }
    }

    function birthdayIn(year) { return Date.UTC(year, 9, 7, 23); }

    function ageAt(now) {
        var y = new Date(now).getUTCFullYear();
        if (now < birthdayIn(y)) y--;
        var last = birthdayIn(y), next = birthdayIn(y + 1);
        return { years: (y - 2000) + (now - last) / (next - last), last: last, next: next };
    }

    function countdown(ms) {
        var s = Math.floor(ms / 1000), two = function (n) { return String(n).padStart(2, '0'); };
        return Math.floor(s / 86400) + 'd ' + two(Math.floor(s / 3600) % 24) + 'h ' +
               two(Math.floor(s / 60) % 60) + 'm ' + two(s % 60) + 's';
    }

    function age() {
        stopTicker();
        var who = ID.key === 'mb' ? 'Michael' : ID.name,
            value = span('', 'w5'), note = dim('');
        print(who + ' is ', value, ' years old');
        print(note);
        function tick() {
            var now = Date.now(), a = ageAt(now);
            value.textContent = a.years.toFixed(10);
            note.textContent = now - a.last < 864e5
                ? '(it’s his birthday today!)'
                : '(next birthday 8 Oct, in ' + countdown(a.next - now) + ')';
        }
        tick();
        var t = setInterval(tick, 50);
        ticker = function () { clearInterval(t); };
    }

    function gravity() {
        print('a small gravity sim. on the top screen:');
        print('  click empty space    drop a gravity point');
        print('  drag a point         move it');
        print('  points that touch    merge and grow');
        print('  too big, or dbl-click  it collapses');
        if (reducedMotion) print(dim('(gravity points are off here, since your device asks for reduced motion.)'));
        else print('type ', cmd('exit'), ' to go back up and play.');
    }


    /**
     * FAQ
     *
     * q: the question as listed by `faq`
     * k: words people might type when asking it
     * a: prints the answer (may return a promise)
     *
     * To add one: { q: 'do you take commissions?', k: 'commission hire freelance work job',
     *               a: function () { print('...'); } }
     */
    var FAQ = [
        { q: 'who are you?',
          k: 'who whoami about yourself cubity cubityfirst michael burr name',
          a: function () { print(ID.name + '.'); tagline(); print('see ', cmd('faq'), ' for more, or ', cmd('projects'), '.'); } },
        { q: 'how do I get in touch?',
          k: 'contact email mail reach touch talk message dm get',
          a: contact },
        { q: 'what are you working on?',
          k: 'working work building build projects project current currently lately doing code making',
          a: workingOn },
        { q: 'do you have a PGP key?',
          k: 'pgp gpg key encrypt encrypted encryption signing sign verify fingerprint',
          a: function () { print('yes: ', cmd('cat pgp-key'), ', also verified on ', link('keybase', LINKS.keybase.href), ' (', cmd('cat keybase.txt'), ').'); } },
        { q: 'what’s the thing at the top of the page?',
          k: 'gravity black hole blackhole particles particle top background canvas animation thing sim simulation physics points',
          a: gravity },
        { q: 'where else can I find you?',
          k: 'social socials elsewhere online twitter bluesky bsky steam twitch reddit instagram discord telegram follow',
          a: socials },
        { q: 'is this site open source?',
          k: 'source open site website repo built made how',
          a: function () { print('yep: ', link('github.com/CubityFirst/cubityfir.st', 'https://github.com/CubityFirst/cubityfir.st'), '. plain html, css and js, served by cloudflare.'); } }
    ];

    var STOPWORDS = ('a an the is are am be do does did you your yours i me my we to of and or in on at for with ' +
                     'this that it its what whats where when how can could would should have has any there ' +
                     'please hey hi hello tell about up').split(' ');

    function tokens(text) {
        return text.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(function (w) {
            return w && STOPWORDS.indexOf(w) < 0;
        });
    }

    function score(entry, words) {
        var keys = entry.k.split(' '), s = 0;
        words.forEach(function (w) {
            if (keys.indexOf(w) >= 0) { s += 2; return; }
            for (var i = 0; i < keys.length; i++) {
                // Loose prefix match, so "emailing" finds "email" and "proj" finds "projects"
                if ((w.length >= 4 && keys[i].indexOf(w) === 0) || (keys[i].length >= 4 && w.indexOf(keys[i]) === 0)) {
                    s += 1;
                    return;
                }
            }
        });
        return s;
    }

    function answer(i) {
        print(span(FAQ[i].q, 'q'));
        return FAQ[i].a();
    }

    // Returns true if it found something to say
    function ask(text) {
        var words = tokens(text);
        if (!words.length) return false;
        var ranked = FAQ.map(function (f, i) { return { i: i, s: score(f, words) }; })
            .filter(function (r) { return r.s > 0; })
            .sort(function (a, b) { return b.s - a.s; });

        if (!ranked.length) return false;

        var result = answer(ranked[0].i);
        return Promise.resolve(result).then(function () {
            var also = ranked.slice(1, 3).filter(function (r) { return r.s >= ranked[0].s - 1; });
            if (also.length) {
                var line = print(dim('see also: '));
                also.forEach(function (r, k) {
                    if (k) line.appendChild(dim(', '));
                    line.appendChild(cmd(FAQ[r.i].q, 'faq ' + (r.i + 1)));
                });
            }
            return true;
        });
    }


    /**
     * Files
     */
    function fetchText(path) {
        return fetch(path).then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.text();
        });
    }

    function catRemote(path, name) {
        return fetchText(path).then(function (t) {
            t.replace(/\s+$/, '').split(/\r?\n/).forEach(function (l) { print(l); });
        }, function () { print(err('cat: ' + name + ': could not read file')); });
    }

    var FILES = {
        'about.txt':    about,
        'faq.md':       function () { return COMMANDS.faq.run([]); },
        'contact.txt':  contact,
        'pgp-key':      function () { return catRemote('/key', 'pgp-key'); },
        'keybase.txt':  function () { return catRemote('/keybase.txt', 'keybase.txt'); },
        'activity.log': function () { return tail(8); }
    };
    var DIRS = ['projects/', 'github/'];

    function tail(n) {
        if (!site.activity) return print(err('tail: cannot open ‘activity.log’'));
        return site.activity.then(function (lines) {
            if (!lines.length) return print(dim('(quiet lately)'));
            lines.slice(0, n).forEach(function (l) {
                var line = print(dim(site.stamp(l.at) + '  '), link(l.text, l.href));
                if (l.count > 1) line.appendChild(dim(' ×' + l.count));
            });
        }, function () { print(err('tail: cannot open ‘activity.log’: GitHub unreachable')); });
    }

    function listProjects(n) {
        if (!site.repos) return print(err('ls: cannot access ‘projects/’'));
        return site.repos.then(function (list) {
            list.slice(0, n).forEach(function (r) {
                print(link(r.name, r.homepage || r.html_url),
                      dim(pad('', Math.max(1, 26 - r.name.length)) + pad(r.language || '', 12) + site.ago(r.pushed_at)));
                if (r.description) print(dim('  ' + r.description));
            });
            print(link('all ' + list.length + ' on GitHub →', 'https://github.com/CubityFirst?tab=repositories'));
        }, function () { print(err('ls: cannot access ‘projects/’: GitHub unreachable')); });
    }


    /**
     * toktrack: my AI coding token usage, from /api/toktrack. Plain `toktrack` opens a
     * look-alike of the app's TUI (js/toktrack.js), which takes over the window until it's
     * quit; `toktrack stats` just prints the numbers.
     */
    var activeTUI = null, toktrackData = null;

    function loadToktrack() {
        if (!toktrackData) {
            // no-cache: the worker caches the summary, so asking it each time is cheap and
            // never leaves an old response shape in the browser's cache
            toktrackData = fetch('/api/toktrack', { cache: 'no-cache' }).then(function (r) {
                if (!r.ok) throw new Error(r.status);
                return r.json();
            });
            toktrackData.catch(function () { toktrackData = null; });
        }
        return toktrackData;
    }

    function toktrackStats() {
        return loadToktrack().then(function (d) {
            var s = d.stats, n = function (x) { return x.toLocaleString('en-US'); };
            [['total tokens', n(s.totalTokens)],
             ['daily average', n(s.dailyAvgTokens)],
             ['peak day', s.peakDay ? s.peakDay.date + ' (' + n(s.peakDay.tokens) + ')' : 'n/a'],
             ['total cost', '$' + s.totalCost.toFixed(2)],
             ['daily avg cost', '$' + s.dailyAvgCost.toFixed(2)],
             ['active days', String(s.activeDays)]
            ].forEach(function (r) { print(dim(pad(r[0], 16)), r[1]); });
            print(dim('(costs are what the tokens would cost at API prices. up to ' + d.updated + ')'));
        });
    }

    function toktrackTUI() {
        if (!window.TokTrackTUI) return print(err('toktrack: not available'));
        var formWasHidden = form.hidden;
        out.hidden = true;
        form.hidden = true;
        activeTUI = window.TokTrackTUI.open(body, loadToktrack());
        return activeTUI.done.then(function (d) {
            return d && print(dim('toktrack: ' + d.stats.totalTokens.toLocaleString('en-US') + ' tokens across ' + d.stats.activeDays + ' days'));
        }, function () {
            print(err('toktrack: couldn’t load usage data right now'));
        }).then(function () {
            activeTUI = null;
            out.hidden = false;
            form.hidden = formWasHidden;
            scrollDown();
            if (!formWasHidden) input.focus({ preventScroll: true });
        });
    }


    /**
     * Commands
     */
    var COMMANDS = {
        help: { help: 'this list', run: function () {
            print('commands:');
            Object.keys(COMMANDS).forEach(function (name) {
                var c = COMMANDS[name];
                if (c.hidden) return;
                print('  ', c.args ? span(name, 'p-cmd') : cmd(name), pad(c.args ? ' ' + c.args : '', 16 - name.length), dim(c.help));
            });
            print('or just ask a question, e.g. ', cmd('“are you on bluesky?”', 'are you on bluesky?'));
        } },

        whoami: { help: 'who’s this', run: tagline },

        ls: { help: 'list files', args: '[dir]', run: function (args) {
            var dir = (args.filter(function (a) { return a[0] !== '-'; })[0] || '').replace(/^~\/?/, '').replace(/\/$/, '');
            if (dir === 'projects') return listProjects(12);
            if (dir === 'github') return print(link(LINKS.github.label, LINKS.github.href));
            if (dir) return print(err('ls: cannot access ‘' + dir + '’: No such file or directory'));
            var line = print();
            var names = Object.keys(FILES).concat(DIRS);
            if (args.indexOf('-a') >= 0 || args.indexOf('-la') >= 0) names.unshift('.secrets');
            names.forEach(function (f, i) {
                if (i) line.appendChild(document.createTextNode('  '));
                var isDir = f.slice(-1) === '/';
                var b = cmd(f, f === '.secrets' ? 'cat .secrets' : (isDir ? 'ls ' : 'cat ') + f);
                if (isDir) b.classList.add('dir');
                line.appendChild(b);
            });
        } },

        cat: { help: 'print a file', args: '<file>', run: function (args) {
            var f = (args[0] || '').replace(/^~\//, '');
            if (!f) return print(err('cat: missing file operand'), dim(' (try '), cmd('ls'), dim(')'));
            if (f === '.secrets') return print('nice try.');
            if (FILES[f]) return FILES[f]();
            if (DIRS.indexOf(f) >= 0 || DIRS.indexOf(f + '/') >= 0) return print(err('cat: ' + f + ': Is a directory'));
            print(err('cat: ' + f + ': No such file or directory'));
        } },

        projects: { help: 'what I’ve been building', run: function () { return listProjects(8); } },

        tail: { help: 'recent GitHub activity', args: '[-n N]', run: function (args) {
            var n = 8;
            for (var i = 0; i < args.length; i++) {
                if (args[i] === '-n' && args[i + 1]) n = parseInt(args[i + 1], 10) || n;
                else if (/^-\d+$/.test(args[i])) n = parseInt(args[i].slice(1), 10);
            }
            return tail(Math.min(Math.max(n, 1), 30));
        } },

        faq: { help: 'frequently asked questions', args: '[n]', run: function (args) {
            var n = parseInt(args[0], 10);
            if (n >= 1 && n <= FAQ.length) return answer(n - 1);
            FAQ.forEach(function (f, i) { print(dim(pad(String(i + 1), 3)), cmd(f.q, 'faq ' + (i + 1))); });
        } },

        contact: { help: 'ways to reach me', run: contact },
        socials: { help: 'where else I am', run: socials },

        open: { help: 'open a link', args: '<name>', run: function (args) {
            var k = (args[0] || '').toLowerCase();
            if (k === 'mail') k = 'email';
            if (!LINKS[k]) {
                return print(err('open: unknown ‘' + (args[0] || '') + '’. '), dim('try one of: ' + Object.keys(LINKS).join(', ')));
            }
            window.open(LINKS[k].href, /^mailto:/.test(LINKS[k].href) ? '_self' : '_blank', 'noopener');
            print(dim('opening '), link(LINKS[k].label, LINKS[k].href));
        } },

        toktrack: { help: 'my AI coding token usage', run: function (args) {
            var sub = (args[0] || '').toLowerCase();
            if (sub === 'stats') return toktrackStats().catch(function () { print(err('toktrack: couldn’t load usage data right now')); });
            if (sub === '--version' || sub === '-v') return print('toktrack (web edition)');
            if (sub === '--help' || sub === '-h' || sub === 'help') {
                print('usage: toktrack [stats]');
                print(dim('  (no args)  open the dashboard. tab switches view, q quits'));
                return print(dim('  stats      print the headline numbers'));
            }
            if (sub) return print(err('toktrack: unknown command ‘' + args[0] + '’. '), dim('try '), cmd('toktrack --help'));
            return toktrackTUI();
        } },

        age: { help: 'how old I am, precisely', run: age },

        clear: { help: 'clear the screen and start fresh', run: clearScreen },

        // Hidden extras
        history: { hidden: true, run: function () {
            history.forEach(function (h, i) { print(dim(pad(String(i + 1), 4)), h); });
        } },
        echo: { hidden: true, run: function (args) { print(args.join(' ')); } },
        date: { hidden: true, run: function () { print(new Date().toString()); } },
        pgp: { hidden: true, run: function () { return FILES['pgp-key'](); } },
        gravity: { hidden: true, run: gravity },
        blackhole: { hidden: true, run: gravity },
        cd: { hidden: true, run: function (args) {
            if (!args[0] || args[0] === '~' || args[0] === '.') return;
            print(dim('this terminal only has ~. try '), cmd('ls ' + args[0]), dim('.'));
        } },
        sudo: { hidden: true, run: function () { print('cubity is not in the sudoers file. This incident will be reported.'); } },
        rm: { hidden: true, run: function (args) {
            var targets = args.filter(function (a) { return a[0] !== '-'; });
            if (!targets.length) return print(err('rm: missing operand'));
            targets.forEach(function (t) {
                var f = t.replace(/^~\//, '');
                if (/^(\/|\/\*|~\/?|\*|\.|\.\.)$/.test(t)) print(err('rm: refusing to remove ‘' + t + '’: it’s load-bearing'));
                else if (FILES[f] || DIRS.indexOf(f.replace(/\/?$/, '/')) >= 0) print(err('rm: cannot remove ‘' + t + '’: Permission denied'));
                else print(err('rm: cannot remove ‘' + t + '’: No such file or directory'));
            });
        } },
        vim: { hidden: true, run: function () { print('you’d never get out. try ', cmd('help'), '.'); } },
        exit: { hidden: true, run: function () {
            print(dim('logout'));
            window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
        } },
        ping: { hidden: true, run: function () { print('pong'); } },
        hi: { hidden: true, run: function () { print('hi! type ', cmd('help'), ', or just ask me something.'); } }
    };
    COMMANDS.nano = COMMANDS.emacs = COMMANDS.vim;
    COMMANDS.hello = COMMANDS.hey = COMMANDS.hi;
    COMMANDS.logout = COMMANDS.exit;
    COMMANDS.cls = COMMANDS.clear;
    COMMANDS.birthday = { hidden: true, run: age };


    /**
     * Generated answers
     *
     * Anything that isn't a command is sent to /api/ask (src/worker.js), which answers
     * with Claude using what's written down about me and my GitHub projects. The last few
     * exchanges go along so follow-up questions work. Answers are plain text; `commands`
     * in backticks become clickable, and URLs and email addresses become links.
     */
    var aiHistory = [], aiNoted = false,
        MAX_QUESTION = 300;

    // Splits answer text into strings and clickable nodes
    function richParts(text) {
        var parts = [], re = /`([^`\n]+)`|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|([a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)|((?:[a-z0-9-]+\.)+(?:st|uk|com|io|tv|app|me)\/[^\s<>()]*[^\s<>().,;:!?'"])/gi,
            last = 0, m;
        while ((m = re.exec(text))) {
            if (m.index > last) parts.push(text.slice(last, m.index));
            if (m[1]) {
                var c = m[1].trim(), first = c.split(/\s+/)[0].toLowerCase();
                parts.push(COMMANDS.hasOwnProperty(first) ? cmd(c) : span(c, 'p-cmd'));
            } else if (m[2]) {
                parts.push(link(m[2].replace(/^https?:\/\//, ''), m[2]));
            } else if (m[3]) {
                parts.push(link(m[3], 'mailto:' + m[3]));
            } else {
                parts.push(link(m[4], 'https://' + m[4]));
            }
            last = re.lastIndex;
        }
        if (last < text.length) parts.push(text.slice(last));
        return parts;
    }

    // Prints rich parts into `line`, typing the plain text unless motion is reduced.
    // Stops where it is if the command is cancelled (Ctrl+C).
    function typeParts(line, parts) {
        if (reducedMotion) {
            parts.forEach(function (p) { line.appendChild(typeof p === 'string' ? document.createTextNode(p) : p); });
            return Promise.resolve();
        }
        var i = 0, me = job;
        return new Promise(function (resolve) {
            (function next() {
                if (i >= parts.length || (me && me.cancelled)) return resolve();
                var p = parts[i++];
                if (typeof p !== 'string') { line.appendChild(p); scrollDown(); return next(); }
                var node = document.createTextNode(''), k = 0;
                line.appendChild(node);
                (function chunk() {
                    if (me && me.cancelled) return resolve();
                    k = Math.min(p.length, k + 3);
                    node.nodeValue = p.slice(0, k);
                    scrollDown();
                    if (k < p.length) setTimeout(chunk, 14);
                    else next();
                })();
            })();
        });
    }

    // Animated "thinking" line; returns a function that removes it
    function thinking() {
        var line = print(dim('thinking')), dots = 0;
        var t = setInterval(function () {
            dots = (dots + 1) % 4;
            line.firstChild.textContent = 'thinking' + '...'.slice(0, dots);
        }, 300);
        return function () { clearInterval(t); line.remove(); };
    }

    // Resolves to true if it printed an answer, or to the error code if not
    function askAI(text) {
        if (text.length > MAX_QUESTION) {
            print(err('that’s a bit long for me. '), dim('try a shorter question (up to ' + MAX_QUESTION + ' characters).'));
            return Promise.resolve(true);
        }
        var stop = thinking(), me = job,
            abort = window.AbortController ? new AbortController() : null;
        onCancel(function () { stop(); if (abort) abort.abort(); });
        return fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: text, history: aiHistory.slice(-6), site: ID.key }),
            signal: abort ? abort.signal : undefined
        }).then(function (r) {
            return r.json().catch(function () { return { error: 'unavailable' }; });
        }, function () {
            return { error: 'offline' };
        }).then(function (res) {
            stop();
            if (me && me.cancelled) return 'cancelled';
            if (!res.answer) return res.error || 'unavailable';
            aiHistory.push({ role: 'user', content: text }, { role: 'assistant', content: res.answer });
            var lines = res.answer.split(/\n+/), chain = Promise.resolve();
            lines.forEach(function (l) {
                chain = chain.then(function () { return typeParts(print(), richParts(l)); });
            });
            return chain.then(function () {
                if (!aiNoted) {
                    aiNoted = true;
                    print(dim('(answers to questions are written by an AI from what’s on this site, so they can be wrong. for anything important, '),
                          cmd('contact'), dim(' me.)'));
                }
                return true;
            });
        });
    }

    // Empties the screen and forgets the conversation, so the next question starts fresh
    function clearScreen() {
        stopTicker();
        out.textContent = '';
        aiHistory = [];
        aiNoted = false;
    }

    function notFound(text) {
        var words = text.split(/\s+/);
        if (words.length === 1 && !/\?$/.test(text)) {
            print(err(words[0] + ': command not found. '), dim('try '), cmd('help'), dim(', or ask a question.'));
        } else {
            print('I don’t have an answer for that one yet. try ', cmd('faq'), ', or ask me directly: ',
                  link(LINKS.email.label, LINKS.email.href));
        }
    }


    /**
     * Running things
     */
    // A greeting on its own ("hi", "hey!", "hello there") gets the canned reply. One with
    // more after it ("hi, what do you do?") is a question, so it goes on to be answered.
    var GREETING_ONLY = /^(hi|hello|hey|hiya|heya|howdy|yo)\b[\s,!.]*(there|all|again|cubity|cubityfirst|michael|terminal)?[\s,!.?]*$/i;

    // Questions about how old I am get the live counter rather than a generated answer.
    // Only ones that are clearly about me: they name me ("how old is michael?", "when's
    // his birthday?") or name nothing else ("how old?"). "how old is snapr" goes on to
    // be answered like any other question.
    var AGE_QUESTION = /\b(how old|age|aged|birthday|bday|born)\b/i,
        ABOUT_ME = /\b(he|him|his|hes|you|your|youre|u|ur|michaels?|burrs?|cubitys?|cubityfirsts?|owner)\b/i,
        AGE_WORDS = ['old', 'age', 'aged', 'birthday', 'bday', 'born', 's', 'whats', 'hows'];

    function asksMyAge(text) {
        if (!AGE_QUESTION.test(text) || /\bwhere\b/i.test(text)) return false;
        if (ABOUT_ME.test(text.replace(/[’']/g, ''))) return true;
        return tokens(text).filter(function (w) { return AGE_WORDS.indexOf(w) < 0; }).length === 0;
    }

    function run(text) {
        var words = text.trim().split(/\s+/),
            name = words[0].toLowerCase(),
            args = words.slice(1);

        if (GREETING_ONLY.test(text.trim())) return COMMANDS.hi.run([]);
        if (COMMANDS.hasOwnProperty(name) && COMMANDS[name] !== COMMANDS.hi) return COMMANDS[name].run(args);
        if (words.length > 1 && asksMyAge(text)) return age();

        return askAI(text).then(function (result) {
            if (result === true || result === 'cancelled') return;
            // Refused by the model or blocked by the gateway's guardrails: say no, and
            // don't go fishing in the FAQ (keyword matches there would answer something else)
            if (result === 'declined' || result === 'blocked') {
                return print('that’s not one I can answer. try ', cmd('help'), ', or ask me about me, my projects or this site.');
            }
            if (result === 'busy') print(dim('(lots of questions right now, so here’s the quick version)'));
            // Offline, busy or unavailable: fall back to the built-in FAQ
            return Promise.resolve(ask(text)).then(function (found) {
                if (!found) notFound(text);
            });
        });
    }

    /**
     * Ctrl+C. While a command is running it's cancelled (an answer being fetched is
     * dropped, one being typed stops where it is) and the prompt comes straight back.
     * Otherwise, like a shell, the half-typed line is abandoned with ^C.
     */
    var job = null;   // the running command: { cancelled, cleanups, cancel }

    function onCancel(fn) { if (job) job.cleanups.push(fn); }

    function interrupt() {
        stopTicker();
        if (job && !job.cancelled) {
            job.cancelled = true;
            job.cleanups.forEach(function (fn) { try { fn(); } catch (e) { /* already gone */ } });
            job.cancel();
            print(dim('^C'));
        } else {
            echo(input.value).appendChild(dim('^C'));
            input.value = '';
            historyAt = history.length;
        }
        scrollDown();
    }

    function submit(text) {
        if (activeTUI) activeTUI.close();
        stopTicker();
        finishIntro();
        queue = queue.then(function () {
            text = text.trim();
            echo(text);
            if (!text) return;
            if (history[history.length - 1] !== text) history.push(text);
            historyAt = history.length;
            var me = job = { cancelled: false, cleanups: [] };
            var cancelled = new Promise(function (r) { me.cancel = r; });
            var running = Promise.resolve().then(function () { return run(text); }).catch(function () {
                if (!me.cancelled) print(err('something went wrong running that.'));
            });
            return Promise.race([running, cancelled]).then(function () { if (job === me) job = null; });
        }).then(scrollDown);
        return queue;
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = input.value;
        input.value = '';
        submit(text);
    });

    function complete() {
        var value = input.value, parts = value.split(/\s+/), pool;
        if (parts.length === 1) {
            pool = Object.keys(COMMANDS).filter(function (c) { return !COMMANDS[c].hidden; });
        } else if (/^(cat|ls|open)$/.test(parts[0])) {
            pool = parts[0] === 'cat' ? Object.keys(FILES) : parts[0] === 'ls' ? DIRS : Object.keys(LINKS);
        } else {
            return;
        }
        var stem = parts[parts.length - 1].toLowerCase(),
            hits = pool.filter(function (p) { return p.indexOf(stem) === 0; });
        if (hits.length === 1) {
            parts[parts.length - 1] = hits[0];
            input.value = parts.join(' ') + (parts.length === 1 ? ' ' : '');
        } else if (hits.length > 1) {
            echo(value);
            print(dim(hits.join('  ')));
        }
    }

    input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (!history.length) return;
            e.preventDefault();
            historyAt = Math.min(Math.max(historyAt + (e.key === 'ArrowUp' ? -1 : 1), 0), history.length);
            input.value = history[historyAt] || '';
        } else if (e.key === 'Tab') {
            e.preventDefault();
            complete();
        } else if (e.key === 'l' && e.ctrlKey) {
            e.preventDefault();
            clearScreen();
        } else if (e.key === 'c' && e.ctrlKey && !e.shiftKey && !e.altKey) {
            // Leave copying alone when something's selected
            if (input.selectionStart !== input.selectionEnd || String(window.getSelection() || '')) return;
            e.preventDefault();
            interrupt();
        } else if (e.key === 'Escape') {
            input.value = '';
        }
    });

    // Click anywhere in the terminal to type, unless selecting text or hitting a link
    body.addEventListener('click', function (e) {
        if (activeTUI || e.target.closest('a, button')) return;
        if (window.getSelection && String(window.getSelection())) return;
        if (introDone) input.focus({ preventScroll: true });
        else focusAfterIntro = true;
        finishIntro();
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-term-cmd]'), function (b) {
        b.addEventListener('click', function () { submit(b.getAttribute('data-term-cmd')); });
    });


    /**
     * Intro: types whoami, ls and the last few activity lines, one after another.
     * Clicking the terminal skips to the end; with reduced motion it prints instantly.
     */
    var introStarted = false;

    function fast() { return skipIntro || reducedMotion; }
    function pause(ms) { return fast() ? Promise.resolve() : wait(ms); }

    function finishIntro() {
        skipIntro = true;
        if (!introStarted) startIntro();
    }

    // Types `text` after the prompt, with a caret
    function typeCommand(text) {
        var line = print(promptNode()), typed = span('', 'p-cmd'), caret = span('', 'cursor');
        line.appendChild(typed);
        line.appendChild(caret);
        var i = 0;
        return new Promise(function (resolve) {
            (function next() {
                if (fast() || i >= text.length) {
                    typed.textContent = text;
                    caret.remove();
                    return resolve();
                }
                typed.textContent += text[i++];
                setTimeout(next, 35 + Math.random() * 45);
            })();
        });
    }

    function intro() {
        var steps = [
            ['whoami', tagline],
            ['ls', function () { return COMMANDS.ls.run([]); }],
            ['tail -n 5 activity.log', function () { return tail(5); }]
        ];
        var chain = Promise.resolve();
        out.textContent = '';   // drops the <noscript> fallback
        steps.forEach(function (s, i) {
            chain = chain.then(function () { return pause(i ? 450 : 200); })
                .then(function () { return typeCommand(s[0]); })
                .then(s[1])
                .then(function () { print(); });
        });
        return chain.then(function () {
            print(dim('type '), cmd('help'), dim(', or ask something like '),
                  cmd('\u201chow do I get in touch?\u201d', 'how do I get in touch?'));
            form.hidden = false;
            introDone = true;
            scrollDown();
            if (focusAfterIntro) input.focus({ preventScroll: true });
        });
    }

    function startIntro() {
        if (introStarted) return;
        introStarted = true;
        queue = intro();
    }

    if (section.classList.contains('shown')) startIntro();
    else section.addEventListener('revealed', startIntro);
})();
