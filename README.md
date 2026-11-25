# eisenhower-matrix-crucible

Shows your to-do list as a radar scope sorted by the Eisenhower matrix. Each quarter of the scope is one quadrant (do first, schedule, delegate, eliminate), and the closer an item sits to the center, the sooner its next step is due. Part of the entropy forge **crucible** family (a crucible is the vessel you melt metal in, and the one assayers use to see what an ore really holds; a crucible = a tool that shows information).

```
              Do first │ Schedule
                   ·   │   ·
        ·      ·  ( today )  ·     ·        rings: 1 week · 2 weeks · 30 days · 60 days
                   ·   │   ·                no date: outer edge
              Delegate │ Eliminate
```

One HTML file and one data file. No build, no server, no dependencies.

## Use it

1. Clone the repo and open `index.html` in a browser. It shows the sample items.
2. Copy `sample-items.js` to `items.js` and change `window.CRUCIBLE_SAMPLE` to `window.CRUCIBLE`.
3. Replace the items with your own and reload.

`items.js` is git-ignored, so your list never lands in a commit. Keep it that way: the items in it are usually private.

The page reads `items.js` with a plain `<script>` tag, so it works straight from disk (`file://`) as well as from any static host. If `items.js` is missing it falls back to the samples.

## Items file

```js
window.CRUCIBLE = {
  title: 'My week',                                  // page title; also the headline when there is no goal
  brand: 'my team / radar',                          // optional header text
  goal: { label: 'launch day', date: '2027-03-01' }, // optional: headline counts down to it
  snapshot: '2026-11-24',                            // optional: when the list was taken
  linkBase: 'https://example.atlassian.net/browse/', // optional: item.key is appended to make a link
  quadrants: { 4: 'Park' },                          // optional: rename any quadrant
  items: [
    { q: 1, key: 'OPS-12', title: 'Send the proposal', by: '2026-11-28', deadline: '2026-12-05', next: 'One read-through, then send.' }
  ]
};
```

| Field | Required | Meaning |
|---|---|---|
| `q` | yes | Quadrant: `1` do first (important, urgent), `2` schedule (important), `3` delegate (urgent), `4` eliminate |
| `title` | yes | What the item is |
| `by` | no | When the next step is due: a date `"YYYY-MM-DD"` or a number of days from today. Sets the distance from the center. Leave it out or `null` for the outer edge |
| `deadline` | no | The outer deadline, if different from `by`. Shown in the list only |
| `next` | no | The next step, in a sentence |
| `key` | no | A ticket key. With `linkBase` it becomes a link |
| `url` | no | A link for the item (overrides `linkBase`). Only `http` and `https` links are used |
| `source` | no | Where the item came from, shown when there is no key |

Items keep the order you give them; the number on each blip is its position in the list. Put them in priority order. The scope reads best with up to about 20 items.

Everything in the file is shown as text, never as HTML.

## Look

The styling is **Afterglow**, the dark design system from [content-forge](https://github.com/bobthemagicman/content-forge) (`design-system/content-forge/MASTER.md`): a plum-black ground with soft glows, glass panels, lime, amber and pink accents, amber focus rings. Headings use Aeonik when it is installed on your machine. It is a licensed font and is never bundled or loaded from the web; everything falls back to Lato from Google Fonts.

Motion is one radar sweep on load and on **Sweep again**. With reduced motion set, nothing moves.

## Accessibility

Blips and rows are keyboard reachable (Tab, then Enter or Space to select). Selecting a blip highlights its row and the other way round. Overdue items say so in words, not only in color. The layout stacks under 900px and works down to 320px wide.

## License

[MPL-2.0](LICENSE)
