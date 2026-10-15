# KnightsSpecOrder

An [Alt1 Toolkit](https://runeapps.org/alt1) app that reads the RuneScape chatbox and shows which special attacks Lady Ghrazi and Lord Ghrazi will use next.

- Shows the current phase's special order. Each row is one step: Lady's special (melee, red header) and Lord's special (magic, blue header), used at the same time. The next step is highlighted in green.
- When either boss yells a special's chat line, the highlight moves to the next step. Lady's and Lord's lines for the same step count once, and in phase 3 a line from just one of them is enough.
- When a phase-change line is yelled, the panel switches to the next phase and the order **carries over**: if 2 steps were used in phase 1, step 3 is next in phase 2.
- Entering **phase 4** always resets to step 1. Phase 5 carries on from wherever phase 4 was.
- Blue Bar has no chat line, and Lady's lines only show for her tank, so for Lord's tank the Magic Bleed + Blue Bar steps (phase 4 step 1, phase 5 steps 1 and 4) are silent. Blue Bar comes 20 game ticks (12 seconds) after the previous special, so once that has passed (plus 3 ticks of grace) without a line, the app assumes it happened and moves on.
- When Lady Karmina Ghrazi says "Just give in. Join us." a new kill has started, and the panel goes back to phase 1, step 1.
- Phase changes are also read from the boss bar's **"Phase: N"** box on screen (phase 3 has no chat line). See [Phase marker](#phase-marker).

| Phase | Order (Lady + Lord) |
| --- | --- |
| 1 | 3 Prayers + 3 Prayers → Dash + Blood Waves → Magic Bleed + Meatball |
| 2 | 3 Prayers + 3 Prayers → Dash + Mind Flay → Magic Bleed + Blood Waves |
| 3 | 3 Prayers + 3 Prayers → Dash + Blood Waves → Magic Bleed + Blood Diamond |
| 4 | Magic Bleed + Blue Bar → 5 Prayers + 5 Prayers → Dash + Blood Waves → Magic Bleed + Meatball → 5 Prayers + 5 Prayers → Dash + Blood Waves |
| 5 | Magic Bleed + Blue Bar → 5 Prayers + 5 Prayers → Dash + Blood Waves → Magic Bleed + Blue Bar → 5 Prayers + 5 Prayers → Dash + Meatball |

## Installing in Alt1

The app is a static web page, so it has to be hosted somewhere Alt1 can load it. GitHub Pages works:

1. In the repository settings, go to **Pages** and deploy from the branch the app is on (root folder).
2. In your browser, open
   `alt1://addapp/https://<your-github-username>.github.io/KnightsSpecOrder/appconfig.json`
   (or paste the `appconfig.json` URL into Alt1's browser and click **Add app**).
3. Accept the **pixel** and **overlay** permissions.

## Using it

- Keep the chatbox where the boss's lines appear visible. When the app finds the chatbox it briefly outlines it in green.
- **◀ / ▶** change phase by hand. **Click a row** to make it the next step. **Reset** goes back to phase 1, step 1. **Find chat** locates the chatbox again if you moved it.
- **Tools** (at the bottom):
  - **Chatbox**: pick which chatbox to read, if you have more than one.
  - **Show all chat lines read**: logs every line Alt1 reads. Use this to check that the boss's lines are being read correctly.
  - **Copy log** / **Clear log**: copy the whole log (oldest line first) to paste it somewhere, or empty it before a kill.
  - **Simulate a chat line**: type a line to test the config without being at the boss. This also works in a normal browser.

## Phase marker

Once a kill starts (or any boss line is read), the app searches the whole game screen about once a second for the boss bar's "Phase: N" box, since it can be anywhere and only appears ~10 seconds into the kill. When it's found the status line says "phase marker found" and the box is briefly outlined in green; from then on only that small area is read, and the panel follows the number shown. When the box disappears at the end of the kill, the app forgets it and searches again next kill. **Find chat** also starts a search straight away.

The ◀ / ▶ buttons still work: a phase picked by hand stays until the marker next changes.

The marker is matched against the default interface scaling; with a different scaling it won't be found and phases fall back to chat lines and the arrows.

## Filling in the boss data

All boss data is in [`config.js`](config.js).

- `specialLines`: what each boss yells for each special. Fill these in once; they're used in every phase. Leave the speaker's name out: it's drawn in a dark colour that's harder for Alt1 to read than the message.
- `phases[].rotation`: each phase's order, as `[Lady's special, Lord's special]` pairs.

Also fill in each phase's `phaseLines`: what is yelled when the fight enters that phase. If the same thing is said at every phase change, put it in `nextPhaseLines` instead.

Matching ignores capitalisation, punctuation, spaces and the timestamp, and a pattern only needs to be part of the line. If a special is missed, the next special that is recognised corrects the order.

## Development

The app is plain HTML/JS with no build step. The Alt1 libraries load from unpkg (`alt1@0.1.3`).

```sh
node --test test/*.test.js  # tests for the phase/special logic and the phase marker
python3 -m http.server     # then open http://localhost:8000 to try the UI
```
