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

test("the shared prayer lines count as 5 Prayers in phases 4 and 5", () => {
	let time = 0;
	const t = new SpecTracker(shippedConfig, () => time);
	t.setPhase(3);
	t.handleLine("[22:00:00] Lady Karmina Ghrazi: Your blood becomes tribute!");
	assert.strictEqual(t.nextSpecial, 1);
	time += 15000;
	assert.match(t.handleLine("[22:00:15] Lady Karmina Ghrazi: SUFFER UNTO ME!"), /5 Prayers/);
	assert.match(t.handleLine("[22:00:15] . ord Vasily '  hrazi: FALL IN LINE!"), /same step/);
	assert.strictEqual(t.nextSpecial, 2);
	time += 30000;
	t.handleLine("[22:00:45] Lady Karmina Ghrazi: Your blood becomes tribute!");
	time += 15000;
	t.handleLine("[22:01:00] . ord Vasily '  hrazi: FALL IN LINE!");
	assert.strictEqual(t.nextSpecial, 5);
});

test("Blood Diamond only counts in phase 3", () => {
	const t = new SpecTracker(shippedConfig);
	assert.strictEqual(t.handleLine("[22:00:00] . ord Vasily '  hrazi: LET THE SANGUINE ENGULF YOU"), null);
	t.setPhase(2);
	assert.ok(t.handleLine("[22:00:05] . ord Vasily '  hrazi: LET THE SANGUINE ENGULF YOU"));
	assert.strictEqual(t.nextSpecial, 0);
});

test("one boss's line on its own is enough, whichever boss it is", () => {
	let time = 0;
	const t = new SpecTracker(shippedConfig, () => time);
	t.handleLine("[22:00:00] Lady Karmina Ghrazi: SUFFER UNTO ME!");
	assert.strictEqual(t.nextSpecial, 1);
	time += 15000;
	t.handleLine("[22:00:15] . ord Vasily '  hrazi: Drown in Blood!");
	assert.strictEqual(t.nextSpecial, 2);
	time += 15000;
	t.handleLine("[22:00:30] Lady Karmina Ghrazi: Your blood becomes tribute!");
	assert.strictEqual(t.nextSpecial, 0);
	time += 15000;
	t.handleLine("[22:00:45] . ord Vasily '  hrazi: FALL IN LINE!");
	assert.strictEqual(t.nextSpecial, 1);
});

test("phase 4 carries on after the silent Blue Bar step", () => {
	let time = 0;
	const t = new SpecTracker(shippedConfig, () => time);
	t.setPhase(3);
	assert.strictEqual(t.nextSpecial, 0); // Magic Bleed + Blue Bar, no line from Lord
	time += 15000;
	t.handleLine("[22:00:15] Lady Karmina Ghrazi: SUFFER UNTO ME!");
	assert.strictEqual(t.nextSpecial, 2); // 5 Prayers was step 2, so Dash + Blood Waves is next
});

test("the silent Blue Bar step is assumed used when its time passes (Lord's tank)", () => {
	let time = 0;
	const t = new SpecTracker(shippedConfig, () => time);
	t.setPhase(3);
	t.setNextSpecial(5);
	t.handleLine("[22:00:00] . ord Vasily '  hrazi: Drown in Blood!"); // step 6
	assert.strictEqual(t.nextSpecial, 0); // step 1: Magic Bleed + Blue Bar, no line for Lord's tank
	time += 13000; // Blue Bar is 20 ticks (12s) after the previous special
	assert.strictEqual(t.tick(), null);
	time += 1000;
	assert.match(t.tick(), /Step 1/);
	assert.strictEqual(t.nextSpecial, 1);
	time += 15000;
	t.handleLine("[22:00:30] . ord Vasily '  hrazi: FALL IN LINE!"); // step 2
	assert.strictEqual(t.nextSpecial, 2);
});

test("Lady's line for the Blue Bar step still counts once for her tank", () => {
	let time = 0;
	const t = new SpecTracker(shippedConfig, () => time);
	t.setPhase(4);
	t.setNextSpecial(2);
	t.handleLine("[22:00:00] Lady Karmina Ghrazi: Nowhere is beyond our reach!"); // step 3
	time += 12000;
	t.handleLine("[22:00:12] Lady Karmina Ghrazi: Your blood becomes tribute!"); // step 4
	assert.strictEqual(t.nextSpecial, 4);
	time += 20000;
	assert.strictEqual(t.tick(), null); // step 5 has lines, so no guessing
	assert.strictEqual(t.nextSpecial, 4);
});

test("a silent step whose line arrives just after the guess isn't counted twice", () => {
	let time = 0;
	const t = new SpecTracker(shippedConfig, () => time);
	t.setPhase(4);
	t.setNextSpecial(2);
	t.handleLine("[22:00:00] . ord Vasily '  hrazi: BEAR THE CRIMSON MARK!"); // step 3, Dash + Meatball
	time += 14000;
	assert.ok(t.tick()); // step 4 (Magic Bleed + Blue Bar) assumed
	assert.strictEqual(t.nextSpecial, 4);
	time += 500;
	assert.match(t.handleLine("[22:00:14] Lady Karmina Ghrazi: Your blood becomes tribute!"), /same step/);
	assert.strictEqual(t.nextSpecial, 4);
});

test("phase 4's silent first step is assumed used 22 ticks after the phase starts", () => {
	let time = 0;
	const t = new SpecTracker(shippedConfig, () => time);
	t.setPhase(2);
	t.handleLine("[22:00:00] . ord Vasily '  hrazi: FALL IN LINE!");
	time += 5000;
	t.setPhase(3); // marker turns to Phase 4
	assert.strictEqual(t.nextSpecial, 0);
	time += 14500; // 22 ticks is 13.2s, plus grace
	assert.strictEqual(t.tick(), null);
	time += 600;
	assert.match(t.tick(), /Step 1/);
	assert.strictEqual(t.nextSpecial, 1);
	time += 12000;
	t.handleLine("[22:00:32] . ord Vasily '  hrazi: FALL IN LINE!"); // step 2, 5 Prayers
	assert.strictEqual(t.nextSpecial, 2);
});

test("Lady's line at the start of phase 4 beats the timer", () => {
	let time = 0;
	const t = new SpecTracker(shippedConfig, () => time);
	t.setPhase(3);
	time += 13200;
	t.handleLine("[22:00:13] Lady Karmina Ghrazi: Your blood becomes tribute!");
	assert.strictEqual(t.nextSpecial, 1);
	time += 3000;
	assert.strictEqual(t.tick(), null);
	assert.strictEqual(t.nextSpecial, 1);
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
	useStep(t, "Dash", "Blood Waves");
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
