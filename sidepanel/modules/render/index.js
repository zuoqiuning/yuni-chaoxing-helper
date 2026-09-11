(function () {
  'use strict';
  window.SP = window.SP || {};

  // ★ 合并 catalog + jobs 到 SP.render
  SP.render = Object.assign({}, SP.catalog || {}, SP.jobs || {});
})();