/*
 * Special attack / phase tracking logic. Has no Alt1 or DOM dependencies so it can
 * be tested in node.
 *
 * Each phase has one rotation of specials. Every step of the rotation is a pair:
 * one special per boss, used at the same time.
 */
(function (root) {
	// Normalise a chat line for fuzzy matching: drop the timestamp, lower-case it,
	// strip everything that isn't a letter or digit and fold characters the OCR
	// commonly confuses.
	function normalize(text) {
		return String(text)
			.replace(/^\s*\[\d{1,2}:\d{2}(:\d{2})?\]\s*/, "")
			.toLowerCase()
			.replace(/[lij1]/g, "l")
			.replace(/0/g, "o")
			.replace(/[^a-z0-9]/g, "");
	}

	function matchesAny(normLine, patterns) {
		if (!patterns) { return false; }
		for (var i = 0; i < patterns.length; i++) {
			var p = normalize(patterns[i]);
			if (p && normLine.indexOf(p) != -1) { return true; }
		}
		return false;
	}

	function SpecTracker(config, now) {
		this.config = config;
		this.now = now || function () { return Date.now(); };
		this.lastTrigger = {};
		this.reset();
	}

	SpecTracker.prototype.reset = function () {
		this.phase = 0;
		this.nextSpecial = 0;
		this.lastUsed = null;
	};

	SpecTracker.prototype.phaseCount = function () {
		return this.config.phases.length;
	};

	SpecTracker.prototype.currentPhase = function () {
		return this.config.phases[this.phase];
	};

	SpecTracker.prototype.rotation = function () {
		return this.currentPhase().rotation;
	};

	// Move to a phase (0-based). The rotation carries on where it left off unless the
	// phase is marked resetSpecials.
	SpecTracker.prototype.setPhase = function (index) {
		if (index < 0 || index >= this.phaseCount() || index == this.phase) { return; }
		this.phase = index;
		this.lastUsed = null;
		if (this.currentPhase().resetSpecials) { this.nextSpecial = 0; }
		else { this.nextSpecial = this.nextSpecial % this.rotation().length; }
	};

	SpecTracker.prototype.nextPhase = function () {
		this.setPhase(this.phase + 1);
	};

	SpecTracker.prototype.previousPhase = function () {
		this.setPhase(this.phase - 1);
	};

	// Mark a step of the current rotation as the one that comes next.
	SpecTracker.prototype.setNextSpecial = function (index) {
		var count = this.rotation().length;
		this.nextSpecial = ((index % count) + count) % count;
		this.lastUsed = null;
	};

	// A step of the rotation was just used.
	SpecTracker.prototype.specialUsed = function (index) {
		this.nextSpecial = (index + 1) % this.rotation().length;
		this.lastUsed = { index: index, time: this.now() };
	};

	SpecTracker.prototype.cooledDown = function (key) {
		var t = this.now();
		var cooldown = this.config.triggerCooldownMs || 0;
		if (this.lastTrigger[key] != null && t - this.lastTrigger[key] < cooldown) { return false; }
		this.lastTrigger[key] = t;
		return true;
	};

	// Which boss special a line is, as { boss, bossIndex, special }, or null.
	SpecTracker.prototype.matchSpecial = function (line) {
		var bosses = this.config.bosses;
		for (var b = 0; b < bosses.length; b++) {
			var lines = this.config.specialLines[bosses[b].id] || {};
			for (var special in lines) {
				if (matchesAny(line, lines[special])) {
					return { boss: bosses[b], bossIndex: b, special: special };
				}
			}
		}
		return null;
	};

	// Feed a chat line. Returns a short description of what happened, or null if
	// the line wasn't a trigger.
	SpecTracker.prototype.handleLine = function (text) {
		var line = normalize(text);
		if (!line) { return null; }
		var cfg = this.config;

		if (matchesAny(line, cfg.resetLines)) {
			if (!this.cooledDown("reset")) { return null; }
			this.reset();
			return "Fight started";
		}

		for (var p = 0; p < cfg.phases.length; p++) {
			if (p != this.phase && matchesAny(line, cfg.phases[p].phaseLines)) {
				if (!this.cooledDown("phase" + p)) { return null; }
				this.setPhase(p);
				return "Entered " + this.currentPhase().name;
			}
		}

		if (matchesAny(line, cfg.nextPhaseLines)) {
			if (!this.cooledDown("nextphase")) { return null; }
			this.nextPhase();
			return "Entered " + this.currentPhase().name;
		}

		var match = this.matchSpecial(line);
		if (!match) { return null; }
		var rotation = this.rotation();
		var label = match.boss.name + ": " + match.special;

		// The other boss's half of the step that was just used (or the same line read twice).
		var last = this.lastUsed;
		if (last && this.now() - last.time < (cfg.pairWindowMs || 0)
			&& rotation[last.index][match.bossIndex] == match.special) {
			return label + " (same step)";
		}

		// Otherwise it's the first step from the predicted one that has this special.
		for (var i = 0; i < rotation.length; i++) {
			var s = (this.nextSpecial + i) % rotation.length;
			if (rotation[s][match.bossIndex] == match.special) {
				this.specialUsed(s);
				return label;
			}
		}
		return null;
	};

	SpecTracker.normalize = normalize;

	if (typeof module !== "undefined") { module.exports = SpecTracker; }
	else { root.SpecTracker = SpecTracker; }
})(this);
