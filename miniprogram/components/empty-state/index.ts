/**
 * `<empty-state>` - "there is nothing here yet", in a voice a pupil can read.
 *
 * Separate from the error state on purpose. "还没有作业" and "作业没能加载出来" look different to a
 * child and call for different actions: the first needs reassurance, the second needs a retry. The
 * `actionText` property is how a caller offers that retry (or a "去逛逛" jump) without the
 * component knowing anything about routes.
 */

Component({
  properties: {
    title: { type: String, value: '这里还是空的' },
    /** One line of explanation. Kept short: the state block is centred and narrow. */
    description: { type: String, value: '' },
    /** When set, an action button is rendered and `action` is triggered on tap. */
    actionText: { type: String, value: '' },
    /** `neutral` (default) or `success` - a finished-everything state may read positively. */
    tone: { type: String, value: 'neutral' },
  },

  methods: {
    onAction() {
      this.triggerEvent('action')
    },
  },
})
