import '../global.css';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './context/AuthContext';
import { RootNavigator } from './navigation/RootNavigator';
import { getLocalDb } from './storage/sqlite';

export default function App() {
  // Pre-warm local SQLite on app startup
  useEffect(() => {
    getLocalDb().catch((err) => {
      console.error('Failed to initialize local SQLite database:', err);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
