/**
 * Config
 * -------------------------------------------------------------------------------------
 * ! IMPORTANT: Make sure you clear the browser local storage In order to see the config changes in the template.
 * ! To clear local storage: (https://www.leadshook.com/help/how-to-clear-local-storage-in-google-chrome-browser/).
 */

'use strict';
/* JS global variables
 !Please use the hex color code (#000) here. Don't use rgba(), hsl(), etc
*/
(function () {
  function getCssVar(name) {
    if (typeof window.Helpers !== 'undefined' && typeof window.Helpers.getCssVar === 'function') {
      return window.Helpers.getCssVar(name);
    }
    return 'var(--bs-' + name + ')';
  }
  window.config = {
    colors: {
      primary: getCssVar('primary'),
      secondary: getCssVar('secondary'),
      success: getCssVar('success'),
      info: getCssVar('info'),
      warning: getCssVar('warning'),
      danger: getCssVar('danger'),
      dark: getCssVar('dark'),
      black: getCssVar('pure-black'),
      white: getCssVar('white'),
      cardColor: getCssVar('paper-bg'),
      bodyBg: getCssVar('body-bg'),
      bodyColor: getCssVar('body-color'),
      headingColor: getCssVar('heading-color'),
      textMuted: getCssVar('secondary-color'),
      borderColor: getCssVar('border-color')
    },
    colors_label: {
      primary: getCssVar('primary-bg-subtle'),
      secondary: getCssVar('secondary-bg-subtle'),
      success: getCssVar('success-bg-subtle'),
      info: getCssVar('info-bg-subtle'),
      warning: getCssVar('warning-bg-subtle'),
      danger: getCssVar('danger-bg-subtle'),
      dark: getCssVar('dark-bg-subtle')
    },
    fontFamily: getCssVar('font-family-base')
  };
})();
