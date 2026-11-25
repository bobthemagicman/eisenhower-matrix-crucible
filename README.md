# eisenhower-matrix-crucible

Shows your to-do list as a forge fire sorted by the Eisenhower matrix. Each quarter of the fire is one quadrant, and each item glows in a blacksmith's heat color: white-hot at the center when its next step is due now, cooling through yellow, orange and cherry red toward the rim. Part of the entropy forge **crucible** family (a crucible is the vessel you melt metal in, and the one assayers use to see what an ore really holds; a crucible = a tool that shows information).

```
                Strike │ Bank
              do first │ schedule
                   ·   │   ·
        ·      · ( white heat ) ·  ·        rings: 1 week · 2 weeks · 30 days · 60 days
                   ·   │   ·                no date: black heat, on the rim
              delegate │ eliminate
               Striker │ Slag
```

## Reading the fire

| Quadrant | Eisenhower | Why the name |
|---|---|---|
| **Strike** | Do first: important and urgent | Strike while the iron is hot |
| **Bank** | Schedule: important, not urgent | Bank the fire and come back to it |
| **Striker** | Delegate: urgent, not important | The striker is the smith's helper who swings the sledge |
| **Slag** | Eliminate: neither | The waste you skim off and drop |

| Heat | Next step due |
|---|---|
| Burning (dashed red ring) | Overdue |
| White heat | Within a week |
| Yellow heat | Within 2 weeks |
| Orange heat | Within 30 days |
| Cherry red | Within 60 days |
| Dull red | Later |
| Black heat | No date |

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
  quadrants: { 4: { name: 'Cold iron', hint: 'Park' } }, // optional: rename any quadrant (a string sets just the name)
  items: [
    { q: 1, key: 'OPS-12', title: 'Send the proposal', by: '2026-11-28', deadline: '2026-12-05', next: 'One read-through, then send.' }
  ]
};
```

| Field | Required | Meaning |
|---|---|---|
| `q` | yes | Quadrant: `1` Strike (do first), `2` Bank (schedule), `3` Striker (delegate), `4` Slag (eliminate) |
| `title` | yes | What the item is |
| `by` | no | When the next step is due: a date `"YYYY-MM-DD"` or a number of days from today. Sets the heat and the distance from the center. Leave it out or `null` for black heat on the rim |
| `deadline` | no | The outer deadline, if different from `by`. Shown in the list only |
| `next` | no | The next step, in a sentence |
| `key` | no | A ticket key. With `linkBase` it becomes a link |
| `url` | no | A link for the item (overrides `linkBase`). Only `http` and `https` links are used |
| `source` | no | Where the item came from, shown when there is no key |

Items keep the order you give them; the number on each piece is its position in the list. Put them in priority order. The fire reads best with up to about 20 items.

Everything in the file is shown as text, never as HTML.

## Look

The ground is **Afterglow**, the dark design system from [content-forge](https://github.com/bobthemagicman/content-forge) (`design-system/content-forge/MASTER.md`): a plum-black ground with soft glows, glass panels, amber focus rings, magenta links. On top of it sits the forge: blacksmith heat colors for the items, the fire bed and the header line. Headings use Aeonik when it is installed on your machine. It is a licensed font and is never bundled or loaded from the web; everything falls back to Lato from Google Fonts.

Motion is one bellows breath on load and on **Work the bellows**: the fire flares and the pieces light up from the hottest outward. It never loops. With reduced motion set, nothing moves.

## Accessibility

Pieces and rows are keyboard reachable (Tab, then Enter or Space to select). Selecting a piece highlights its row and the other way round. Heat and overdue status are written out in words, never shown by color alone. The layout stacks under 900px and works down to 320px wide.

## License

[MPL-2.0](LICENSE)
