(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});

  invenClear.config = {
    allowedBadgeFilterBoards: ['maple', 'lostark', 'aion2'],
    allowedCombatPowerBoards: ['maple'],
    storageKeys: {
      hideNoBadgeEnabled: 'hideNoBadgeEnabled',
      hideNoBadgePosts: 'hideNoBadgePosts',
      hideNoBadgeComments: 'hideNoBadgeComments',
      excludeRecommendedNoBadgePosts: 'excludeRecommendedNoBadgePosts',
      showCombatPower: 'showCombatPower',
      hideBelowCombatPowerEnabled: 'hideBelowCombatPowerEnabled',
      hideBelowCombatPowerThreshold: 'hideBelowCombatPowerThreshold',
    },
    getStorageArea() {
      const storage = global.chrome && chrome.storage;
      if (!storage) return null;
      return storage.sync || storage.local || null;
    },
    getStorageAreaName() {
      const storage = global.chrome && chrome.storage;
      if (!storage) return null;
      if (storage.sync) return 'sync';
      if (storage.local) return 'local';
      return null;
    },
  };
})(globalThis);
