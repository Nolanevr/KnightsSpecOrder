const test = require("node:test");
const assert = require("node:assert");
const SpecTracker = require("../tracker.js");

function makeConfig() {
	const specials = (who, n) => [1, 2, 3].map(s => ({ name: `P${n} Spec ${s}`, lines: [`${who}: Phase ${n} special ${s}!`] }));
	const phase = (n, extra) => Object.assign({
		name: "Phase " + n,
		phaseLines: ["Entering phase " + n],
		specials: { lady: specials("Lady Ghrazi", n), lord: specials("Lord Ghrazi", n) },
	}, extra);
	return {
		bosses: [{ id: "lady", name: "Lady Ghrazi" }, { id: "lord", name: "Lord Ghrazi" }],
		resetLines: ["Who dares challenge"],
		nextPhaseLines: ["You will not defeat us"],
		phases: [phase(1), phase(2), phase(3), phase(4, { resetSpecials: true }), { name: "Phase 5", phaseLines: ["Entering phase 5"], specials: {} }],
		triggerCooldownMs: 2000,
	};
}

function makeTracker() {
	let time = 0;
	const tracker = new SpecTracker(makeConfig(), () => time);
	tracker.advanceTime = ms => { time += ms; };
	return tracker;
}

test("starts at phase 1 with the first special next for both bosses", () => {
	const t = makeTracker();
	assert.strictEqual(t.phase, 0);
	assert.deepStrictEqual(t.nextSpecial, { lady: 0, lord: 0 });
});

test("special chat lines advance that boss's next special and wrap around", () => {
	const t = makeTracker();
	assert.ok(t.handleLine("[12:00:01] Lady Ghrazi: Phase 1 special 1!"));
	assert.deepStrictEqual(t.nextSpecial, { lady: 1, lord: 0 });
	t.advanceTime(5000);
	t.handleLine("[12:00:06] Lady Ghrazi: Phase 1 special 2!");
	t.advanceTime(5000);
	t.handleLine("[12:00:11] Lady Ghrazi: Phase 1 special 3!");
	assert.strictEqual(t.nextSpecial.lady, 0);
});

test("the two bosses advance independently", () => {
	const t = makeTracker();
	t.handleLine("Lady Ghrazi: Phase 1 special 1!");
	t.handleLine("Lord Ghrazi: Phase 1 special 1!");
	t.advanceTime(5000);
	t.handleLine("Lord Ghrazi: Phase 1 special 2!");
	assert.deepStrictEqual(t.nextSpecial, { lady: 1, lord: 2 });
});

test("a special that was missed is corrected by the next recognised one", () => {
	const t = makeTracker();
	t.handleLine("Lord Ghrazi: Phase 1 special 2!");
	assert.strictEqual(t.nextSpecial.lord, 2);
});

test("the special order carries over into the next phase", () => {
	const t = makeTracker();
	t.handleLine("Lady Ghrazi: Phase 1 special 1!");
	t.advanceTime(5000);
	t.handleLine("Lady Ghrazi: Phase 1 special 2!");
	t.handleLine("Lord Ghrazi: Phase 1 special 1!");
	t.handleLine("Entering phase 2");
	assert.strictEqual(t.phase, 1);
	assert.deepStrictEqual(t.nextSpecial, { lady: 2, lord: 1 });
});

test("generic next-phase lines move one phase forward", () => {
	const t = makeTracker();
	t.handleLine("Lord Ghrazi: You will not defeat us!");
	assert.strictEqual(t.phase, 1);
	t.advanceTime(5000);
	t.handleLine("Lord Ghrazi: You will not defeat us!");
	assert.strictEqual(t.phase, 2);
});

test("phase 4 always resets both bosses to the first special", () => {
	const t = makeTracker();
	t.setPhase(2);
	t.handleLine("Lady Ghrazi: Phase 3 special 1!");
	t.handleLine("Lord Ghrazi: Phase 3 special 2!");
	t.handleLine("Entering phase 4");
	assert.strictEqual(t.phase, 3);
	assert.deepStrictEqual(t.nextSpecial, { lady: 0, lord: 0 });
});

test("specials from other phases are ignored", () => {
	const t = makeTracker();
	assert.strictEqual(t.handleLine("Lady Ghrazi: Phase 2 special 1!"), null);
	assert.strictEqual(t.nextSpecial.lady, 0);
});

test("the same line read twice in quick succession only counts once", () => {
	const t = makeTracker();
	t.handleLine("Lady Ghrazi: Phase 1 special 1!");
	t.advanceTime(600);
	assert.strictEqual(t.handleLine("Lady Ghrazi: Phase 1 special 1!"), null);
	assert.strictEqual(t.nextSpecial.lady, 1);
});

test("matching tolerates case, punctuation and common OCR confusions", () => {
	const t = makeTracker();
	assert.ok(t.handleLine("[12:00:01] LADY GHRAZl: PHASE l SPECIAL 1"));
});

test("reset line starts a new fight", () => {
	const t = makeTracker();
	t.handleLine("Lady Ghrazi: Phase 1 special 1!");
	t.setPhase(4);
	t.handleLine("Lady Ghrazi: Who dares challenge us?");
	assert.strictEqual(t.phase, 0);
	assert.deepStrictEqual(t.nextSpecial, { lady: 0, lord: 0 });
});

test("phase 5 has no specials and ignores special triggers", () => {
	const t = makeTracker();
	t.setPhase(4);
	assert.strictEqual(t.specials("lady").length, 0);
	t.specialUsed("lady");
	assert.strictEqual(t.handleLine("Lady Ghrazi: Phase 4 special 1!"), null);
});

test("the shipped config is well formed", () => {
	const cfg = require("../config.js");
	assert.strictEqual(cfg.phases.length, 5);
	cfg.phases.slice(0, 4).forEach(p => cfg.bosses.forEach(b => assert.strictEqual(p.specials[b.id].length, 3)));
	assert.ok(cfg.phases[3].resetSpecials);
	new SpecTracker(cfg).handleLine("anything");
});
