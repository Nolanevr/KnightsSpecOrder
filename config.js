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
	// In game they are "Lady Karmina Ghrazi" and "Lord Vasily Ghrazi".
	bosses: [
		// alsoShow: the other boss's specials that also matter to this boss's tank, shown
		// next to this boss's special when only this boss is shown.
		{ id: "lady", name: "Lady Ghrazi", color: "#ff4a4a", alsoShow: ["Meatball", "Blue Bar"] }, // melee
		{ id: "lord", name: "Lord Ghrazi", color: "#4a9bff" }, // magic
	],

	// What each boss yells when it uses a special. Fill in the chat lines here once;
	// they are used in every phase the special appears in.
	specialLines: {
		lady: {
			"3 Prayers": ["SUFFER UNTO ME"],
			"5 Prayers": ["SUFFER UNTO ME"], // same line as 3 Prayers
			"Dash": ["Nowhere is beyond"],
			"Magic Bleed": ["Your blood becomes"],
		},
		lord: {
			"3 Prayers": ["FALL IN LINE"],
			"5 Prayers": ["FALL IN LINE"], // same line as 3 Prayers
			"Blood Waves": ["Drown in Blood"],
			"Meatball": ["BEAR THE CRIMSON"],
			"Mind Flay": ["Your mind betrays you"],
			"Blood Diamond": ["LET THE SANGUINE ENGULF YOU"],
			"Blue Bar": [], // no chat line: it just happens (first special of phase 4)
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
	// used at the same time. The order repeats once it reaches the end. A list of
	// specials in place of one means the boss uses one of them at random.
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
			phaseLines: ["PRAISE THE SANGUINE"], // said by both Lady and Lord
			rotation: [
				["3 Prayers", "3 Prayers"],
				["Dash", "Mind Flay"],
				["Magic Bleed", "Blood Waves"],
			],
		},
		{
			// Only one of the two bosses is attacking here; either one's line advances the order.
			name: "Phase 3",
			// It's random which boss you end up with, so show both even in a one-boss view.
			alwaysShowBoth: true,
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
			// The first special (Magic Bleed + Blue Bar, silent for Lord's tank) happens 22
			// game ticks after the phase marker turns to Phase 4.
			silentStartDelayMs: 22 * 600,
			// After that, Blue Bar comes 24 ticks after the previous special.
			silentStepDelayMs: 24 * 600,
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
			// Only 3 auto-attacks between specials, so the next one shows sooner: 14 ticks.
			warnAfterMs: 14 * 600,
			phaseLines: [],
			rotation: [
				["Magic Bleed", "Blue Bar"],
				["5 Prayers", "5 Prayers"],
				// Lord picks one of these at random; it shows on screen when he says it.
				["Dash", ["Blood Waves", "Blood Diamond", "Meatball"]],
			],
		},
	],

	// Lady's and Lord's lines for the same special come in together. A line that
	// matches the special that was just used within this many milliseconds is
	// treated as the other half of that special instead of the next one.
	pairWindowMs: 6000,

	// A step with no chat line for this player (Blue Bar, with Lady's half only shown to
	// her tank) happens 20 game ticks (12 seconds) after the previous special (a phase
	// can set its own silentStepDelayMs). It's assumed used once that, plus a few ticks
	// of grace, has passed without a line.
	silentStepDelayMs: 20 * 600,
	silentStepGraceMs: 3 * 600,

	// The next step's specials appear on screen this long after the previous special (18
	// ticks; a phase can set its own warnAfterMs), and stay until it's used or for
	// warningMs. The first special of a kill appears firstWarnAfterMs after Lady's
	// new-kill line.
	warnAfterMs: 18 * 600,
	warningMs: 5000,
	firstWarnAfterMs: 10 * 1000,
	// When a special's chat line comes in, its step's specials show for flashMs.
	// Both are drawn one line per boss in the boss's colour, centred and starting this
	// fraction of the game window's height below its middle, where your character is
	// (about 4 tiles below them), in bold.
	flashMs: 3000,
	flashBelow: 0.1,
	flashTextSize: 40,
	flashBold: true,

	// Extra chat text colours to read, as [r, g, b]. Alt1 already reads the common
	// chat colours; only add one here if the boss lines aren't being picked up.
	// The colours in screenshots are ~4% darker than RuneScape's standard chat colours,
	// so both the screenshot colour and the brighter estimate are listed.
	extraChatColors: [
		[148, 245, 147], [153, 255, 153], // boss dialogue text (light green)
		[127, 19, 55], [132, 20, 57], // "Lady Karmina Ghrazi" speaker name (dark magenta)
		[106, 84, 130], [110, 87, 135], // "Lord Vasily Ghrazi" speaker name (purple)
		[226, 46, 46], [235, 48, 48], // red game messages (e.g. familiar warnings)
	],

	// For chat lines without a timestamp: the same phase/reset trigger is ignored if it
	// shows up again within this many milliseconds (guards against the chat reader
	// seeing one line twice). Lines with a timestamp are only ever counted once.
	triggerCooldownMs: 2000,

	// How often the chatbox is read, in milliseconds (600 = one game tick).
	readIntervalMs: 600,
};

if (typeof module !== "undefined") { module.exports = BOSS_CONFIG; }
