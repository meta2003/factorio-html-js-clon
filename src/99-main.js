// 99-main.js — entry point. Boots the real game unless running under the
// headless test harness (ARCHITECTURE.md §1/§18: "F.boot() must NOT be
// called automatically" when window.HEADLESS === true).
(function () {
  'use strict';
  if (!window.HEADLESS) {
    try {
      F.boot();
    } catch (err) {
      console.error('Factio failed to boot', err);
    }
  }
})();
