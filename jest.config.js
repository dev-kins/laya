/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/android',
  // The platform preset needs Expo's Babel preset explicitly when no Babel config exists.
  transform: {
    '\\.[jt]sx?$': ['babel-jest', {
      presets: [require.resolve('expo/internal/babel-preset')],
      caller: { name: 'metro', bundler: 'metro', platform: 'android' },
    }],
  },
};
