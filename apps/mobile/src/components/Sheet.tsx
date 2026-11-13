import { sizes, space as spacing } from '@diade/design-tokens';
import type React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../design';

/**
 * A bottom sheet over the current screen: the dimmed screen above it stays visible, and tapping it,
 * the close button or Android back dismisses. The children scroll under a fixed title row.
 */
export const Sheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
}> = ({ visible, onClose, title, closeLabel, children }) => (
  <Modal
    visible={visible}
    animationType="slide"
    transparent
    statusBarTranslucent
    onRequestClose={onClose}
  >
    <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      {/* Tapping the dimmed screen above the sheet closes it. */}
      <Pressable
        className="flex-1"
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
      />
      <View
        className="bg-bg"
        style={{
          height: '90%',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: 'hidden',
        }}
      >
        <SafeAreaView className="flex-1" edges={['bottom']}>
          <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
            <Text className="flex-1 mr-3 text-title-1 font-bold text-ink" numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              hitSlop={8}
              className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center"
            >
              <Icon name="x" size={sizes['icon-md']} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing[4],
              paddingTop: spacing[4],
              paddingBottom: spacing[8],
            }}
            // Screens opened from a sheet are Modals inside this ScrollView in the React tree, so without this
            // it takes the first tap while their keyboard is up and only closes the keyboard.
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </View>
  </Modal>
);
