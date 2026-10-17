# KnightsSpecOrder

An [Alt1 Toolkit](https://runeapps.org/alt1) app that reads the RuneScape chatbox and shows which special attacks Lady Ghrazi and Lord Ghrazi will use next.

There is also a [Bolt plugin](#bolt-plugin-rapid-attack-prayers) that shows which protection prayers to use for the Rapid Attack droplets coming at you.

- Phase 4 has 6 steps. The ⚙ options pick how they're shown: **Ultra compact** (the default: 6 half-height rows in the space of 3, so the window stays the same size in every phase), **Side by side** (steps 1–3 and 4–6 next to each other, also 3 rows high) or **Standard** (6 full-size rows; the window needs to be taller).
- Shows the current phase's special order. Each row is one step: Lady's special (melee, red header) and Lord's special (magic, blue header), used at the same time. The next step is highlighted in green.
- About 10 seconds after each special (6 in phase 5), the next one appears in large writing in the middle of the screen, above your character: Lady's in red, Lord's in blue underneath. When its chat line comes in, it flashes. See [Flash](#flash).
- When either boss yells a special's chat line, the highlight moves to the next step. Lady's and Lord's lines for the same step count once, and in phase 3 a line from just one of them is enough.
- When a phase-change line is yelled, the panel switches to the next phase and the order **carries over**: if 2 steps were used in phase 1, step 3 is next in phase 2.
- Entering **phase 4** always resets to step 1. Phase 5 carries on from wherever phase 4 was.
- In phase 5, Lord's third special is a random one of Blood Waves, Blood Diamond and Mind Flay. The panel shows it as **Random**; when he says its line, the app counts it and flashes which one it is (e.g. **MIND FLAY**).
- Blue Bar has no chat line, and Lady's lines only show for her tank, so for Lord's tank the Magic Bleed + Blue Bar steps (phase 4 step 1, phase 5 step 1) are silent. Blue Bar comes 20 game ticks (12 seconds) after the previous special, and phase 4's first one comes 22 ticks after the marker turns to Phase 4, so once that has passed (plus 3 ticks of grace) without a line, the app assumes it happened and moves on.
- When Lady Karmina Ghrazi says "Just give in. Join us." a new kill has started, and the panel goes back to phase 1, step 1.
- Phase changes are also read from the boss bar's **"Phase: N"** box on screen (phase 3 has no chat line). See [Phase marker](#phase-marker).

| Phase | Order (Lady + Lord) |
| --- | --- |
| 1 | 3 Prayers + 3 Prayers → Dash + Blood Waves → Magic Bleed + Meatball |
| 2 | 3 Prayers + 3 Prayers → Dash + Mind Flay → Magic Bleed + Blood Waves |
| 3 | 3 Prayers + 3 Prayers → Dash + Blood Waves → Magic Bleed + Blood Diamond |
| 4 | Magic Bleed + Blue Bar → 5 Prayers + 5 Prayers → Dash + Blood Waves → Magic Bleed + Meatball → 5 Prayers + 5 Prayers → Dash + Blood Waves |
| 5 | Magic Bleed + Blue Bar → 5 Prayers + 5 Prayers → Dash + Random (Blood Waves, Blood Diamond or Mind Flay) |

## Installing in Alt1

The app is a static web page, so it has to be hosted somewhere Alt1 can load it. GitHub Pages works:

1. In the repository settings, go to **Pages** and deploy from the branch the app is on (root folder).
2. In your browser, open
   `alt1://addapp/https://<your-github-username>.github.io/KnightsSpecOrder/appconfig.json`
   (or paste the `appconfig.json` URL into Alt1's browser and click **Add app**).
3. Accept the **pixel** and **overlay** permissions.

## Using it

- Keep the chatbox where the boss's lines appear visible. When the app finds the chatbox it briefly outlines it in green.
- **⚙** opens the options (remembered between sessions):
  - **Show: Both / Lady / Lord**: both bosses' specials or only one boss's. Detection always uses both bosses' lines, and phase 3 always shows both because it's random which boss you end up with. With **Lady** shown, Lord's Meatball and Blue Bar are still shown (in blue, next to Lady's special in the same step), since they matter to Lady's tank too.
  - **6 specials: Standard / Side by side / Ultra compact**: how phase 4 is shown (see above).
  - **Boss names: Show / Hide, colour the text**: hide the boss names over the columns and colour each special in its boss's colour instead (red for Lady, blue for Lord).
  - **Flash specials on screen**: show each special shortly before it, and flash it when its chat line comes in (on by default).
  - **Hide buttons, status and tools**: a compact view with just the phase and the specials.
  - **Rename bosses and specials…**: type your own name for either boss or any special (per boss); leave a box empty to keep the original name. Only the display changes; the chat lines still match as before.
- **◀ / ▶** change phase by hand. **Click a row** to make it the next step. **Reset** goes back to phase 1, step 1. **Find chat** locates the chatbox again if you moved it.
- **Tools** (at the bottom):
  - **Chatbox**: pick which chatbox to read, if you have more than one.
  - **Show all chat lines read**: logs every line Alt1 reads. Use this to check that the boss's lines are being read correctly.
  - **Copy log** / **Clear log**: copy the whole log (oldest line first) to paste it somewhere, or empty it before a kill.
  - **Simulate a chat line**: type a line to test the config without being at the boss. This also works in a normal browser.

## Bolt plugin: Rapid Attack prayers

[`bolt/`](bolt) is a separate plugin for the [Bolt launcher](https://bolt.adamcake.com) that shows which protection prayers to use for the Rapid Attack ("3 Prayers" / "5 Prayers" above: "FALL IN LINE!" / "SUFFER UNTO ME!"). Each knight throws 3 droplets (5 from phase 4) at the player holding the *other* knight's aggression, one every 2 ticks: **red is Melee, green is Ranged, blue is Magic**. Depending on how close or far the player is, the droplets either fall down on them or fly at them, so both players get droplets, in different orders.

The plugin watches the droplet models as the game draws them and only counts the ones coming at **you**:

- a droplet above or next to you (within 1.5 tiles sideways) is falling on you;
- a droplet moving sideways on a path that passes next to you is flying at you;
- the rest (falling on or flying at your partner) are ignored.

Your droplets are listed in the order they'll hit (worked out from each one's distance and speed), e.g. **Ranged → Melee → Magic**, with the next one outlined in yellow and the ones that have hit you crossed out. If you hold both knights' aggression, both sets are merged into one list. The order stays on screen for a few seconds after the last hit, and the next attack starts a new list.

### Installing

1. Download this repository (Code → Download ZIP) and unzip it.
2. In Bolt, open the plugin menu, add a plugin from a file and pick `bolt/bolt.json`.
3. Start the plugin. A small "Rapid Attack" panel appears in the game window: drag it by its title and resize it from the bottom-right corner.

### First time: teach it the droplets (Learn)

Bolt can't see what a model is, only its shape and colours, so the plugin needs to be told which models are the droplets. You only do this once:

1. At the boss, press **Learn** just before a Rapid Attack, with the droplets on screen.
2. After the attack, the panel lists the small red, green and blue models that came and went, likeliest first. The droplets should be near the top: seen a few times, brief, often disappearing next to you ("Near you"), each lasting about a second. All three colours may be the same model.
3. Tick the droplet models and press **Learn** again to stop. The picks are saved. To share them, they can also be put in `dropletVertexCounts` in [`bolt/config.lua`](bolt/config.lua).

Turn on **Markers** to check what it sees: a large square with a white border over each droplet coming at you, a small faded one over droplets going to your partner. **Test** shows a made-up order, to check the panel.

### Limitations

- Bolt only sees what's drawn, so the droplets have to be on screen.
- If you and your partner stand on top of each other, droplets falling on them look like they're falling on you.
- A droplet flying at your partner that passes right over you can show up briefly, until it's clear it's going past you.
- The distances and speeds in `bolt/config.lua` are estimates and haven't been tuned in game yet; if droplets are missed or counted for the wrong player, adjust `ownRadius`, `minSideSpeed` and the colour settings there.

## Flash

The specials are written on screen one line per boss in the boss's colour: Lady's in red, Lord's in blue underneath.

- **Before a special**: the next step's specials appear (steady) 10 seconds after the previous special (`warnAfterMs` in [`config.js`](config.js)), about 2 seconds before it. In phase 5 there are only 3 auto-attacks between specials, so it's 6 seconds (the phase's own `warnAfterMs`). The first special of a kill appears 10 seconds after Lady's "Just give in. Join us." (`firstWarnAfterMs`), and phase 4's first one 2 seconds before its silent Magic Bleed + Blue Bar step. They stay until the special is used, for at most 5 seconds (`warningMs`).
- **When its chat line comes in**: the step's specials flash for 3 seconds (`flashMs`).

It works in every phase and follows **Show** in the options:

- **Both**: both bosses' specials, e.g. **DASH** above **BLOOD WAVES**.
- **Lady**: her special, plus Lord's Meatball or Blue Bar when it's in the same step, e.g. **MAGIC BLEED** above **MEATBALL**.
- **Lord**: his special.
- In **phase 3** both bosses' specials always flash.

Lady's and Lord's lines for the same step count as one flash. In phase 5, Lord's third special shows as **RANDOM** beforehand (and while flashing if Lady's Dash line comes first), and changes to the one he picked, e.g. **MIND FLAY**, when he says it. Renamed specials use your names. Steps with no chat line (Blue Bar for Lord's tank) don't flash.

Alt1 can't see where your character is, so the writing is centred on the game window, a quarter of the window's height above its middle, which is about 10 tiles above your character at the usual zoom (`flashHeight`; the text size is `flashTextSize`). It needs Alt1's **overlay** permission.

## Phase marker

Once a kill starts (or any boss line is read), the app searches the whole game screen about once a second for the boss bar's "Phase: N" box, since it can be anywhere and only appears ~10 seconds into the kill. When it's found the status line says "phase marker found" and the box is briefly outlined in green; from then on only that small area is read, and the panel follows the number shown. When the box disappears at the end of the kill, the app forgets it and searches again next kill. **Find chat** also starts a search straight away.

The ◀ / ▶ buttons still work: a phase picked by hand stays until the marker next changes.

The marker is matched against the default interface scaling; with a different scaling it won't be found and phases fall back to chat lines and the arrows.

## Filling in the boss data

All boss data is in [`config.js`](config.js).

- `specialLines`: what each boss yells for each special. Fill these in once; they're used in every phase. Leave the speaker's name out: it's drawn in a dark colour that's harder for Alt1 to read than the message.
- `phases[].rotation`: each phase's order, as `[Lady's special, Lord's special]` pairs. A list of specials in place of one, like Lord's `["Blood Waves", "Blood Diamond", "Mind Flay"]` in phase 5, means the boss picks one at random; any of their lines counts, and the one said flashes on screen.

Also fill in each phase's `phaseLines`: what is yelled when the fight enters that phase. If the same thing is said at every phase change, put it in `nextPhaseLines` instead.

Matching ignores capitalisation, punctuation, spaces and the timestamp, and a pattern only needs to be part of the line. If a special is missed, the next special that is recognised corrects the order.

## Development

The app is plain HTML/JS with no build step. The Alt1 libraries load from unpkg (`alt1@0.1.3`).

```sh
node --test test/*.test.js  # tests for the phase/special logic and the phase marker
python3 -m http.server     # then open http://localhost:8000 to try the UI
luajit test/droplets.test.lua  # tests for the Bolt plugin's droplet logic (or lua5.1)
```

The Bolt plugin is Lua 5.1 (Bolt uses LuaJIT). `bolt/droplets.lua` has the droplet logic with no Bolt calls, so it can be tested outside the game; `bolt/main.lua` is the Bolt glue and `bolt/ui.html` the panel.
