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
    },
  };
})(globalThis);
