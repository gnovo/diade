import '../global.css';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import { HealthProvider } from './context/HealthContext';
import { NutritionProvider } from './context/NutritionContext';
import { TrainingProvider } from './context/TrainingContext';
import { ThemeProvider, useScheme, useThemeColors, useThemePreference } from './design';
import { I18nProvider, useLanguagePreference } from './i18n';
import { RootNavigator } from './navigation/RootNavigator';
import { getLocalDb } from './storage/sqlite';
import { SyncProvider } from './sync/SyncProvider';

// Plus Jakarta Sans static faces (SIL OFL 1.1). Family names match tailwind.config.js and generated.ts.
const fonts = {
  PlusJakartaSans_400Regular: require('../assets/fonts/PlusJakartaSans_400Regular.ttf'),
  PlusJakartaSans_500Medium: require('../assets/fonts/PlusJakartaSans_500Medium.ttf'),
  PlusJakartaSans_600SemiBold: require('../assets/fonts/PlusJakartaSans_600SemiBold.ttf'),
  PlusJakartaSans_700Bold: require('../assets/fonts/PlusJakartaSans_700Bold.ttf'),
};

function AppShell() {
  const scheme = useScheme();
  // Pre-warm local SQLite on app startup
  useEffect(() => {
    getLocalDb().catch((err) => {
      console.error('Failed to initialize local SQLite database:', err);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SyncProvider>
          <NutritionProvider>
            <TrainingProvider>
              <HealthProvider>
                <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                <RootNavigator />
              </HealthProvider>
            </TrainingProvider>
          </NutritionProvider>
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/** Waits for fonts and the saved appearance and language, so the first frame is already right. */
function Gate() {
  const [fontsLoaded, fontError] = useFonts(fonts);
  const { ready: themeReady } = useThemePreference();
  const { ready: languageReady } = useLanguagePreference();
  const colors = useThemeColors();

  if ((!fontsLoaded && !fontError) || !themeReady || !languageReady) {
    // Matches the splash background so there is no flash of a different colour.
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors['brand-deep'],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors['brand-mint']} />
      </View>
    );
  }
  return <AppShell />;
}

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <Gate />
      </ThemeProvider>
    </I18nProvider>
  );
}
