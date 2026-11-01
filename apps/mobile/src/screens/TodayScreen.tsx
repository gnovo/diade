import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

export const TodayScreen: React.FC = () => {
  const { space } = useAuth();

  const [captureInput, setCaptureInput] = useState('');
  const [tasks, setTasks] = useState([
    { id: '1', title: 'Pick up prescription', assignee: 'Gonçalo', isDone: false },
    { id: '2', title: 'Water balcony plants', assignee: 'Both', isDone: false },
    { id: '3', title: 'Take out recycling', assignee: 'Both', isDone: true },
  ]);

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isDone: !t.isDone } : t)),
    );
  };

  const handleQuickCapture = () => {
    if (!captureInput.trim()) return;
    Alert.alert('Captured!', `"${captureInput.trim()}" saved to your shared inbox.`);
    setCaptureInput('');
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Top Header */}
        <View className="flex-row items-center justify-between mb-6">
          <View>
            <Text className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
              SUNDAY, 1 NOVEMBER
            </Text>
            <Text className="text-2xl font-bold text-ink">Today</Text>
          </View>

          {/* Partner Avatar / Presence */}
          <View className="flex-row items-center bg-surface px-3 py-1.5 rounded-full border border-border">
            <View className="w-6 h-6 rounded-full bg-secondary items-center justify-center mr-2">
              <Text className="text-xs font-bold text-primary">L</Text>
            </View>
            <View className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
            <Text className="text-xs font-medium text-ink-muted">{space?.name || 'Space'}</Text>
          </View>
        </View>

        {/* Global Quick Capture Bar */}
        <View className="bg-surface rounded-full border border-border px-4 py-2.5 flex-row items-center mb-6 shadow-sm">
          <TouchableOpacity
            onPress={handleQuickCapture}
            className="w-7 h-7 rounded-full bg-primary items-center justify-center mr-3"
          >
            <Text className="text-white font-bold text-sm leading-none">+</Text>
          </TouchableOpacity>
          <TextInput
            value={captureInput}
            onChangeText={setCaptureInput}
            onSubmitEditing={handleQuickCapture}
            placeholder="Capture an event, task or note…"
            placeholderTextColor="#94A3B8"
            returnKeyType="done"
            className="flex-1 text-ink text-sm py-0"
          />
        </View>

        {/* Section 1: Upcoming Event */}
        <View className="bg-surface rounded-2xl p-5 border border-border mb-5 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-bold text-ink-muted tracking-wider uppercase">
              UPCOMING EVENT
            </Text>
            <View className="bg-surface-subtle px-2 py-0.5 rounded border border-border">
              <Text className="text-xs font-medium text-primary">Shared</Text>
            </View>
          </View>

          <Text className="text-lg font-bold text-ink mb-1">Anniversary Dinner</Text>
          <Text className="text-sm text-ink-muted">19:30 · Osteria del Sole</Text>
        </View>

        {/* Section 2: Tasks Due Soon */}
        <View className="bg-surface rounded-2xl p-5 border border-border mb-5 shadow-sm">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xs font-bold text-ink-muted tracking-wider uppercase">
              TASKS DUE SOON
            </Text>
            <Text className="text-xs font-medium text-ink-muted">
              {tasks.filter((t) => !t.isDone).length} remaining
            </Text>
          </View>

          {tasks.map((task, index) => (
            <View key={task.id}>
              {index > 0 && <View className="h-px bg-border my-3" />}
              <TouchableOpacity
                onPress={() => toggleTask(task.id)}
                activeOpacity={0.7}
                className="flex-row items-center justify-between"
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <View
                    className={`w-5 h-5 rounded border items-center justify-center mr-3 ${
                      task.isDone ? 'bg-primary border-primary' : 'border-border bg-surface'
                    }`}
                  >
                    {task.isDone && <Text className="text-white text-xs font-bold">✓</Text>}
                  </View>
                  <Text
                    className={`text-sm ${
                      task.isDone ? 'text-ink-muted line-through' : 'text-ink font-medium'
                    }`}
                  >
                    {task.title}
                  </Text>
                </View>

                <View className="bg-canvas px-2 py-0.5 rounded">
                  <Text className="text-xs text-ink-muted">{task.assignee}</Text>
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Section 3: Shared Shopping Glance */}
        <View className="bg-surface rounded-2xl p-5 border border-border mb-8 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-bold text-ink-muted tracking-wider uppercase">
              SHOPPING · GROCERIES
            </Text>
            <Text className="text-xs font-medium text-primary font-semibold">4 items</Text>
          </View>

          <View className="flex-row flex-wrap gap-2 mb-3">
            <View className="bg-surface-subtle border border-border px-3 py-1.5 rounded-full">
              <Text className="text-xs font-medium text-ink">Oat milk</Text>
            </View>
            <View className="bg-surface-subtle border border-border px-3 py-1.5 rounded-full">
              <Text className="text-xs font-medium text-ink">Coffee</Text>
            </View>
            <View className="bg-surface-subtle border border-border px-3 py-1.5 rounded-full">
              <Text className="text-xs font-medium text-ink">Avocados</Text>
            </View>
            <View className="bg-canvas border border-border px-3 py-1.5 rounded-full">
              <Text className="text-xs text-ink-muted">+1 more</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
