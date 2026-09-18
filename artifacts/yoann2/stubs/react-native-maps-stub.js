const { View } = require('react-native');
const noop = () => null;
module.exports = {
  __esModule: true,
  default: View,
  MapView: View,
  Marker: noop,
  Polyline: noop,
  Circle: noop,
  Polygon: noop,
  Callout: noop,
  PROVIDER_GOOGLE: 'google',
  PROVIDER_DEFAULT: null,
};
