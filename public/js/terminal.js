/**
 * Interactive terminal (prototype)
 *
 * A small fake shell that doubles as the FAQ. Known commands run directly; anything else
 * is treated as a plain-English question and matched against FAQ below by keyword. That
 * match step, ask(), is the place an LLM-backed answer could slot in later.
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

    var LINKS = {
        email:     { label: 'cubity@cubityfir.st',           href: 'mailto:cubity@cubityfir.st' },
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
        p.appendChild(span('cubity@cubityfir.st', 'p-user'));
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

    function gravity() {
        print('a small gravity sim. on the top screen:');
        print('  click empty space    drop a gravity point');
        print('  drag a point         move it');
        print('  points that touch    merge and grow');
        print('  too big, or dbl-click  it collapses');
        print('type ', cmd('exit'), ' to go back up and play.');
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
          k: 'who whoami about yourself cubity cubityfirst name',
          a: function () { print('cubityfirst.'); tagline(); print('see ', cmd('faq'), ' for more, or ', cmd('projects'), '.'); } },
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

        // Hook point: with no keyword match, an LLM-backed answer could go here, e.g. POST
        // the question to a Worker that knows the FAQ and the GitHub data.
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
        'about.txt':    function () { print('cubityfirst.'); tagline(); print(); return workingOn(); },
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

        clear: { help: 'clear the screen', run: function () { out.textContent = ''; } },

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
            print(err(args.join(' ').indexOf('-rf') >= 0 ? 'rm: refusing to remove ‘/’: it’s load-bearing' : 'rm: permission denied'));
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


    /**
     * Running things
     */
    function run(text) {
        var words = text.trim().split(/\s+/),
            name = words[0].toLowerCase(),
            args = words.slice(1);

        if (COMMANDS.hasOwnProperty(name)) return COMMANDS[name].run(args);

        return Promise.resolve(ask(text)).then(function (found) {
            if (found) return;
            if (words.length === 1 && !/\?$/.test(text)) {
                print(err(name + ': command not found. '), dim('try '), cmd('help'), dim(', or ask a question.'));
            } else {
                print('I don’t have an answer for that one yet. try ', cmd('faq'), ', or ask me directly: ',
                      link(LINKS.email.label, LINKS.email.href));
            }
        });
    }

    function submit(text) {
        finishIntro();
        queue = queue.then(function () {
            text = text.trim();
            echo(text);
            if (!text) return;
            if (history[history.length - 1] !== text) history.push(text);
            historyAt = history.length;
            return Promise.resolve(run(text)).catch(function () {
                print(err('something went wrong running that.'));
            });
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
            out.textContent = '';
        } else if (e.key === 'Escape') {
            input.value = '';
        }
    });

    // Click anywhere in the terminal to type, unless selecting text or hitting a link
    body.addEventListener('click', function (e) {
        if (e.target.closest('a, button')) return;
        if (window.getSelection && String(window.getSelection())) return;
        if (introDone) input.focus({ preventScroll: true });
        else focusAfterIntro = true;
        finishIntro();
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-term-cmd]'), function (b) {
        b.addEventListener('click', function () { submit(b.getAttribute('data-term-cmd')); });
    });


    /**
     * Intro
     */
    function finishIntro() {
        skipIntro = true;
        if (!introDone) startIntro();
    }

    function typeCommand(text) {
        var line = print(promptNode()), typed = span('', 'p-cmd'), caret = span('', 'cursor');
        line.appendChild(typed);
        line.appendChild(caret);
        var i = 0;
        return new Promise(function (resolve) {
            (function next() {
                if (skipIntro || reducedMotion || i >= text.length) {
                    typed.textContent = text;
                    caret.remove();
                    return resolve();
                }
                typed.textContent += text[i++];
                setTimeout(next, 35 + Math.random() * 45);
            })();
        });
    }

    var introStarted = false;
    function startIntro() {
        if (introStarted) return;
        introStarted = true;
        out.textContent = '';

        var steps = [
            ['whoami', tagline],
            ['ls', function () { return COMMANDS.ls.run([]); }],
            ['tail -n 5 activity.log', function () { return tail(5); }]
        ];
        var chain = Promise.resolve();
        steps.forEach(function (s, i) {
            chain = chain.then(function () {
                return skipIntro || reducedMotion ? null : wait(i ? 450 : 200);
            }).then(function () {
                return typeCommand(s[0]);
            }).then(function () {
                return s[1]();
            }).then(function () {
                print();
            });
        });
        queue = chain.then(function () {
            print(dim('type '), cmd('help'), dim(', or ask something like '),
                  cmd('“how do I get in touch?”', 'how do I get in touch?'));
            form.hidden = false;
            introDone = true;
            scrollDown();
            if (focusAfterIntro) input.focus({ preventScroll: true });
        });
    }

    if (section.classList.contains('shown')) startIntro();
    else section.addEventListener('revealed', startIntro);
})();
