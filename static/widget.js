/*!
 * GG Live Seats widget v1.1
 *
 * Shows live PC availability from the GG Status site on any web page.
 * The WordPress plugin's shortcodes output the markup below; it can also be used by hand:
 *
 *   <div class="gg-seats" data-src="https://status-site"></div>                         full card
 *   <div class="gg-seats" data-src="https://status-site" data-style="compact"></div>    one-line badge
 *   options: data-theme="light"  data-map="no"
 *   <script src="https://status-site/widget.js" defer></script>
 *
 * Renders inside a shadow root so the host site's theme can't restyle it.
 */
(function () {
	'use strict';
	if (window.GGSeats) return window.GGSeats.scan();

	var self = document.currentScript && document.currentScript.src;
	var DEFAULT_SRC = self ? new URL(self).origin : '';
	var REFRESH_MS = 30000;
	var cards = [];

	// GG Gaming Lounge opening hours, Perth time. [open, close) in hours after midnight; >24 runs past midnight.
	var HOURS = [
		[10, 24], // Sun
		[12, 24], // Mon
		[12, 24], // Tue
		[12, 24], // Wed
		[12, 24], // Thu
		[12, 25], // Fri
		[10, 25] // Sat
	];
	var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function perthNow() {
		try {
			var parts = new Intl.DateTimeFormat('en-AU', {
				timeZone: 'Australia/Perth',
				weekday: 'short',
				hour: 'numeric',
				minute: 'numeric',
				hourCycle: 'h23'
			}).formatToParts(new Date());
			var get = function (t) {
				for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value;
				return '';
			};
			return { day: DAYS.indexOf(get('weekday')), hour: Number(get('hour')) + Number(get('minute')) / 60 };
		} catch (e) {
			return null;
		}
	}
	function fmtHour(h) {
		var hh = Math.floor(h) % 24;
		return hh === 0 ? '12am' : hh === 12 ? '12pm' : hh < 12 ? hh + 'am' : hh - 12 + 'pm';
	}
	function openStatus() {
		var n = perthNow();
		if (!n || n.day < 0) return { open: true, text: 'Live seats' };
		var today = HOURS[n.day];
		var yClose = HOURS[(n.day + 6) % 7][1];
		if (n.hour + 24 < yClose) return { open: true, text: 'Open until ' + fmtHour(yClose) };
		if (n.hour >= today[0] && n.hour < today[1]) return { open: true, text: 'Open until ' + fmtHour(today[1]) };
		if (n.hour < today[0]) return { open: false, text: 'Opens ' + fmtHour(today[0]) + ' today' };
		return { open: false, text: 'Opens ' + fmtHour(HOURS[(n.day + 1) % 7][0]) + ' tomorrow' };
	}

	var CUT = 'clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);';
	var CSS =
		':host{all:initial;display:block;' +
		'--bg:#000;--panel:#0b0d11;--line:rgba(255,255,255,.14);--text:#f5f7fa;--muted:#bcc3d0;' +
		'--seat-free:#f5f7fa;--seat-taken:#3a4150;--bar:#f5f7fa;--btn:#1aeeff;--btn-ink:#000}' +
		':host([data-theme=light]){--bg:#f2f4f7;--panel:#fff;--line:rgba(15,19,31,.12);--text:#0f131f;--muted:#5b6478;' +
		'--seat-free:#0f131f;--seat-taken:#c9cfda;--bar:#0f131f}' +
		'*{box-sizing:border-box}' +
		'.gg{font-family:"Barlow Semi Condensed","Barlow","Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--text);font-size:16px;line-height:1.3;text-align:left;-webkit-font-smoothing:antialiased}' +
		// ---- full card ----
		'.card{max-width:640px;margin:0 auto;padding:26px 28px 24px;background:var(--panel);border:1px solid var(--line);' + CUT.replace(/12px/g, '22px') + '}' +
		'.head{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.12em}' +
		'.eyebrow{display:inline-flex;align-items:center;gap:8px}' +
		'.dot{width:9px;height:9px;border-radius:50%;background:#2fd48b;box-shadow:0 0 0 0 rgba(47,212,139,.6);animation:pulse 2s infinite}' +
		'.dot.off{background:var(--muted);animation:none}' +
		'@keyframes pulse{70%{box-shadow:0 0 0 8px rgba(47,212,139,0)}100%{box-shadow:0 0 0 0 rgba(47,212,139,0)}}' +
		'.hours{color:var(--muted)}' +
		'.hero{display:flex;align-items:flex-end;gap:16px;margin:18px 0 18px}' +
		'.big{font-size:84px;line-height:.8;font-weight:700;letter-spacing:-.02em}' +
		'.big small{font-size:34px;color:var(--muted);font-weight:600;margin-left:4px}' +
		'.label strong{display:block;font-size:28px;line-height:1;font-weight:700;text-transform:uppercase}' +
		'.label span{display:block;margin-top:6px;font-size:17px;color:var(--muted);font-family:"Inter",system-ui,sans-serif}' +
		'.bar{height:6px;background:var(--line);overflow:hidden}' +
		'.bar i{display:block;height:100%;background:var(--bar);transition:width .8s cubic-bezier(.2,.8,.2,1)}' +
		'.maps{display:flex;flex-direction:column;gap:18px;margin-top:22px}' +
		'.map{min-width:0}' +
		'.map h4{margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}' +
		'.map svg{display:block;width:100%;height:auto;max-height:120px}' +
		'.extras{display:flex;flex-wrap:wrap;gap:8px 26px;margin-top:20px;font-size:16px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;color:var(--muted)}' +
		'.extras b{color:var(--text)}' +
		'.foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;margin-top:24px}' +
		'.btn{display:inline-flex;align-items:center;gap:10px;padding:13px 26px;background:var(--btn);color:var(--btn-ink);text-decoration:none;' +
		'font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;' + CUT + 'transition:background .25s}' +
		'.btn:hover,.btn:focus-visible{background:#fff;outline:none}' +
		':host([data-theme=light]) .btn:hover{background:#0f131f;color:#fff}' +
		'.updated{font-size:14px;color:var(--muted);font-family:"Inter",system-ui,sans-serif}' +
		'.msg{padding:34px 0;text-align:center;color:var(--muted);font-size:18px}' +
		'.closed .label strong{font-size:34px}' +
		// ---- compact badge ----
		'.pill{display:inline-flex;align-items:center;gap:12px;padding:10px 18px 10px 16px;background:var(--panel);border:1px solid var(--line);' +
		'color:var(--text);text-decoration:none;font-size:17px;font-weight:600;letter-spacing:.02em;' + CUT.replace(/12px/g, '9px') + 'transition:border-color .2s}' +
		'.pill:hover{border-color:var(--text)}' +
		'.pill b{font-size:22px;font-weight:700}' +
		'.pill .sep{width:1px;height:18px;background:var(--line)}' +
		'.pill .go{font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:14px;color:var(--muted)}' +
		'.pill:hover .go{color:var(--text)}' +
		'@media (max-width:480px){.card{padding:20px 18px}.big{font-size:64px}.big small{font-size:26px}.label strong{font-size:22px}.foot{flex-direction:column;align-items:stretch}.btn{justify-content:center}}';

	function esc(v) {
		return String(v).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}

	function ago(iso) {
		var s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
		if (!isFinite(s) || s < 45) return 'Updated just now';
		var m = Math.round(s / 60);
		if (m < 60) return 'Updated ' + m + ' min ago';
		var h = Math.round(m / 60);
		return h < 24 ? 'Updated ' + h + ' hr ago' : 'Updated ' + Math.round(h / 24) + ' days ago';
	}

	function tally(pcs, zone) {
		var t = { free: 0, total: 0 };
		for (var i = 0; i < pcs.length; i++) {
			if (pcs[i].zone !== zone) continue;
			t.total++;
			if (pcs[i].status === 'free') t.free++;
		}
		return t;
	}

	/** Tiny seat map for one floor: outlined = free, filled = taken. */
	function miniMap(pcs, floor, cols) {
		// PCs only: sims and consoles are summarised in text underneath
		var list = pcs.filter(function (p) {
			return (p.floor || 'ground') === floor && p.zone === 'pc';
		});
		if (!list.length) return '';
		// Squash empty rows (walkway, open void) into one small gap so the map stays compact.
		var ys = [];
		for (var i = 0; i < list.length; i++) if (ys.indexOf(list[i].y) < 0) ys.push(list[i].y);
		ys.sort(function (a, b) {
			return a - b;
		});
		var rowPos = {},
			pos = 0;
		for (var r = 0; r < ys.length; r++) {
			if (r && ys[r] - ys[r - 1] > 1) pos += 0.8; // gap where empty rows were
			rowPos[ys[r]] = pos++;
		}
		var S = 10,
			G = 3,
			W = cols * (S + G) - G,
			H = pos * (S + G) - G;
		var rects = '';
		for (var j = 0; j < list.length; j++) {
			var p = list[j];
			var x = p.x * (S + G),
				y = rowPos[p.y] * (S + G);
			rects +=
				p.status === 'free'
					? '<rect x="' + (x + 0.75) + '" y="' + (y + 0.75) + '" width="' + (S - 1.5) + '" height="' + (S - 1.5) + '" rx="2" fill="none" stroke="var(--seat-free)" stroke-width="1.5"/>'
					: '<rect x="' + x + '" y="' + y + '" width="' + S + '" height="' + S + '" rx="2" fill="var(--seat-taken)"/>';
		}
		var name = floor === 'upstairs' ? 'Upstairs' : 'Ground floor';
		var free = 0,
			total = 0;
		for (var k = 0; k < list.length; k++)
			if (list[k].zone === 'pc') {
				total++;
				if (list[k].status === 'free') free++;
			}
		return (
			'<div class="map"><h4>' + name + (total ? ' · ' + free + ' free' : '') + '</h4>' +
			'<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + name + ' seat map, ' + free + ' of ' + total + ' PCs free">' + rects + '</svg></div>'
		);
	}

	function renderCard(c, state) {
		var pcs = state.pcs || [];
		var pc = tally(pcs, 'pc'),
			sim = tally(pcs, 'sim'),
			con = tally(pcs, 'console');
		var taken = pc.total - pc.free;
		var pct = pc.total ? Math.round((taken / pc.total) * 100) : 0;
		var hrs = openStatus();
		var cols = 0;
		for (var i = 0; i < pcs.length; i++) cols = Math.max(cols, pcs[i].x + 1);

		var hero;
		if (!hrs.open) {
			hero = '<div class="hero closed"><div class="label"><strong>We’re closed right now</strong><span>' + esc(hrs.text) + '. Check back then for live seats.</span></div></div>';
		} else if (pc.free === 0) {
			hero = '<div class="hero"><div class="label"><strong>Full house</strong><span>All ' + pc.total + ' PCs are taken. Check back soon.</span></div></div>';
		} else {
			hero =
				'<div class="hero" aria-live="polite"><div class="big">' + pc.free + '<small>/' + pc.total + '</small></div>' +
				'<div class="label"><strong>PCs free</strong><span>' + (taken === 0 ? 'Every seat is open' : taken + (taken === 1 ? ' person' : ' people') + ' gaming right now') + '</span></div></div>';
		}

		var extras = '';
		if (sim.total) extras += '<span>Racing sims <b>' + sim.free + '/' + sim.total + '</b> free</span>';
		if (con.total) extras += '<span>Consoles <b>' + con.free + '/' + con.total + '</b> free</span>';

		var maps = c.opts.map !== 'no' && hrs.open ? '<div class="maps">' + miniMap(pcs, 'ground', cols) + miniMap(pcs, 'upstairs', cols) + '</div>' : '';

		c.body.innerHTML =
			'<div class="card">' +
			'<div class="head"><span class="eyebrow"><i class="dot' + (hrs.open ? '' : ' off') + '"></i>Live seats</span><span class="hours">' + esc(hrs.open ? hrs.text : 'Closed') + '</span></div>' +
			hero +
			(hrs.open ? '<div class="bar" role="img" aria-label="' + pct + '% of PCs in use"><i style="width:' + pct + '%"></i></div>' : '') +
			maps +
			(hrs.open && extras ? '<div class="extras">' + extras + '</div>' : '') +
			'<div class="foot"><a class="btn" href="' + esc(c.src) + '" target="_blank" rel="noopener">See the live seat map <span aria-hidden="true">→</span></a>' +
			'<span class="updated">' + esc(ago(state.updatedAt)) + '</span></div>' +
			'</div>';
	}

	function renderPill(c, state) {
		var pc = tally(state.pcs || [], 'pc');
		var hrs = openStatus();
		var text = !hrs.open
			? 'Closed · ' + esc(hrs.text)
			: pc.free === 0
				? 'All PCs taken right now'
				: '<b>' + pc.free + '</b> PCs free right now';
		c.body.innerHTML =
			'<a class="pill" href="' + esc(c.src) + '" target="_blank" rel="noopener"><i class="dot' + (hrs.open ? '' : ' off') + '"></i>' +
			'<span>' + text + '</span><i class="sep"></i><span class="go">See seats →</span></a>';
	}

	function render(c, state) {
		c.last = state;
		(c.opts.style === 'compact' ? renderPill : renderCard)(c, state);
	}

	function fail(c) {
		if (c.last) return; // keep showing the last good numbers
		c.body.innerHTML =
			c.opts.style === 'compact'
				? '<a class="pill" href="' + esc(c.src) + '" target="_blank" rel="noopener"><i class="dot off"></i><span>See live seats</span><i class="sep"></i><span class="go">Open →</span></a>'
				: '<div class="card"><div class="msg">Live seat count is unavailable right now.</div><div class="foot"><a class="btn" href="' + esc(c.src) + '" target="_blank" rel="noopener">Open the seat map →</a></div></div>';
	}

	function load(c) {
		return fetch(c.src + '/api/status', { cache: 'no-store' })
			.then(function (r) {
				if (!r.ok) throw new Error(String(r.status));
				return r.json();
			})
			.then(function (s) {
				render(c, s);
			})
			.catch(function () {
				fail(c);
			});
	}

	function mount(el) {
		if (el.__ggSeats) return;
		var opts = {
			style: el.getAttribute('data-style') === 'compact' ? 'compact' : 'card',
			map: el.getAttribute('data-map') === 'no' ? 'no' : 'yes'
		};
		var theme = el.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
		var src = (el.getAttribute('data-src') || DEFAULT_SRC).replace(/\/+$/, '');
		var root = el.attachShadow ? el.attachShadow({ mode: 'open' }) : el;
		if (el.attachShadow) {
			// theme selector targets the shadow host
			el.setAttribute('data-theme', theme);
		}
		root.innerHTML =
			'<style>' + CSS + '</style><div class="gg">' +
			(opts.style === 'compact' ? '<span class="pill"><i class="dot off"></i><span>Loading live seats…</span></span>' : '<div class="card"><div class="msg">Loading live seats…</div></div>') +
			'</div>';
		var c = { el: el, src: src, opts: opts, body: root.querySelector('.gg'), last: null };
		el.__ggSeats = c;
		cards.push(c);
		load(c);
	}

	function scan() {
		var els = document.querySelectorAll('.gg-seats');
		for (var i = 0; i < els.length; i++) mount(els[i]);
	}

	function refresh() {
		for (var i = 0; i < cards.length; i++) if (cards[i].el.isConnected) load(cards[i]);
	}

	setInterval(function () {
		if (!document.hidden) refresh();
	}, REFRESH_MS);
	document.addEventListener('visibilitychange', function () {
		if (!document.hidden) refresh();
	});

	window.GGSeats = { scan: scan, refresh: refresh, version: '1.1.0' };
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
	else scan();
})();
