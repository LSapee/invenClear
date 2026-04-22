(function (global) {
  'use strict';

  const invenClear = global.InvenClear || (global.InvenClear = {});

  invenClear.config = {
    allowedBadgeFilterBoards: ['maple', 'lostark', 'aion2'],
    storageKeys: {
      hideNoBadgeEnabled: 'hideNoBadgeEnabled',
      hideNoBadgePosts: 'hideNoBadgePosts',
      hideNoBadgeComments: 'hideNoBadgeComments',
      excludeRecommendedNoBadgePosts: 'excludeRecommendedNoBadgePosts',
    },
  };
})(globalThis);
