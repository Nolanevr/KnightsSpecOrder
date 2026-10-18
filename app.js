/*
 * Alt1 glue: reads the chatbox, feeds lines to the SpecTracker and renders the panel.
 */
(function () {
	var cfg = BOSS_CONFIG;
	var tracker = new SpecTracker(cfg);
	var reader = null;
	var inAlt1 = typeof alt1 != "undefined";

	var el = function (id) { return document.getElementById(id); };
	var specialsEl = el("specials");
	var statusEl = el("status");
	var logEl = el("log");
	var showChatEl = el("show-chat");
	var chatboxSelectEl = el("chatbox-select");

	// The on-screen "Phase: N" marker. It only shows up during a kill and can be anywhere
	// on screen, so it's searched for (about once a second) while a fight is going on,
	// then only its small area is read until it disappears again.
	var MARKER_SEARCH_MS = 1000;
	var MARKER_ACTIVE_MS = 10 * 60 * 1000; // keep searching this long after the last boss line
	var MARKER_LOST_READS = 8; // forget the marker after this many failed reads in a row
	var phaseFont = null;
	var marker = { pos: null, misses: 0, lastPhase: null, lastSearch: 0, activeUntil: 0 };
	var ROWS = 3; // rows of specials in a normal phase

	// Options from the cog menu, remembered between sessions.
	//  view:    "both", or a boss id to show only that boss (phase 3 always shows both)
	//  layout:  how a 6-step phase is shown: "standard" (6 full rows), "side" (steps 1-3
	//           and 4-6 side by side) or "ultra" (6 half-height rows, the space of 3)
	//  compact: hide the buttons, status line and Tools
	//  names:   the player's own names for specials, as { bossId: { special: name } }
	//  bossNames: the player's own names for the bosses, as { bossId: name }
	//  headers: "show" the boss names over the columns, or "tint" to hide them and colour
	//           each special's text in its boss's colour instead
	//  flash:   flash each special on screen when its chat line comes in
	//  textPos: where the on-screen specials go, as { fx, fy }: the middle of the first
	//           line as fractions of the game window's width and height, or null for
	//           the default (below the character)
	//  textSize: the on-screen specials' text size in pixels, or null for flashTextSize
	var settings = { view: "both", layout: "ultra", compact: false, names: {}, bossNames: {}, headers: "show", flash: true, textPos: null, textSize: null };

	// The name to show for a boss's special: the player's own name if they set one.
	function displayName(bossId, special) {
		return (settings.names[bossId] || {})[special] || special;
	}
	// The name to show for a boss's half of a step: its special, or "Random" when it picks
	// one at random (which one flashes on screen when it's said).
	function entryName(bossId, entry) {
		return Array.isArray(entry) ? "Random" : displayName(bossId, entry);
	}
	// The specials a boss's half of a step can be, by name.
	function optionNames(bossId, entry) {
		return SpecTracker.options(entry).map(function (s) { return displayName(bossId, s); }).join(" / ");
	}
	// The other boss's specials in a step that also matter to a boss's tank (alsoShow),
	// by name, or null. When the other boss picks one at random, it's only maybe (e.g.
	// "Meatball?").
	function alsoShownName(boss, other, entry) {
		var extras = SpecTracker.options(entry).filter(function (s) { return (boss.alsoShow || []).indexOf(s) != -1; });
		if (!extras.length) { return null; }
		return optionNames(other.id, extras) + (Array.isArray(entry) ? "?" : "");
	}
	// The name to show for a boss, in full or short (for tight spaces): the player's own
	// name if they set one, otherwise the configured name or its first word.
	function bossName(boss, short) {
		return settings.bossNames[boss.id] || (short ? boss.name.split(" ")[0] : boss.name);
	}

	// Which bosses' specials to show: all, or just the one picked in the options.
	function shownBosses(phase) {
		return cfg.bosses.map(function (boss, b) { return b; }).filter(function (b) {
			return settings.view == "both" || phase.alwaysShowBoth || cfg.bosses[b].id == settings.view;
		});
	}

	function render() {
		var phase = tracker.currentPhase();
		el("phase-prev").disabled = tracker.phase == 0;
		el("phase-next").disabled = tracker.phase == tracker.phaseCount() - 1;
		var shown = shownBosses(phase);
		el("phase-name").textContent = phase.name;
		var steps = tracker.rotation();
		var layout = steps.length > ROWS ? settings.layout : "standard";
		var blocks = layout == "side" ? Math.ceil(steps.length / ROWS) : 1;
		// Side by side: narrower boxes, so smaller text.
		var dense = blocks > 1;
		specialsEl.classList.toggle("half", layout == "ultra");
		specialsEl.classList.toggle("dense", dense);
		specialsEl.style.gridTemplateColumns = "repeat(" + blocks + ", minmax(0, 1fr))";

		var inner = "repeat(" + shown.length + ", minmax(0, 1fr))";
		var items = [];
		// One boss: a single name over everything. Both side by side: names over each block.
		var tint = settings.headers == "tint";
		specialsEl.classList.toggle("tint", tint);
		var firstRow = tint ? 1 : 2;
		for (var k = 0; k < (tint ? 0 : shown.length > 1 ? blocks : 1); k++) {
			var head = document.createElement("div");
			head.className = "step-head";
			head.style.gridTemplateColumns = inner;
			head.style.gridRow = "1";
			head.style.gridColumn = shown.length > 1 ? String(k + 1) : "1 / -1";
			shown.forEach(function (b) {
				var boss = cfg.bosses[b];
				var name = document.createElement("span");
				name.textContent = bossName(boss, dense && shown.length > 1);
				name.style.color = boss.color;
				head.appendChild(name);
			});
			items.push(head);
		}
		steps.forEach(function (step, i) {
			var box = document.createElement("div");
			box.className = "step" + (i == tracker.nextSpecial ? " next" : "");
			box.title = "Step " + (i + 1) + " \u2013 click to make it the next special";
			box.style.gridTemplateColumns = inner;
			box.style.gridColumn = String(blocks > 1 ? Math.floor(i / ROWS) + 1 : 1);
			box.style.gridRow = String(firstRow + (blocks > 1 ? i % ROWS : i));
			shown.forEach(function (b) {
				var cell = document.createElement("span");
				cell.className = "cell";
				var own = document.createElement("span");
				own.textContent = entryName(cfg.bosses[b].id, step[b]);
				if (Array.isArray(step[b])) { own.title = "One of: " + optionNames(cfg.bosses[b].id, step[b]); }
				if (tint) { own.style.color = cfg.bosses[b].color; }
				cell.appendChild(own);
				// With one boss shown, add the other boss's specials that matter to this boss's
				// tank, in the other boss's colour.
				if (shown.length == 1) {
					cfg.bosses.forEach(function (other, o) {
						var name = o != b ? alsoShownName(cfg.bosses[b], other, step[o]) : null;
						if (name) {
							var extra = document.createElement("span");
							extra.className = "extra";
							extra.textContent = name;
							extra.style.color = other.color;
							cell.appendChild(extra);
						}
					});
				}
				box.appendChild(cell);
			});
			box.onclick = function () { tracker.setNextSpecial(i); render(); };
			items.push(box);
		});
		specialsEl.replaceChildren.apply(specialsEl, items);
	}

	// Specials in large bold writing below the character (the middle of the game window),
	// one line per boss in the boss's colour: the bosses shown in the panel (with Lady
	// shown, also Lord's Meatball or Blue Bar in that step; in phase 3 both).
	//  - The next step's specials appear warnAfterMs after the previous special (and the
	//    first special of a kill firstWarnAfterMs after it starts), until used.
	//  - When a special's chat line comes in, its step's specials show for flashMs.
	// A step where a boss picks a special at random (Lord in phase 5) shows only the pick,
	// when he says it; with just the other boss shown (Lady's tank), that boss's own
	// special (Dash) also appears beforehand and on its line as normal.
	var FLASH_GROUP = "kso-flash";
	var FLASH_MS = 300; // on a chat line the text swaps between white and its colour this often
	var TEXT_SIZE_MIN = 16, TEXT_SIZE_MAX = 80;
	var moving = false; // placing the text with Alt+1
	var moved = 0; // when the text was last placed, to show it there for a moment
	var flashing = { lines: null, key: null, start: 0 }; // the flash from the last chat line
	var drawn = { key: null }; // what's on screen

	// Whether a step has a boss picking a special at random (Lord in phase 5).
	function isRandomStep(step) {
		return step.some(function (entry) { return Array.isArray(entry); });
	}

	function line(bossIndex, text) {
		return { text: text.toUpperCase(), color: cfg.bosses[bossIndex].color };
	}

	function flashLines(stepIndex) {
		var step = tracker.rotation()[stepIndex];
		var shown = shownBosses(tracker.currentPhase());
		// A random step: only the shown boss's own special, when one boss is shown and it
		// isn't the one picking at random.
		if (isRandomStep(step)) {
			var own = shown.length == 1 && !Array.isArray(step[shown[0]]);
			return own ? [line(shown[0], entryName(cfg.bosses[shown[0]].id, step[shown[0]]))] : [];
		}
		var lines = shown.map(function (b) { return line(b, entryName(cfg.bosses[b].id, step[b])); });
		// With one boss shown, the other boss's specials that matter to this boss's tank.
		if (shown.length == 1) {
			cfg.bosses.forEach(function (other, o) {
				var name = o != shown[0] ? alsoShownName(cfg.bosses[shown[0]], other, step[o]) : null;
				if (name) { lines.push(line(o, name)); }
			});
		}
		return lines;
	}

	function stopFlash() {
		flashing = { lines: null, key: null, start: 0 };
		updateFlash();
	}

	// After a chat line was recognised.
	function flashSpecial() {
		var m = tracker.lastMatch;
		tracker.lastMatch = null;
		if (!m || !settings.flash) { return; }
		// The random pick on its own, in any view.
		var lines = m.random ? [line(m.bossIndex, displayName(cfg.bosses[m.bossIndex].id, m.special))] : flashLines(m.step);
		if (!lines.length) { return; }
		var key = lines.map(function (l) { return l.text; }).join("|");
		// The other boss's line for the same step: keep flashing.
		if (key == flashing.key && Date.now() < flashing.start + cfg.flashMs) { return; }
		flashing = { lines: lines, key: key, start: Date.now() };
		updateFlash();
	}

	function hexColor(hex) {
		var n = parseInt(hex.slice(1), 16);
		return A1lib.mixColor(n >> 16, (n >> 8) & 255, n & 255);
	}

	// Sample text to show while the text is being placed.
	function sampleLines() {
		return [line(0, displayName(cfg.bosses[0].id, "Dash")), line(1, displayName(cfg.bosses[1].id, "Meatball"))];
	}

	// What should be on screen now: { key, lines, end }, or null.
	function currentDisplay(now) {
		var pos = textPosition();
		var where = pos.x + "," + pos.y + "," + textSize();
		if (moving) {
			// Redrawn now and then: overlays can't stay up for ever.
			return { key: "move|" + where + "|" + Math.floor(now / 20000), lines: sampleLines(), end: now + 21000 };
		}
		if (now < moved + cfg.flashMs) {
			return { key: "moved|" + moved + "|" + where, lines: sampleLines(), end: moved + cfg.flashMs };
		}
		if (flashing.lines && now < flashing.start + cfg.flashMs) {
			// Swaps between white and the boss colours.
			var n = Math.floor((now - flashing.start) / FLASH_MS);
			var lines = n % 2 ? flashing.lines.map(function (l) { return { text: l.text, color: "#ffffff" }; }) : flashing.lines;
			return { key: "flash|" + flashing.start + "|" + n + "|" + where, lines: lines, end: Math.min(now + FLASH_MS * 2, flashing.start + cfg.flashMs) };
		}
		var at = settings.flash ? tracker.warningTime() : null;
		if (at == null || now < at || now >= at + cfg.warningMs) { return null; }
		lines = flashLines(tracker.nextSpecial);
		if (!lines.length) { return null; }
		// Once per special: the key changes when the next special does.
		return { key: "next|" + at + "|" + tracker.phase + "|" + tracker.nextSpecial + "|" + where, lines: lines, end: at + cfg.warningMs };
	}

	function textSize() {
		return settings.textSize || cfg.flashTextSize;
	}

	// Where the middle of the first line goes, in game window pixels.
	function textPosition() {
		var p = settings.textPos;
		if (p) { return { x: Math.round(p.fx * alt1.rsWidth), y: Math.round(p.fy * alt1.rsHeight) }; }
		return { x: Math.round(alt1.rsWidth / 2), y: Math.round(alt1.rsHeight * (0.5 + cfg.flashBelow)) };
	}

	function drawLines(lines, ms) {
		var pos = textPosition(), x = pos.x, y = pos.y;
		var size = textSize(), lineHeight = Math.round(size * 1.2);
		alt1.overLaySetGroup(FLASH_GROUP);
		lines.forEach(function (line, i) {
			var color = hexColor(line.color), ly = y + i * lineHeight;
			alt1.overLayTextEx(line.text, color, size, x, ly, ms, "", true, true);
			// Bold: the same text again 1px to the right (without a shadow, which would show
			// through the first copy).
			if (cfg.flashBold) { alt1.overLayTextEx(line.text, color, size, x + 1, ly, ms, "", true, false); }
		});
		alt1.overLaySetGroup("");
	}

	function updateFlash() {
		if (!inAlt1 || !alt1.permissionOverlay || !alt1.rsLinked) { return; }
		var now = Date.now();
		var show = currentDisplay(now);
		var key = show ? show.key : null;
		if (key == drawn.key) { return; }
		// Swapped in one go (frozen while it's redrawn), so it doesn't blink.
		var freeze = !!alt1.overLayFreezeGroup;
		if (freeze) { alt1.overLayFreezeGroup(FLASH_GROUP); }
		alt1.overLayClearGroup(FLASH_GROUP);
		if (show) { drawLines(show.lines, show.end - now); }
		if (freeze) { alt1.overLayRefreshGroup(FLASH_GROUP); }
		drawn = { key: key };
	}

	// Placing the text: point the mouse where it should go and press Alt+1.
	function startMoving() {
		moving = true;
		el("options").hidden = true;
		el("move").hidden = false;
		updateFlash();
	}
	function stopMoving() {
		moving = false;
		el("move").hidden = true;
		updateFlash();
	}
	function placeText(pos) {
		settings.textPos = pos;
		saveSettings();
		moved = Date.now();
		stopMoving();
	}
	if (inAlt1 && typeof A1lib != "undefined" && A1lib.on) {
		A1lib.on("alt1pressed", function (e) {
			var p = e.mouseRs;
			if (!moving || !p || p.x < 0 || p.y < 0 || p.x >= alt1.rsWidth || p.y >= alt1.rsHeight) { return; }
			placeText({ fx: p.x / alt1.rsWidth, fy: p.y / alt1.rsHeight });
		});
	}

	function setStatus(text, type) {
		statusEl.textContent = text;
		statusEl.className = type || "";
	}

	function log(text, hit) {
		var li = document.createElement("li");
		li.textContent = text;
		li.title = text;
		if (hit) { li.className = "hit"; }
		logEl.insertBefore(li, logEl.firstChild);
		while (logEl.children.length > 1000) { logEl.removeChild(logEl.lastChild); }
	}

	function handleChatLine(text) {
		var result = tracker.handleLine(text);
		if (result) {
			fightActivity();
			log(result + "  ←  " + text, true);
			flashSpecial();
			render();
		} else if (showChatEl.checked) {
			log(text);
		}
	}

	function createReader() {
		reader = new Chatbox.default();
		addSkipUnreadableRule(reader);
		cfg.extraChatColors.forEach(function (c) {
			reader.readargs.colors.push(A1lib.mixColor(c[0], c[1], c[2]));
		});
	}

	function updateChatboxSelect() {
		var boxes = reader.pos.boxes;
		el("chatbox-select-row").hidden = boxes.length < 2;
		chatboxSelectEl.innerHTML = "";
		boxes.forEach(function (box, i) {
			var opt = document.createElement("option");
			opt.value = i;
			opt.textContent = "#" + (i + 1) + " (" + box.type + ")";
			opt.selected = box == reader.pos.mainbox;
			chatboxSelectEl.appendChild(opt);
		});
	}

	function highlightChatbox() {
		var r = reader.pos.mainbox.rect;
		alt1.overLayRect(A1lib.mixColor(76, 255, 106), r.x, r.y, r.width, r.height, 2000, 2);
	}

	function findChat() {
		if (!reader) { return false; }
		reader.pos = null;
		if (!reader.find() || !reader.pos) { return false; }
		updateChatboxSelect();
		highlightChatbox();
		return true;
	}

	function fightActivity() {
		marker.activeUntil = Date.now() + MARKER_ACTIVE_MS;
	}

	function markerStatus() {
		if (!phaseFont) { return ""; }
		if (marker.pos) { return " \u00b7 phase marker found"; }
		return Date.now() < marker.activeUntil ? " \u00b7 looking for phase marker" : "";
	}

	function trackPhaseMarker() {
		if (!phaseFont) { return; }
		if (marker.pos) {
			var x0 = Math.max(0, marker.pos.x - 4), y0 = Math.max(0, marker.pos.y - 14);
			var img = A1lib.capture(x0, y0, 90, 20);
			var phase = img && PhaseMarker.read(img, marker.pos.x - x0, marker.pos.y - y0, OCR, phaseFont);
			if (phase == null) {
				if (++marker.misses >= MARKER_LOST_READS) {
					marker.pos = null;
					marker.lastPhase = null;
					log("Phase marker gone");
				}
				return;
			}
			marker.misses = 0;
			fightActivity();
			// Only act when the marker changes, so the arrow buttons can still override it.
			if (phase != marker.lastPhase) {
				marker.lastPhase = phase;
				if (phase - 1 != tracker.phase && phase - 1 < tracker.phaseCount()) {
					tracker.setPhase(phase - 1);
					render();
					log("Entered " + tracker.currentPhase().name + "  \u2190  screen marker", true);
				}
			}
			return;
		}
		var now = Date.now();
		if (now > marker.activeUntil || now - marker.lastSearch < MARKER_SEARCH_MS) { return; }
		marker.lastSearch = now;
		var screen = A1lib.captureHoldFullRs();
		var pos = screen && PhaseMarker.find(screen.toData());
		if (pos) {
			marker.pos = pos;
			marker.misses = 0;
			alt1.overLayRect(A1lib.mixColor(76, 255, 106), pos.x - 4, pos.y - 14, 70, 20, 2000, 2);
			log("Phase marker found");
		}
	}

	function tick() {
		if (!alt1.rsLinked) { setStatus("RuneScape not detected", "warn"); return; }
		trackPhaseMarker();
		if (!reader.pos) {
			if (!findChat()) { setStatus("Searching for chatbox…" + markerStatus(), "warn"); return; }
		}
		var lines = reader.read();
		if (lines == null) { setStatus("Chatbox found, waiting for text…" + markerStatus(), "ok"); return; }
		setStatus("Reading chat" + markerStatus(), "ok");
		lines.forEach(function (line) { handleChatLine(line.text); });
	}

	function start() {
		if (!inAlt1) {
			setStatus("Not in Alt1 – use Tools to simulate chat", "warn");
			return;
		}
		alt1.identifyAppUrl("./appconfig.json");
		if (!alt1.permissionPixel) {
			setStatus("Missing pixel permission – re-add the app in Alt1", "warn");
			return;
		}
		if (typeof Chatbox == "undefined") {
			setStatus("Couldn't load Alt1 libraries (no internet?)", "warn");
			return;
		}
		createReader();
		phaseFont = (typeof Alt1Fonts != "undefined" && Alt1Fonts.chatbox && Alt1Fonts.chatbox["12pt"]) || null;
		setInterval(function () {
			try { tick(); } catch (e) { setStatus("Error: " + e.message, "warn"); console.error(e); }
		}, cfg.readIntervalMs);
	}

	// Options menu (cog button).
	function saveSettings() {
		try { localStorage.setItem("kso.settings", JSON.stringify(settings)); } catch (e) { }
	}
	function loadSettings() {
		try {
			var saved = JSON.parse(localStorage.getItem("kso.settings") || "null");
			if (saved) { Object.assign(settings, saved); }
			else {
				// Settings saved by older versions.
				settings.view = localStorage.getItem("kso.view") || settings.view;
				settings.compact = localStorage.getItem("kso.compact") == "1";
			}
		} catch (e) { }
		if (settings.view != "both" && !cfg.bosses.some(function (b) { return b.id == settings.view; })) { settings.view = "both"; }
		if (["standard", "side", "ultra"].indexOf(settings.layout) == -1) { settings.layout = "ultra"; }
		if (!settings.names || typeof settings.names != "object") { settings.names = {}; }
		if (!settings.bossNames || typeof settings.bossNames != "object") { settings.bossNames = {}; }
		if (settings.headers != "tint") { settings.headers = "show"; }
		settings.flash = settings.flash !== false;
		var p = settings.textPos;
		if (!p || !(p.fx >= 0 && p.fx <= 1 && p.fy >= 0 && p.fy <= 1)) { settings.textPos = null; }
		var size = settings.textSize;
		if (!(size >= TEXT_SIZE_MIN && size <= TEXT_SIZE_MAX)) { settings.textSize = null; }
	}
	// A row of buttons where one is selected, for a setting.
	function segmented(container, key, choices) {
		choices.forEach(function (choice) {
			var button = document.createElement("button");
			button.textContent = choice[1];
			button.dataset.value = choice[0];
			button.onclick = function () { settings[key] = choice[0]; applySettings(); };
			container.appendChild(button);
		});
	}
	function applySettings() {
		document.body.classList.toggle("compact", settings.compact);
		Array.prototype.forEach.call(el("opt-view").children, function (button) {
			var boss = cfg.bosses.filter(function (b) { return b.id == button.dataset.value; })[0];
			if (boss) { button.textContent = bossName(boss, true); }
		});
		el("opt-compact").checked = settings.compact;
		el("opt-flash").checked = settings.flash;
		el("opt-text-size").value = textSize();
		el("opt-text-size-value").textContent = textSize();
		[["opt-view", "view"], ["opt-layout", "layout"], ["opt-headers", "headers"]].forEach(function (pair) {
			Array.prototype.forEach.call(el(pair[0]).children, function (button) {
				button.classList.toggle("selected", button.dataset.value == settings[pair[1]]);
			});
		});
		saveSettings();
		render();
	}
	segmented(el("opt-view"), "view", [["both", "Both"]].concat(cfg.bosses.map(function (b) { return [b.id, bossName(b, true)]; })));
	segmented(el("opt-layout"), "layout", [["standard", "Standard"], ["side", "Side by side"], ["ultra", "Ultra compact"]]);
	segmented(el("opt-headers"), "headers", [["show", "Show"], ["tint", "Hide, colour the text"]]);
	el("opt-compact").onchange = function () { settings.compact = el("opt-compact").checked; applySettings(); };
	el("opt-flash").onchange = function () {
		settings.flash = el("opt-flash").checked;
		if (!settings.flash) { stopFlash(); }
		applySettings();
	};

	// Rename panel: a box per boss and per special. Empty means the original name.
	function renameRow(list, original, current, onChange) {
		var row = document.createElement("label");
		row.className = "rename-row";
		var label = document.createElement("span");
		label.textContent = original;
		var input = document.createElement("input");
		input.maxLength = 24;
		input.placeholder = original;
		input.value = current || "";
		input.oninput = function () {
			var name = input.value.trim();
			onChange(name && name != original ? name : null);
			saveSettings();
			applySettings();
		};
		row.appendChild(label);
		row.appendChild(input);
		list.appendChild(row);
		return input;
	}
	function buildRenameList() {
		var list = el("rename-list");
		list.innerHTML = "";
		var titles = {};
		var heading = document.createElement("div");
		heading.className = "rename-boss";
		heading.textContent = "Bosses";
		list.appendChild(heading);
		cfg.bosses.forEach(function (boss) {
			renameRow(list, boss.name, settings.bossNames[boss.id], function (name) {
				if (name) { settings.bossNames[boss.id] = name; } else { delete settings.bossNames[boss.id]; }
				titles[boss.id].textContent = bossName(boss);
			});
		});
		cfg.bosses.forEach(function (boss) {
			var title = titles[boss.id] = document.createElement("div");
			title.className = "rename-boss";
			title.textContent = bossName(boss);
			title.style.color = boss.color;
			list.appendChild(title);
			Object.keys(cfg.specialLines[boss.id] || {}).forEach(function (special) {
				renameRow(list, special, (settings.names[boss.id] || {})[special], function (name) {
					var names = settings.names[boss.id] = settings.names[boss.id] || {};
					if (name) { names[special] = name; } else { delete names[special]; }
				});
			});
		});
	}
	el("btn-rename").onclick = function () {
		el("options").hidden = true;
		buildRenameList();
		el("rename").hidden = false;
	};
	el("btn-rename-done").onclick = function () { el("rename").hidden = true; };
	el("btn-move").onclick = startMoving;
	// Text size: shows the sample text at the new size while the slider moves.
	el("opt-text-size").min = TEXT_SIZE_MIN;
	el("opt-text-size").max = TEXT_SIZE_MAX;
	el("opt-text-size").oninput = function () {
		var size = +el("opt-text-size").value;
		settings.textSize = size == cfg.flashTextSize ? null : size;
		el("opt-text-size-value").textContent = size;
		saveSettings();
		moved = Date.now();
		updateFlash();
	};
	el("btn-move-done").onclick = stopMoving;
	el("btn-move-reset").onclick = function () { placeText(null); };
	el("btn-rename-reset").onclick = function () {
		settings.names = {};
		settings.bossNames = {};
		saveSettings();
		buildRenameList();
		applySettings();
	};
	el("btn-options").onclick = function (e) {
		e.stopPropagation();
		el("options").hidden = !el("options").hidden;
	};
	// Close the menu when clicking anywhere else.
	document.addEventListener("click", function (e) {
		if (!el("options").hidden && !el("options").contains(e.target)) { el("options").hidden = true; }
	});
	loadSettings();

	el("phase-prev").onclick = function () { tracker.previousPhase(); render(); };
	el("phase-next").onclick = function () { tracker.nextPhase(); render(); };
	el("btn-reset").onclick = function () { tracker.reset(); render(); };
	el("btn-find").onclick = function () {
		if (!inAlt1 || !reader) { return; }
		var found = findChat();
		setStatus(found ? "Chatbox found" : "Chatbox not found", found ? "ok" : "warn");
		// Also look for the phase marker straight away.
		marker.pos = null;
		marker.lastSearch = 0;
		fightActivity();
	};
	chatboxSelectEl.onchange = function () {
		reader.pos.mainbox = reader.pos.boxes[+chatboxSelectEl.value];
		reader.overlaplines = [];
		highlightChatbox();
	};
	// Copy the log, oldest line first, so it can be pasted elsewhere.
	el("btn-copy-log").onclick = function () {
		var text = Array.prototype.map.call(logEl.children, function (li) { return li.textContent; }).reverse().join("\n");
		var done = function () { setStatus("Log copied (" + logEl.children.length + " lines)", "ok"); };
		var fallback = function () {
			var area = document.createElement("textarea");
			area.value = text;
			document.body.appendChild(area);
			area.select();
			var ok = document.execCommand("copy");
			document.body.removeChild(area);
			if (ok) { done(); } else { setStatus("Couldn't copy the log", "warn"); }
		};
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(done, fallback);
		} else {
			fallback();
		}
	};
	el("btn-clear-log").onclick = function () { logEl.innerHTML = ""; };
	el("simulate").onsubmit = function (e) {
		e.preventDefault();
		var input = el("simulate-text");
		if (input.value.trim()) { handleChatLine(input.value); }
		input.value = "";
	};

	// Move past steps that have no chat line once their time has passed, and keep the
	// flash going.
	setInterval(function () {
		var result = tracker.tick();
		if (result) {
			log(result, true);
			render();
		}
		try { updateFlash(); } catch (e) { console.error(e); }
	}, 100);

	applySettings();
	start();
})();
