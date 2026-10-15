/*
 * Boss configuration for Knights Spec Order.
 *
 * This is the only file you should need to edit to fill in the real boss data.
 *
 * Chat-line matching rules:
 *  - Matching is case-insensitive and ignores timestamps, punctuation and spaces,
 *    so "[12:34:56] Lady Ghrazi: You cannot escape!" matches "You cannot escape".
 *  - A pattern only needs to be a recognisable part of the line, it doesn't have
 *    to be the whole line. Use a chunk that is unique to that line. Including the
 *    speaker ("Lady Ghrazi: You cannot escape") makes it unique to that boss.
 *  - Every list below can hold several patterns (e.g. if the boss has more than one
 *    line for the same attack).
 */
var BOSS_CONFIG = {
	// The bosses whose special orders are tracked side by side. The `id` is used as
	// the key in each phase's `specials` below.
	bosses: [
		{ id: "lady", name: "Lady Ghrazi" },
		{ id: "lord", name: "Lord Ghrazi" },
	],

	// Optional: lines that mean a brand new fight has started (back to Phase 1, special 1).
	resetLines: [],

	// Optional: generic lines that mean "the bosses moved to the next phase".
	// Use this if the same thing is said at every phase change.
	// If each phase has its own line, use `phaseLines` on that phase instead.
	nextPhaseLines: [],

	phases: [
		{
			name: "Phase 1",
			// Lines that mean "the fight has just entered THIS phase".
			phaseLines: [],
			specials: {
				// `lines`: chat line(s) yelled when that special is USED.
				lady: [
					{ name: "Special 1", lines: [] },
					{ name: "Special 2", lines: [] },
					{ name: "Special 3", lines: [] },
				],
				lord: [
					{ name: "Special 1", lines: [] },
					{ name: "Special 2", lines: [] },
					{ name: "Special 3", lines: [] },
				],
			},
		},
		{
			name: "Phase 2",
			phaseLines: [],
			specials: {
				lady: [
					{ name: "Special 1", lines: [] },
					{ name: "Special 2", lines: [] },
					{ name: "Special 3", lines: [] },
				],
				lord: [
					{ name: "Special 1", lines: [] },
					{ name: "Special 2", lines: [] },
					{ name: "Special 3", lines: [] },
				],
			},
		},
		{
			name: "Phase 3",
			phaseLines: [],
			specials: {
				lady: [
					{ name: "Special 1", lines: [] },
					{ name: "Special 2", lines: [] },
					{ name: "Special 3", lines: [] },
				],
				lord: [
					{ name: "Special 1", lines: [] },
					{ name: "Special 2", lines: [] },
					{ name: "Special 3", lines: [] },
				],
			},
		},
		{
			name: "Phase 4",
			// Entering this phase always goes back to the first special.
			resetSpecials: true,
			phaseLines: [],
			specials: {
				lady: [
					{ name: "Special 1", lines: [] },
					{ name: "Special 2", lines: [] },
					{ name: "Special 3", lines: [] },
				],
				lord: [
					{ name: "Special 1", lines: [] },
					{ name: "Special 2", lines: [] },
					{ name: "Special 3", lines: [] },
				],
			},
		},
		{
			name: "Phase 5",
			phaseLines: [],
			specials: {},
		},
	],

	// Extra chat text colours to read, as [r, g, b]. Alt1 already reads the common
	// chat colours; only add one here if the boss lines aren't being picked up.
	extraChatColors: [],

	// The same trigger is ignored if it shows up again within this many milliseconds
	// (guards against the chat reader seeing one line twice).
	triggerCooldownMs: 2000,

	// How often the chatbox is read, in milliseconds (600 = one game tick).
	readIntervalMs: 600,
};

if (typeof module !== "undefined") { module.exports = BOSS_CONFIG; }
