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

	function tick() {
		if (!alt1.rsLinked) { setStatus("RuneScape not detected", "warn"); return; }
		if (!reader.pos) {
			if (!findChat()) { setStatus("Searching for chatbox…", "warn"); return; }
		}
		var lines = reader.read();
		if (lines == null) { setStatus("Chatbox found, waiting for text…", "ok"); return; }
		setStatus("Reading chat", "ok");
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
