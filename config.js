/*
 * Boss configuration for Knights Spec Order.
 *
 * This is the only file you should need to edit to fill in the real boss data.
 *
 * Chat-line matching rules:
 *  - Matching is case-insensitive and ignores timestamps, punctuation and spaces,
 *    so "[12:34:56] Lady Karmina Ghrazi: You cannot escape!" matches "You cannot escape".
 *  - A pattern only needs to be a recognisable part of the line, it doesn't have
 *    to be the whole line. Use a chunk that is unique to that line.
 *  - Leave the speaker's name out of patterns: it's drawn in a dark colour that is
 *    harder for Alt1 to read than the message itself.
 *  - Every list below can hold several patterns (e.g. if a boss has more than one
 *    line for the same attack).
 */
var BOSS_CONFIG = {
	// The two bosses, in the order used by the `rotation` pairs below.
	bosses: [
		{ id: "lady", name: "Lady Ghrazi", color: "#ff4a4a" }, // melee
		{ id: "lord", name: "Lord Ghrazi", color: "#4a9bff" }, // magic
	],

	// What each boss yells when it uses a special. Fill in the chat lines here once;
	// they are used in every phase the special appears in.
	specialLines: {
		lady: {
			"3 Prayers": [],
			"5 Prayers": [],
			"Dash": [],
			"Magic Bleed": [],
		},
		lord: {
			"3 Prayers": [],
			"5 Prayers": [],
			"Blood Waves": [],
			"Meatball": [],
			"Mind Flay": [],
			"Blood Diamond": [],
			"Blue Bar": [],
		},
	},

	// Lines that mean a new kill has started (back to Phase 1, first special).
	resetLines: [
		"Just give in. Join us", // Lady Karmina Ghrazi
	],

	// Optional: generic lines that mean "the fight moved to the next phase".
	// Use this if the same thing is said at every phase change.
	// If each phase has its own line, use `phaseLines` on that phase instead.
	nextPhaseLines: [],

	// Each phase's special order. Every entry is [Lady's special, Lord's special],
	// used at the same time. The order repeats once it reaches the end.
	phases: [
		{
			name: "Phase 1",
			// Lines that mean "the fight has just entered THIS phase".
			phaseLines: [],
			rotation: [
				["3 Prayers", "3 Prayers"],
				["Dash", "Blood Waves"],
				["Magic Bleed", "Meatball"],
			],
		},
		{
			name: "Phase 2",
			phaseLines: [],
			rotation: [
				["3 Prayers", "3 Prayers"],
				["Dash", "Mind Flay"],
				["Magic Bleed", "Blood Waves"],
			],
		},
		{
			// Only one of the two bosses is attacking here; either one's line advances the order.
			name: "Phase 3",
			phaseLines: [],
			rotation: [
				["3 Prayers", "3 Prayers"],
				["Dash", "Blood Waves"],
				["Magic Bleed", "Blood Diamond"],
			],
		},
		{
			name: "Phase 4",
			// Entering this phase always goes back to the first special.
			resetSpecials: true,
			phaseLines: [],
			rotation: [
				["Magic Bleed", "Blue Bar"],
				["5 Prayers", "5 Prayers"],
				["Dash", "Blood Waves"],
				["Magic Bleed", "Meatball"],
				["5 Prayers", "5 Prayers"],
				["Dash", "Blood Waves"],
			],
		},
		{
			// Carries on from wherever Phase 4 was.
			name: "Phase 5",
			phaseLines: [],
			rotation: [
				["Magic Bleed", "Blue Bar"],
				["5 Prayers", "5 Prayers"],
				["Dash", "Blood Waves"],
				["Magic Bleed", "Blue Bar"],
				["5 Prayers", "5 Prayers"],
				["Dash", "Meatball"],
			],
		},
	],

	// Lady's and Lord's lines for the same special come in together. A line that
	// matches the special that was just used within this many milliseconds is
	// treated as the other half of that special instead of the next one.
	pairWindowMs: 6000,

	// Extra chat text colours to read, as [r, g, b]. Alt1 already reads the common
	// chat colours; only add one here if the boss lines aren't being picked up.
	extraChatColors: [
		[148, 245, 147], // boss dialogue text (light green)
		[127, 19, 55], // "Lady Karmina Ghrazi" speaker name (dark magenta)
	],

	// The same phase/reset trigger is ignored if it shows up again within this many
	// milliseconds (guards against the chat reader seeing one line twice).
	triggerCooldownMs: 2000,

	// How often the chatbox is read, in milliseconds (600 = one game tick).
	readIntervalMs: 600,
};

if (typeof module !== "undefined") { module.exports = BOSS_CONFIG; }
