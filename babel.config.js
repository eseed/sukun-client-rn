module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo already wires the Reanimated/worklets plugin for SDK 54+, so it must
  // not be listed again here.
  return {
    presets: ['babel-preset-expo'],
  };
};
