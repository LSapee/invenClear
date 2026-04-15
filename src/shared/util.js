(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});

  invenClear.util = {
    truncate(value, maxLength) {
      if (!value) return '';
      return value.length > maxLength ? value.slice(0, maxLength) + '…' : value;
    },

    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
})(globalThis);
