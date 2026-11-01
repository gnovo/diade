import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { AuthScreen } from '../screens/AuthScreen';
import { SpaceSetupScreen } from '../screens/SpaceSetupScreen';
import { TabNavigator } from './TabNavigator';
import { useThemeColors } from '../design';

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
      {!user ? (
        <AuthScreen />
      ) : !space ? (
        <SpaceSetupScreen />
      ) : (
        <TabNavigator />
      )}
    </NavigationContainer>
  );
};
