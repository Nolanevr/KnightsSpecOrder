/*
 * Special attack / phase tracking logic. Has no Alt1 or DOM dependencies so it can
 * be tested in node.
 *
 * The phase is shared, but every boss (Lady and Lord) has its own special order.
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
		// Index of the next special, per boss id.
		this.nextSpecial = {};
		for (var b = 0; b < this.config.bosses.length; b++) {
			this.nextSpecial[this.config.bosses[b].id] = 0;
		}
	};

	SpecTracker.prototype.phaseCount = function () {
		return this.config.phases.length;
	};

	SpecTracker.prototype.currentPhase = function () {
		return this.config.phases[this.phase];
	};

	SpecTracker.prototype.specials = function (bossId) {
		return this.currentPhase().specials[bossId] || [];
	};

	// Move to a phase (0-based). Specials carry on where they left off unless the
	// phase is marked resetSpecials.
	SpecTracker.prototype.setPhase = function (index) {
		if (index < 0 || index >= this.phaseCount() || index == this.phase) { return; }
		this.phase = index;
		var reset = this.currentPhase().resetSpecials;
		for (var id in this.nextSpecial) {
			var count = this.specials(id).length;
			if (reset) { this.nextSpecial[id] = 0; }
			else if (count > 0) { this.nextSpecial[id] = this.nextSpecial[id] % count; }
		}
	};

	SpecTracker.prototype.nextPhase = function () {
		this.setPhase(this.phase + 1);
	};

	SpecTracker.prototype.previousPhase = function () {
		this.setPhase(this.phase - 1);
	};

	// Mark a special of a boss in the current phase as the one that comes next.
	SpecTracker.prototype.setNextSpecial = function (bossId, index) {
		var count = this.specials(bossId).length;
		if (count == 0) { return; }
		this.nextSpecial[bossId] = ((index % count) + count) % count;
	};

	// A boss just used a special. If `usedIndex` is given that special was used,
	// otherwise the predicted one was.
	SpecTracker.prototype.specialUsed = function (bossId, usedIndex) {
		var count = this.specials(bossId).length;
		if (count == 0) { return; }
		var used = (usedIndex == null ? this.nextSpecial[bossId] : usedIndex);
		this.nextSpecial[bossId] = (used + 1) % count;
	};

	SpecTracker.prototype.cooledDown = function (key) {
		var t = this.now();
		var cooldown = this.config.triggerCooldownMs || 0;
		if (this.lastTrigger[key] != null && t - this.lastTrigger[key] < cooldown) { return false; }
		this.lastTrigger[key] = t;
		return true;
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

		// Specials of the current phase. Start looking at the predicted special so that
		// if two specials share a chat line the expected one wins.
		for (var b = 0; b < cfg.bosses.length; b++) {
			var boss = cfg.bosses[b];
			var specials = this.specials(boss.id);
			for (var i = 0; i < specials.length; i++) {
				var s = (this.nextSpecial[boss.id] + i) % specials.length;
				if (matchesAny(line, specials[s].lines)) {
					if (!this.cooledDown("special" + this.phase + "_" + boss.id + "_" + s)) { return null; }
					this.specialUsed(boss.id, s);
					return boss.name + ": " + specials[s].name + " used";
				}
			}
		}
		return null;
	};

	SpecTracker.normalize = normalize;

	if (typeof module !== "undefined") { module.exports = SpecTracker; }
	else { root.SpecTracker = SpecTracker; }
})(this);
