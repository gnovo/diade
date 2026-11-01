// Applies release signing and the target ABI to the generated android/ project on every prebuild,
// so regenerating android/ (expo prebuild) does not drop them.
//
// The release keystore is NOT in the repo. Its location and passwords come from
// ~/.gradle/gradle.properties (DIADE_RELEASE_STORE_FILE, DIADE_RELEASE_STORE_PASSWORD,
// DIADE_RELEASE_KEY_ALIAS, DIADE_RELEASE_KEY_PASSWORD). Missing properties fail the release build
// instead of silently signing with the debug key.
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const RELEASE_SIGNING_BLOCK = `        release {
            // Credentials come from ~/.gradle/gradle.properties (DIADE_RELEASE_*), never from the repo.
            if (!project.hasProperty('DIADE_RELEASE_STORE_FILE')) {
                throw new GradleException("Missing DIADE_RELEASE_* properties in ~/.gradle/gradle.properties")
            }
            storeFile file(project.property('DIADE_RELEASE_STORE_FILE'))
            storePassword project.property('DIADE_RELEASE_STORE_PASSWORD')
            keyAlias project.property('DIADE_RELEASE_KEY_ALIAS')
            keyPassword project.property('DIADE_RELEASE_KEY_PASSWORD')
        }
`;

function applyReleaseSigning(contents) {
  if (contents.includes('DIADE_RELEASE_STORE_FILE')) return contents; // already applied

  // 1. Add a release signing config next to the debug one.
  const signingIdx = contents.indexOf('signingConfigs {');
  if (signingIdx === -1) throw new Error('with-diade-release-signing: signingConfigs block not found');
  const insertAt = contents.indexOf('\n', signingIdx) + 1;
  contents = contents.slice(0, insertAt) + RELEASE_SIGNING_BLOCK + contents.slice(insertAt);

  // 2. Point the release build type at it (not at the debug key).
  const buildTypesIdx = contents.indexOf('buildTypes {');
  const releaseIdx = contents.indexOf('release {', buildTypesIdx);
  if (buildTypesIdx === -1 || releaseIdx === -1) {
    throw new Error('with-diade-release-signing: release buildType not found');
  }
  const windowEnd = releaseIdx + 600;
  const head = contents.slice(0, releaseIdx);
  const tail = contents.slice(releaseIdx, windowEnd).replace(
    'signingConfig signingConfigs.debug',
    'signingConfig signingConfigs.release',
  );
  return head + tail + contents.slice(windowEnd);
}

module.exports = function withDiadeReleaseSigning(config) {
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });

  // Ship only arm64 (all modern Pixels). Halves the APK versus four ABIs.
  config = withGradleProperties(config, (cfg) => {
    const existing = cfg.modResults.find(
      (item) => item.type === 'property' && item.key === 'reactNativeArchitectures',
    );
    if (existing) existing.value = 'arm64-v8a';
    else cfg.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: 'arm64-v8a' });
    return cfg;
  });

  return config;
};
