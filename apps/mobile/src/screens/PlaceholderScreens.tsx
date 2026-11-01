import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const CalendarScreen: React.FC = () => (
  <SafeAreaView className="flex-1 bg-canvas p-6">
    <Text className="text-2xl font-bold text-ink mb-2">Shared Calendar</Text>
    <Text className="text-sm text-ink-muted mb-6">
      Shared and personal events, recurring dates, and Google Calendar sync.
    </Text>
    <View className="bg-surface rounded-2xl p-6 border border-border items-center justify-center py-16">
      <Text className="text-sm text-ink-muted">Coming in Milestone 2</Text>
    </View>
  </SafeAreaView>
);

export const ListsScreen: React.FC = () => (
  <SafeAreaView className="flex-1 bg-canvas p-6">
    <Text className="text-2xl font-bold text-ink mb-2">Shared Lists</Text>
    <Text className="text-sm text-ink-muted mb-6">
      Groceries, pharmacy, packing, and reusable household templates.
    </Text>
    <View className="bg-surface rounded-2xl p-6 border border-border items-center justify-center py-16">
      <Text className="text-sm text-ink-muted">Coming in Milestone 2</Text>
    </View>
  </SafeAreaView>
);

export const HomeScreen: React.FC = () => (
  <SafeAreaView className="flex-1 bg-canvas p-6">
    <Text className="text-2xl font-bold text-ink mb-2">Household &amp; Tasks</Text>
    <Text className="text-sm text-ink-muted mb-6">
      Shared tasks, chore coordination, and household maintenance.
    </Text>
    <View className="bg-surface rounded-2xl p-6 border border-border items-center justify-center py-16">
      <Text className="text-sm text-ink-muted">Coming in Milestone 2</Text>
    </View>
  </SafeAreaView>
);

export const UsScreen: React.FC = () => (
  <SafeAreaView className="flex-1 bg-canvas p-6">
    <Text className="text-2xl font-bold text-ink mb-2">Us &amp; Memories</Text>
    <Text className="text-sm text-ink-muted mb-6">
      Important dates, relationship milestones, and shared notes.
    </Text>
    <View className="bg-surface rounded-2xl p-6 border border-border items-center justify-center py-16">
      <Text className="text-sm text-ink-muted">Coming in Milestone 2</Text>
    </View>
  </SafeAreaView>
);
