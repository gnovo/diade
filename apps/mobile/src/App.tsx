import '../global.css';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import { SyncProvider } from './sync/SyncProvider';
import { RootNavigator } from './navigation/RootNavigator';
import { getLocalDb } from './storage/sqlite';
import { I18nProvider, useLanguagePreference } from './i18n';
import { ThemeProvider, useScheme, useThemeColors, useThemePreference } from './design';

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
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <RootNavigator />
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
      <View style={{ flex: 1, backgroundColor: colors['brand-deep'], alignItems: 'center', justifyContent: 'center' }}>
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
