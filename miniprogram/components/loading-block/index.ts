/**
 * `<loading-block>` - one loading state for every list and detail page.
 *
 * Skeleton lines rather than a spinner by default, because a skeleton tells the user *what* is
 * arriving (a list of cards, a paragraph) and the page does not jump when the data lands. The
 * spinner mode exists for a write (submitting a paper, generating a 智学 set) where there is no
 * shape to promise.
 */

Component({
  properties: {
    /** The line under the spinner / above the skeleton. */
    text: { type: String, value: '正在加载…' },
    /** How many skeleton lines to draw. */
    rows: { type: Number, value: 3 },
    /** `skeleton` (default) or `spinner`. */
    mode: { type: String, value: 'skeleton' },
    /** Tighter padding, for a block inside a card rather than a whole page. */
    compact: { type: Boolean, value: false },
  },

  data: {
    /** The skeleton array: WXML has no range syntax, so the lines are materialised here. */
    lines: [0, 1, 2],
  },

  observers: {
    rows(rows: number) {
      const count = rows > 0 && rows <= 12 ? rows : 3
      const lines: number[] = []
      for (let index = 0; index < count; index += 1) {
        lines.push(index)
      }
      this.setData({ lines })
    },
  },
})
