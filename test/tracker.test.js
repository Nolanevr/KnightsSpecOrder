const test = require("node:test");
const assert = require("node:assert");
const SpecTracker = require("../tracker.js");
const shippedConfig = require("../config.js");

// The shipped boss data, with made-up chat lines so the specials can be triggered.
function makeConfig() {
	const cfg = structuredClone(shippedConfig);
	for (const boss of cfg.bosses) {
		for (const special in cfg.specialLines[boss.id]) {
			cfg.specialLines[boss.id][special] = [`${boss.name}: ${special}!`];
		}
	}
	cfg.phases.forEach((p, i) => { p.phaseLines = [`Entering phase ${i + 1}`]; });
	cfg.nextPhaseLines = ["You will not defeat us"];
	return cfg;
}

function makeTracker() {
	let time = 0;
	const tracker = new SpecTracker(makeConfig(), () => time);
	tracker.wait = ms => { time += ms; };
	// The chat timestamp for the current fake time, starting at 12:00:00.
	tracker.stamp = () => {
		const s = 12 * 3600 + Math.floor(time / 1000);
		const pad = n => String(n).padStart(2, "0");
		return `[${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}]`;
	};
	return tracker;
}

// Both bosses use their half of the next step, then some time passes.
function useStep(t, lady, lord) {
	if (lady) { t.handleLine(`${t.stamp()} Lady Ghrazi: ${lady}!`); }
	if (lord) { t.handleLine(`${t.stamp()} Lord Ghrazi: ${lord}!`); }
	t.wait(20000);
}

test("the real first-special lines advance phase 1 once", () => {
	const t = new SpecTracker(shippedConfig);
	assert.ok(t.handleLine("[21:08:31] Lady Karmina Ghrazi: SUFFER UNTO ME!"));
	assert.match(t.handleLine("[21:08:31] Lord Vasily Ghrazi: FALL IN LINE!"), /same step/);
	assert.strictEqual(t.nextSpecial, 1);
});

test("Lady's Dash line and Lord's partly-read line move phase 1 along", () => {
	let time = 0;
	const t = new SpecTracker(shippedConfig, () => time);
	t.handleLine("[21:27:04] Lady Karmina Ghrazi: SUFFER UNTO ME!");
	t.handleLine("[21:27:04] . ord Vasily '  hrazi: FALL IN LINE!");
	time += 15000;
	assert.ok(t.handleLine("[21:27:19] Lady Karmina Ghrazi: Nowhere is beyond"));
	assert.strictEqual(t.nextSpecial, 2);
});

test("the phase 1 lines from a real kill follow the order", () => {
	const t = new SpecTracker(shippedConfig);
	const log = [
		"[21:39:24] Lady Karmina Ghrazi: Just give in. Join us.",
		"[21:39:34] Lady Karmina Ghrazi: SUFFER UNTO ME!",
		"[21:39:34] . ord Vasily ''' .razi: FALL IN LINE!",
		"[21:39:49] Lady Karmina Ghrazi: Nowhere is beyond",
		"[21:39:49] . ord Vasily '  hrazi: Drown in Blood!",
	];
	log.forEach(l => t.handleLine(l));
	assert.strictEqual(t.nextSpecial, 2);
	t.handleLine("[21:40:03] . ord Vasily '  hrazi: BEAR THE CRIMSON");
	assert.strictEqual(t.nextSpecial, 0);
	t.handleLine("[21:40:03] Lady Karmina Ghrazi: Your blood becomes");
	assert.strictEqual(t.nextSpecial, 0);
});

test("PRAISE THE SANGUINE moves to phase 2 and the order carries on", () => {
	const t = new SpecTracker(shippedConfig);
	t.handleLine("[21:40:18] Lady Karmina Ghrazi: SUFFER UNTO ME!");
	t.handleLine("[21:40:25] Lady Karmina Ghrazi: PRAISE THE SANGUINE");
	t.handleLine("[21:40:25] . ord Vasily '  hrazi: PRAISE THE SANGUINE!");
	assert.strictEqual(t.phase, 1);
	assert.strictEqual(t.nextSpecial, 1);
	t.handleLine("[21:40:33] . ord Vasily '  hrazi: Your mind betrays you!");
	assert.strictEqual(t.nextSpecial, 2);
	t.handleLine("[21:40:48] . ord Vasily '  hrazi: Drown in Blood!");
	assert.strictEqual(t.nextSpecial, 0);
});

test("old chat lines read again (e.g. after scrolling) don't count twice", () => {
	const t = new SpecTracker(shippedConfig);
	t.handleLine("[21:39:24] Lady Karmina Ghrazi: Just give in. Join us.");
	t.handleLine("[21:39:34] Lady Karmina Ghrazi: SUFFER UNTO ME!");
	t.handleLine("[21:39:49] Lady Karmina Ghrazi: Nowhere is beyond");
	assert.strictEqual(t.handleLine("[21:39:24] Lady Karmina Ghrazi: Just give in. Join us."), null);
	assert.strictEqual(t.handleLine("[21:39:34] Lady Karmina Ghrazi: SUFFER UNTO ME!"), null);
	assert.strictEqual(t.nextSpecial, 2);
});

test("a new kill with a newer timestamp still restarts", () => {
	const t = new SpecTracker(shippedConfig);
	t.handleLine("[21:39:24] Lady Karmina Ghrazi: Just give in. Join us.");
	t.handleLine("[21:39:34] Lady Karmina Ghrazi: SUFFER UNTO ME!");
	assert.ok(t.handleLine("[21:45:10] Lady Karmina Ghrazi: Just give in. Join us."));
	assert.strictEqual(t.nextSpecial, 0);
});

