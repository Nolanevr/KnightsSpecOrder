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

	function render() {
		var phase = tracker.currentPhase();
		el("phase-name").textContent = phase.name;
		el("phase-prev").disabled = tracker.phase == 0;
		el("phase-next").disabled = tracker.phase == tracker.phaseCount() - 1;
		var head = document.createElement("div");
		head.className = "step-head";
		cfg.bosses.forEach(function (boss) {
			var name = document.createElement("span");
			name.textContent = boss.name;
			name.style.color = boss.color;
			head.appendChild(name);
		});
		var rows = [head];
		tracker.rotation().forEach(function (step, i) {
			var row = document.createElement("div");
			row.className = "step" + (i == tracker.nextSpecial ? " next" : "");
			row.title = "Step " + (i + 1) + " \u2013 click to make it the next special";
			step.forEach(function (special) {
				var cell = document.createElement("span");
				cell.textContent = special;
				row.appendChild(cell);
			});
			row.onclick = function () { tracker.setNextSpecial(i); render(); };
			rows.push(row);
		});
		specialsEl.replaceChildren.apply(specialsEl, rows);
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

	render();
	start();
})();
