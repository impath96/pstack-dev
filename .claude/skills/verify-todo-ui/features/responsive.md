# Use the app on a phone

The list has to stay usable at phone width. Each row collapses from one line into two, so
the title keeps a readable share of the row instead of being ellipsed away. The editor
dialog has to stay reachable and submittable at the same width.

## Sub-features

- `narrow-list` keeps a readable title and wraps the row metadata onto a second line.
- `narrow-controls` keeps the row controls reachable without horizontal scrolling.
- `narrow-editor` keeps the editor dialog usable and submittable.
- `narrow-no-overflow` keeps the page free of horizontal scroll.

## How to get to it (user POV)

- Open the app on a phone, or narrow the browser window below 640px.

## Driving it with drive.mjs

Preconditions:

- `helpers/doctor.sh "$RUN_ID"` prints `DOCTOR OK`.
- Storage holds the seed. Load `?reset=seed` if an earlier journey changed it.

- **Narrow the viewport.** Run `await page.setViewportSize({ width: 414, height: 900 })`
  then `await page.reload({ waitUntil: 'load' })` and
  `await page.evaluate(() => document.fonts.ready)`.
- **Check for overflow.** For each layout run
  `await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)`.
  The result is `0` or less.
- **Check the titles survive.** Run
  `await page.evaluate(() => Math.min(...[...document.querySelectorAll('#view .title')].map((n) => n.getBoundingClientRect().width)))`.
  The narrowest title is at least 120px wide.
- **Check the controls are reachable.** Run
  `await page.locator('.row[data-id="2"] [data-advance]').isVisible()` and the same for
  `[data-edit]` and `[data-delete]`. All three are visible and clickable at this width.
- **Check the editor.** Open the editor and submit a valid todo at 414px. The dialog fits,
  every field is reachable, and the submit control is not pushed off screen.
- **Measure the density.** Run
  `await page.evaluate(() => document.getElementById('view').scrollHeight)` and divide by
  the row count to get the height the list spends per todo. Record it.
- **Proof.** Screenshot the list and the open editor at 414px. Run
  `await ev.shot('list-mobile')`, `await ev.shot('editor-mobile')` and
  `ev.json('density', { width: 414, perItem: <measured> })`.

## Gotchas

- A row can avoid horizontal overflow by collapsing its title to zero width and ellipsing
  it away. The prototype's list did exactly that before the two-line rule was added. An
  overflow check alone is not proof. Always pair it with the title width check.
- The breakpoint is 640px, not 414px, and it is set in `src/styles.css`. A check run at
  500px exercises the narrow rules too, so do not treat 560px to 640px as desktop. If the
  media query moves, this line is the copy that goes stale, so change both.
- `page.setViewportSize` does not re-run the layout for content already measured in a
  journey. Take the measurements after the resize, not before.
- Full-page screenshots at 414px are tall. Compare the per-item height from the
  measurement rather than eyeballing two images of different heights.
- A `<dialog>` opened with `showModal` sits in the top layer and is not inside `#view`. A
  full-page screenshot captures it, but a screenshot clipped to `#view` does not.
