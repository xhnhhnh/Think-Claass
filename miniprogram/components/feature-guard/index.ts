/**
 * `<feature-guard flag="enable_shop">` - renders its slot only when the class flag is on, and a
 * friendly 「该功能未开启」 state otherwise.
 *
 * ## Where `allowed` comes from
 *
 * Three sources, in this order, so that a page can be as explicit as it likes without the component
 * ever needing to know about pages:
 *
 *   1. `enabled` - the page already computed `features.enable_shop` and passes the boolean.
 *   2. `features` - the page's whole flag map (what most pages pass, since they render several
 *      guarded blocks from one resolution).
 *   3. the module-level resolution in `utils/feature.ts` - for a page that only guards one thing.
 *
 * ## Why "unknown" is closed
 *
 * When no flag map has been resolved yet (`source: 'unknown'`, e.g. the live call failed and the
 * class has no login snapshot) the guard renders the *closed* state, and says honestly that it
 * could not check. Defaulting to open would show a pupil a 积分商城 that the server will refuse -
 * the failure would then arrive at the moment they tap 兑换, which is the worst possible moment.
 * Pages keep their loading block up until `resolveFeatures` has answered, so this branch is only
 * visible when the answer genuinely is not available.
 */

import { getResolution, isEnabled } from '../../utils/feature'
import type { ClassFeatureFlags } from '../../utils/storage'

Component({
  properties: {
    /** The class feature key, e.g. `enable_shop`. */
    flag: { type: String, value: '' },
    /** Precomputed boolean from the page. `null` (the default) means "work it out". */
    enabled: { type: null, value: null },
    /** The page's resolved flag map, when it has one. */
    features: { type: null, value: null },
    title: { type: String, value: '该功能未开启' },
    /** Overrides the built-in explanation. */
    description: { type: String, value: '' },
    /** Render a 「重新检查」 button and emit `retry` when it is tapped. */
    showRetry: { type: Boolean, value: false },
  },

  data: {
    allowed: true,
    /** The line shown when the caller gave no `description`. */
    hint: '',
  },

  observers: {
    'flag, enabled, features': function () {
      this.recompute()
    },
  },

  lifetimes: {
    attached() {
      this.recompute()
    },
  },

  methods: {
    recompute() {
      const flag = this.data.flag || null
      const explicit = this.data.enabled
      const provided = this.data.features

      let allowed: boolean
      let hint = ''

      if (explicit === true || explicit === false) {
        allowed = explicit
        hint = '你的老师还没有为班级开启这个功能，可以问问老师～'
      } else if (provided && typeof provided === 'object') {
        allowed = isEnabled(provided as ClassFeatureFlags, flag)
        hint = '你的老师还没有为班级开启这个功能，可以问问老师～'
      } else {
        const resolution = getResolution()
        if (resolution.source === 'unknown') {
          allowed = false
          hint = '暂时没能确认班级的功能开关，下拉刷新或稍后再试一次。'
        } else {
          allowed = isEnabled(resolution.features, flag)
          hint = '你的老师还没有为班级开启这个功能，可以问问老师～'
        }
      }

      this.setData({ allowed, hint })
    },

    onRetry() {
      this.triggerEvent('retry')
    },
  },
})
