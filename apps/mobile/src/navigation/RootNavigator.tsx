import { NavigationContainer } from '@react-navigation/native';
import type React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useThemeColors } from '../design';
import { AuthScreen } from '../screens/AuthScreen';
import { SpaceSetupScreen } from '../screens/SpaceSetupScreen';
import { TabNavigator } from './TabNavigator';

export const RootNavigator: React.FC = () => {
  const { user, space, isLoading } = useAuth();
  const colors = useThemeColors();

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator size="large" color={colors.action} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? <AuthScreen /> : !space ? <SpaceSetupScreen /> : <TabNavigator />}
    </NavigationContainer>
  );
};
