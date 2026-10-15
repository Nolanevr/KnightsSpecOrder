# KnightsSpecOrder

An [Alt1 Toolkit](https://runeapps.org/alt1) app that reads the RuneScape chatbox and shows which special attack Lady Ghrazi and Lord Ghrazi will each use next.

- Shows the current phase and, side by side, each boss's 3 special attacks for that phase, with the next one highlighted in green.
- Lady and Lord each have their own special order. When one of them yells a special attack's chat line, that boss's highlight moves on to their next special.
- When a phase-change line is yelled, the panel switches to the next phase. Each boss's special order **carries over**: if 2 specials were used in phase 1, special 3 is next in phase 2.
- Entering **phase 4** always resets both bosses to special 1.
- Phase 5 has no special attacks by default.

## Installing in Alt1

The app is a static web page, so it has to be hosted somewhere Alt1 can load it. GitHub Pages works:

1. In the repository settings, go to **Pages** and deploy from the branch the app is on (root folder).
2. In your browser, open
   `alt1://addapp/https://<your-github-username>.github.io/KnightsSpecOrder/appconfig.json`
   (or paste the `appconfig.json` URL into Alt1's browser and click **Add app**).
3. Accept the **pixel** and **overlay** permissions.

## Using it

- Keep the chatbox where the boss's lines appear visible. When the app finds the chatbox it briefly outlines it in green.
- **◀ / ▶** change phase by hand. **Click a special** to make it that boss's next one. **Reset** goes back to phase 1, special 1. **Find chat** locates the chatbox again if you moved it.
- **Tools** (at the bottom):
  - **Chatbox**: pick which chatbox to read, if you have more than one.
  - **Show all chat lines read**: logs every line Alt1 reads. Use this to check that the boss's lines are being read correctly.
  - **Simulate a chat line**: type a line to test the config without being at the boss. This also works in a normal browser.

## Filling in the boss data

All boss data is in [`config.js`](config.js). For each phase, fill in `specials.lady` and `specials.lord`:

- `name`: the special attack's name, as shown in the panel.
- `lines`: what that boss yells when it uses that special. If Lady and Lord could say similar things, include the speaker's name (e.g. `"Lady Ghrazi: ..."`) so the line can only match one of them.

Also fill in each phase's `phaseLines`: what is yelled when the fight enters that phase. If the same thing is said at every phase change, put it in `nextPhaseLines` instead.

Matching ignores capitalisation, punctuation, spaces and the timestamp, and a pattern only needs to be part of the line. If a special is missed, the next special that is recognised corrects the order.

## Development

The app is plain HTML/JS with no build step. The Alt1 libraries load from unpkg (`alt1@0.1.3`).

```sh
node --test test/          # tests for the phase/special logic in tracker.js
python3 -m http.server     # then open http://localhost:8000 to try the UI
```
