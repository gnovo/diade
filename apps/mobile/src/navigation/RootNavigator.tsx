import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { AuthScreen } from '../screens/AuthScreen';
import { SpaceSetupScreen } from '../screens/SpaceSetupScreen';
import { TabNavigator } from './TabNavigator';

export const RootNavigator: React.FC = () => {
  const { user, space, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator size="large" color="#0D4F46" />
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
