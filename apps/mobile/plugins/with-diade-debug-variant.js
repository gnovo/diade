// NOT REGISTERED in app.json on purpose. Listing any plugin there changes the native fingerprint, and
// the app's runtimeVersion is that fingerprint, so registering it makes over-the-air updates stop
// reaching the installed release build. To use it for a local debug build, add
// "./plugins/with-diade-debug-variant" to expo.plugins temporarily, run `expo prebuild --platform android`,
// build, and remove the line again before releasing (or publishing an update).
//
// Makes every DEBUG build install beside the production app instead of over it.
//
// The production APK is signed with the release keystore under com.diade.app. A debug build with the
// same id is signed with the debug key, so Android refuses to update it, and the only way past that is
// uninstalling the production app (which wipes its local data). Giving the debug build its own
// applicationId (com.diade.app.dev) and its own launcher name avoids the clash entirely.
//
// Release builds are untouched: this only edits the `debug` buildType and adds a debug-only resource.
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const SUFFIX_LINE = "            applicationIdSuffix '.dev'";

function applyDebugSuffix(contents) {
  if (contents.includes("applicationIdSuffix '.dev'")) return contents; // already applied
  const buildTypesIdx = contents.indexOf('buildTypes {');
  const debugIdx = contents.indexOf('debug {', buildTypesIdx);
  if (buildTypesIdx === -1 || debugIdx === -1) {
    throw new Error('with-diade-debug-variant: debug buildType not found');
  }
  const insertAt = contents.indexOf('\n', debugIdx) + 1;
  return contents.slice(0, insertAt) + SUFFIX_LINE + '\n' + contents.slice(insertAt);
}

const DEBUG_STRINGS = `<resources>
    <string name="app_name">Díade Dev</string>
</resources>
`;

module.exports = function withDiadeDebugVariant(config) {
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyDebugSuffix(cfg.modResults.contents);
    return cfg;
  });

  // A debug-only app_name overrides the main one, so the two apps are told apart on the launcher.
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'debug', 'res', 'values');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'strings.xml'), DEBUG_STRINGS);
      return cfg;
    },
  ]);
};
