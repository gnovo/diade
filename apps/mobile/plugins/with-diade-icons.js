// Copies the Díade icon set (design system handover, app-icons/) into the generated native
// projects on every prebuild. The ios/ and android/ folders are generated (Expo CNG), so the
// assets live in assets/native-icons and are applied here, not edited by hand.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withFinalizedMod } = require('expo/config-plugins');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

module.exports = function withDiadeIcons(config) {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const { projectRoot, platformProjectRoot, projectName } = cfg.modRequest;
      const src = path.join(projectRoot, 'assets/native-icons/ios/AppIcon.appiconset');
      const dest = path.join(
        platformProjectRoot,
        projectName,
        'Images.xcassets/AppIcon.appiconset',
      );
      fs.rmSync(dest, { recursive: true, force: true });
      copyDir(src, dest);
      return cfg;
    },
  ]);

  // Finalized: runs after Expo has generated its own launcher icons, so the webp files exist to remove.
  config = withFinalizedMod(config, [
    'android',
    async (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const src = path.join(projectRoot, 'assets/native-icons/android-res');
      const dest = path.join(platformProjectRoot, 'app/src/main/res');
      // Expo generates ic_launcher*.webp; the handover ships ic_launcher*.png with the same names,
      // and aapt rejects the duplicates. Remove the generated webp launcher icons first.
      for (const dir of fs.readdirSync(dest).filter((d) => d.startsWith('mipmap-'))) {
        for (const file of fs.readdirSync(path.join(dest, dir))) {
          if (/^ic_launcher(_round)?\.webp$/.test(file)) fs.rmSync(path.join(dest, dir, file));
        }
      }
      copyDir(src, dest);
      return cfg;
    },
  ]);

  return config;
};
