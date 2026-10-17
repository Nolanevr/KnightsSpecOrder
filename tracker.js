/*
 * Special attack / phase tracking logic. Has no Alt1 or DOM dependencies so it can
 * be tested in node.
 *
 * Each phase has one rotation of specials. Every step of the rotation is a pair:
 * one special per boss, used at the same time. A boss's half of a step can also be a
 * list of specials, for a step where the boss picks one of them at random.
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

	// The chat timestamp of a line in seconds since midnight, or null if it has none.
	function chatTime(text) {
		var m = String(text).match(/^\s*\[(\d{1,2}):(\d{2}):(\d{2})\]/);
		return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null;
	}

	// The specials a boss's half of a step can be: one, or a random pick from a list.
	function options(entry) {
		return Array.isArray(entry) ? entry : [entry];
	}

	function stepLabel(step) {
		return step.map(function (entry) { return options(entry).join(" / "); }).join(" + ");
	}

	function SpecTracker(config, now) {
		this.config = config;
		this.now = now || function () { return Date.now(); };
		this.lastTrigger = {};
		// Triggers already counted, by chat timestamp, and the newest timestamp counted.
		// Kept across resets so that old lines read again never count twice.
		this.seen = {};
		this.seenCount = 0;
		this.newestTime = null;
		this.reset();
	}

	SpecTracker.prototype.reset = function () {
		this.phase = 0;
		this.nextSpecial = 0;
		this.lastUsed = null;
		this.phaseStartTime = null;
		// When the kill started (Lady's new-kill line), or null if not known.
		this.fightStartTime = null;
		// The last special recognised: { bossIndex, special, step, random }, where random
		// means it was one boss's random pick for that step.
		this.lastMatch = null;
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
		this.phaseStartTime = this.now();
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
		this.phaseStartTime = null;
	};

	// A step of the rotation was just used.
	SpecTracker.prototype.specialUsed = function (index) {
		this.nextSpecial = (index + 1) % this.rotation().length;
		this.lastUsed = { index: index, time: this.now() };
		this.phaseStartTime = null;
	};

	// Whether a step of the current rotation can go by without any chat line, because
	// one of its specials has none (Blue Bar) and the other boss's line is only shown
	// to that boss's tank.
	SpecTracker.prototype.isSilentStep = function (index) {
		var cfg = this.config, step = this.rotation()[index];
		for (var b = 0; b < step.length; b++) {
			var lines = cfg.specialLines[cfg.bosses[b].id] || {};
			var silent = options(step[b]).every(function (special) { return !(lines[special] || []).length; });
			if (silent) { return true; }
		}
		return false;
	};

	// Call regularly. A silent step happens a set time after the previous special (or
	// after the phase starts, for a phase that opens with one), so if the next step is a
	// silent one and its time has passed with no line, assume it happened and move on.
	// Returns a short description when it does, otherwise null.
	SpecTracker.prototype.tick = function () {
		var cfg = this.config, last = this.lastUsed, startDelay = this.currentPhase().silentStartDelayMs;
		var due = null;
		var delay = this.currentPhase().silentStepDelayMs || cfg.silentStepDelayMs;
		if (last && delay) { due = last.time + delay; }
		else if (!last && this.phaseStartTime != null && startDelay) { due = this.phaseStartTime + startDelay; }
		if (due == null || !this.isSilentStep(this.nextSpecial)) { return null; }
		if (this.now() < due + (cfg.silentStepGraceMs || 0)) { return null; }
		var index = this.nextSpecial;
		this.nextSpecial = (index + 1) % this.rotation().length;
		this.lastUsed = { index: index, time: due };
		this.phaseStartTime = null;
		return "Step " + (index + 1) + " (" + stepLabel(this.rotation()[index]) + ") has no chat line, assumed used";
	};

	// When to show that the next special is coming: warnAfterMs (the phase's own, if it
	// has one) after the previous special; in a phase that opens with a silent step, the
	// same time before that step is due; and for the first special of a kill,
	// firstWarnAfterMs after the kill started. Null when there's nothing to go on.
	SpecTracker.prototype.warningTime = function () {
		var cfg = this.config, last = this.lastUsed, phase = this.currentPhase();
		var warnAfter = phase.warnAfterMs || cfg.warnAfterMs, startDelay = phase.silentStartDelayMs;
		if (!warnAfter) { return null; }
		if (last) { return last.time + warnAfter; }
		if (this.phaseStartTime != null && startDelay && cfg.silentStepDelayMs) {
			return this.phaseStartTime + startDelay - (cfg.silentStepDelayMs - warnAfter);
		}
		if (this.fightStartTime != null && this.phase == 0 && cfg.firstWarnAfterMs) {
			return this.fightStartTime + cfg.firstWarnAfterMs;
		}
		return null;
	};

	SpecTracker.prototype.cooledDown = function (key) {
		var t = this.now();
		var cooldown = this.config.triggerCooldownMs || 0;
		if (this.lastTrigger[key] != null && t - this.lastTrigger[key] < cooldown) { return false; }
		this.lastTrigger[key] = t;
		return true;
	};

	// Whether a trigger is new. Alt1's chat reader sometimes reports old lines again,
	// so with a timestamp a trigger counts once, and never if it's older than the
	// newest trigger already counted. Without a timestamp, fall back to a cooldown.
	SpecTracker.prototype.isNew = function (time, key) {
		if (time == null) { return this.cooledDown(key); }
		if (this.newestTime != null) {
			var diff = time - this.newestTime;
			if (diff < -12 * 3600) { diff += 24 * 3600; } // past midnight
			if (diff < 0) { return false; }
		}
		var id = time + "|" + key;
		if (this.seen[id]) { return false; }
		if (++this.seenCount > 500) { this.seen = {}; this.seenCount = 1; }
		this.seen[id] = true;
		this.newestTime = time;
		return true;
	};

	// Every boss special a line could be, as [{ boss, bossIndex, special }]. Some specials
	// share a chat line (3 Prayers and 5 Prayers), so a line can match more than one.
	SpecTracker.prototype.matchSpecials = function (line) {
		var bosses = this.config.bosses, matches = [];
		for (var b = 0; b < bosses.length; b++) {
			var lines = this.config.specialLines[bosses[b].id] || {};
			for (var special in lines) {
				if (matchesAny(line, lines[special])) {
					matches.push({ boss: bosses[b], bossIndex: b, special: special });
				}
			}
		}
		return matches;
	};

	// Feed a chat line. Returns a short description of what happened, or null if
	// the line wasn't a trigger.
	SpecTracker.prototype.handleLine = function (text) {
		var line = normalize(text);
		if (!line) { return null; }
		var cfg = this.config;
		var time = chatTime(text);

		if (matchesAny(line, cfg.resetLines)) {
			if (!this.isNew(time, "reset")) { return null; }
			// The other boss's new-kill line for the same kill (no special since the first).
			var start = this.fightStartTime;
			if (start != null && !this.lastUsed && this.now() - start < (cfg.resetWindowMs || 0)) { return null; }
			this.reset();
			this.fightStartTime = this.now();
			return "Fight started";
		}

		for (var p = 0; p < cfg.phases.length; p++) {
			if (p != this.phase && matchesAny(line, cfg.phases[p].phaseLines)) {
				if (!this.isNew(time, "phase" + p)) { return null; }
				this.setPhase(p);
				return "Entered " + this.currentPhase().name;
			}
		}

		if (matchesAny(line, cfg.nextPhaseLines)) {
			if (!this.isNew(time, "nextphase")) { return null; }
			this.nextPhase();
			return "Entered " + this.currentPhase().name;
		}

		var matches = this.matchSpecials(line);
		if (!matches.length) { return null; }
		var rotation = this.rotation();
		var inStep = function (s) {
			for (var m = 0; m < matches.length; m++) {
				if (options(rotation[s][matches[m].bossIndex]).indexOf(matches[m].special) != -1) { return matches[m]; }
			}
			return null;
		};

		// The other boss's half of the step that was just used (or the same line read twice).
		var step = -1, match = null, last = this.lastUsed;
		if (last && this.now() - last.time < (cfg.pairWindowMs || 0)) {
			match = inStep(last.index);
		}
		var paired = !!match;
		// Otherwise it's the first step from the predicted one that has this special.
		if (paired) {
			step = last.index;
		} else {
			for (var i = 0; i < rotation.length && !match; i++) {
				step = (this.nextSpecial + i) % rotation.length;
				match = inStep(step);
			}
		}
		// Not one of this phase's specials.
		if (!match) { return null; }

		var label = match.boss.name + ": " + match.special;
		if (time != null && !this.isNew(time, "special:" + match.boss.id + ":" + match.special)) { return null; }
		this.lastMatch = {
			bossIndex: match.bossIndex, special: match.special, step: step,
			random: Array.isArray(rotation[step][match.bossIndex]),
		};
		if (paired) { return label + " (same step)"; }
		this.specialUsed(step);
		return label;
	};

	SpecTracker.normalize = normalize;
	SpecTracker.options = options;
	SpecTracker.stepLabel = stepLabel;

	if (typeof module !== "undefined") { module.exports = SpecTracker; }
	else { root.SpecTracker = SpecTracker; }
})(this);
