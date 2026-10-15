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
	var settings = { view: "both", layout: "ultra", compact: false, names: {}, bossNames: {}, headers: "show" };

	// The name to show for a boss's special: the player's own name if they set one.
	function displayName(bossId, special) {
		return (settings.names[bossId] || {})[special] || special;
	}
	// The name to show for a boss, in full or short (for tight spaces): the player's own
	// name if they set one, otherwise the configured name or its first word.
	function bossName(boss, short) {
		return settings.bossNames[boss.id] || (short ? boss.name.split(" ")[0] : boss.name);
	}

	function render() {
		var phase = tracker.currentPhase();
		el("phase-prev").disabled = tracker.phase == 0;
		el("phase-next").disabled = tracker.phase == tracker.phaseCount() - 1;
		// Which bosses' columns to show: all, or just the one picked in the options.
		var shown = cfg.bosses.map(function (boss, b) { return b; }).filter(function (b) {
			return settings.view == "both" || phase.alwaysShowBoth || cfg.bosses[b].id == settings.view;
		});
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
				own.textContent = displayName(cfg.bosses[b].id, step[b]);
				if (tint) { own.style.color = cfg.bosses[b].color; }
				cell.appendChild(own);
				// With one boss shown, add the other boss's specials that matter to this boss's
				// tank, in the other boss's colour.
				if (shown.length == 1) {
					cfg.bosses.forEach(function (other, o) {
						if (o != b && (cfg.bosses[b].alsoShow || []).indexOf(step[o]) != -1) {
							var extra = document.createElement("span");
							extra.className = "extra";
							extra.textContent = displayName(other.id, step[o]);
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

	// Move past steps that have no chat line once their time has passed.
	setInterval(function () {
		var result = tracker.tick();
		if (result) {
			log(result, true);
			render();
		}
	}, 500);

	applySettings();
	start();
})();