test("timestamps keep working past midnight", () => {
	const t = new SpecTracker(shippedConfig);
	t.handleLine("[23:59:55] Lady Karmina Ghrazi: SUFFER UNTO ME!");
	assert.ok(t.handleLine("[00:00:10] Lady Karmina Ghrazi: Nowhere is beyond"));
	assert.strictEqual(t.nextSpecial, 2);
});

test("starts at phase 1 with the first special next", () => {
	const t = makeTracker();
	assert.strictEqual(t.phase, 0);
	assert.strictEqual(t.nextSpecial, 0);
});

test("both bosses' lines for one step advance the order once", () => {
	const t = makeTracker();
	assert.ok(t.handleLine("Lady Ghrazi: 3 Prayers!"));
	assert.strictEqual(t.nextSpecial, 1);
	assert.match(t.handleLine("Lord Ghrazi: 3 Prayers!"), /same step/);
	assert.strictEqual(t.nextSpecial, 1);
});

test("the phase 1 order advances and repeats", () => {
	const t = makeTracker();
	useStep(t, "3 Prayers", "3 Prayers");
	useStep(t, "Dash", "Blood Waves");
	assert.strictEqual(t.nextSpecial, 2);
	useStep(t, "Magic Bleed", "Meatball");
	assert.strictEqual(t.nextSpecial, 0);
});

test("either boss's line alone advances the order (phase 3)", () => {
	const t = makeTracker();
	t.setPhase(2);
	useStep(t, null, "3 Prayers");
	useStep(t, "Dash", null);
	assert.strictEqual(t.nextSpecial, 2);
	useStep(t, null, "Blood Diamond");
	assert.strictEqual(t.nextSpecial, 0);
});

test("a missed special is corrected by the next recognised one", () => {
	const t = makeTracker();
	useStep(t, null, "Meatball");
	assert.strictEqual(t.nextSpecial, 0);
});

test("the order carries over into the next phase", () => {
	const t = makeTracker();
	useStep(t, "3 Prayers", "3 Prayers");
	useStep(t, "Dash", "Blood Waves");
	t.handleLine("Entering phase 2");
	assert.strictEqual(t.phase, 1);
	assert.strictEqual(t.nextSpecial, 2);
	useStep(t, "Magic Bleed", "Blood Waves");
	assert.strictEqual(t.nextSpecial, 0);
});

test("generic next-phase lines move one phase forward", () => {
	const t = makeTracker();
	t.handleLine("Lord Ghrazi: You will not defeat us!");
	assert.strictEqual(t.phase, 1);
	t.wait(5000);
	t.handleLine("Lord Ghrazi: You will not defeat us!");
	assert.strictEqual(t.phase, 2);
});

test("phase 4 always resets to the first special", () => {
	const t = makeTracker();
	t.setPhase(2);
	useStep(t, "3 Prayers", null);
	t.handleLine("Entering phase 4");
	assert.strictEqual(t.phase, 3);
	assert.strictEqual(t.nextSpecial, 0);
});

test("specials that repeat within phase 4 don't double-advance", () => {
	const t = makeTracker();
	t.setPhase(3);
	useStep(t, "Magic Bleed", "Blue Bar");
	useStep(t, "5 Prayers", "5 Prayers");
	assert.strictEqual(t.nextSpecial, 2);
	useStep(t, "Dash", "Blood Waves");
	useStep(t, "Magic Bleed", "Meatball");
	assert.strictEqual(t.nextSpecial, 4);
	useStep(t, "5 Prayers", "5 Prayers");
	useStep(t, "Dash", "Blood Waves");
	assert.strictEqual(t.nextSpecial, 0);
});

test("phase 5 carries on from where phase 4 was", () => {
	const t = makeTracker();
	t.setPhase(3);
	useStep(t, "Magic Bleed", "Blue Bar");
	useStep(t, "5 Prayers", "5 Prayers");
	useStep(t, "Dash", "Blood Waves");
	t.handleLine("Entering phase 5");
	assert.strictEqual(t.phase, 4);
	assert.strictEqual(t.nextSpecial, 3);
	useStep(t, "Magic Bleed", "Blue Bar");
	useStep(t, "5 Prayers", "5 Prayers");
	useStep(t, "Dash", "Meatball");
	assert.strictEqual(t.nextSpecial, 0);
});

test("specials that aren't in the current phase are ignored", () => {
	const t = makeTracker();
	assert.strictEqual(t.handleLine("Lord Ghrazi: Mind Flay!"), null);
	assert.strictEqual(t.nextSpecial, 0);
});

test("matching tolerates case, punctuation and common OCR confusions", () => {
	const t = makeTracker();
	assert.ok(t.handleLine("[12:00:01] LADY GHRAZl 3 PRAYERS"));
});

test("Lady's new-kill line starts a new fight", () => {
	const t = makeTracker();
	useStep(t, "3 Prayers", "3 Prayers");
	t.setPhase(4);
	t.handleLine("Lady Karmina Ghrazi: Just give in. Join us.");
	assert.strictEqual(t.phase, 0);
	assert.strictEqual(t.nextSpecial, 0);
});

test("the shipped config is well formed", () => {
	const cfg = shippedConfig;
	assert.strictEqual(cfg.phases.length, 5);
	assert.ok(cfg.phases[3].resetSpecials);
	for (const phase of cfg.phases) {
		for (const step of phase.rotation) {
			assert.strictEqual(step.length, cfg.bosses.length, phase.name);
			step.forEach((special, b) => assert.ok(special in cfg.specialLines[cfg.bosses[b].id], `${phase.name}: ${special}`));
		}
	}
	new SpecTracker(cfg).handleLine("anything");
});
