import React from 'react';
import { useTranslation } from 'react-i18next';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TodayScreen } from '../screens/TodayScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { SyncOverlay } from '../components/SyncOverlay';
import { ListsScreen } from '../screens/ListsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { UsScreen } from '../screens/UsScreen';
import { Icon, type IconName, useThemeColors } from '../design';
import { sizes } from '@diade/design-tokens';

const Tab = createBottomTabNavigator();

/** Handover §6: bottom tab bar with a filled `action` pill behind the selected icon. */
const tabIcons: Record<string, IconName> = {
  Today: 'calendar-check',
  Calendar: 'calendar',
  Lists: 'shopping-basket',
  Home: 'house',
  Us: 'users',
};

const TAB_BAR_CONTENT_HEIGHT = 56;
const TAB_BAR_MIN_BOTTOM_PADDING = 8;

export const TabNavigator: React.FC = () => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  // Read the device's bottom inset (Android gesture bar, iPhone home indicator) so the bar
  // sits above it. A fixed height would ignore the inset.
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, TAB_BAR_MIN_BOTTOM_PADDING);

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors['ink-muted'],
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: TAB_BAR_CONTENT_HEIGHT + bottomPadding,
            paddingTop: 8,
            paddingBottom: bottomPadding,
          },
          tabBarItemStyle: { paddingVertical: 0 },
          tabBarLabelStyle: {
            fontFamily: 'PlusJakartaSans_600SemiBold',
            fontSize: 12,
            lineHeight: 16,
            letterSpacing: 0.12,
          },
          tabBarIcon: ({ focused }) => (
            <View
              className={`w-14 h-8 rounded-full items-center justify-center ${focused ? 'bg-action' : ''}`}
            >
              <Icon
                name={tabIcons[route.name] ?? 'house'}
                size={sizes['icon-lg']}
                color={focused ? colors['on-action'] : colors['ink-muted']}
              />
            </View>
          ),
        })}
      >
        <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarLabel: t('nav.today') }} />
        <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarLabel: t('nav.calendar') }} />
        <Tab.Screen name="Lists" component={ListsScreen} options={{ tabBarLabel: t('nav.lists') }} />
        <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('nav.home') }} />
        <Tab.Screen name="Us" component={UsScreen} options={{ tabBarLabel: t('nav.us') }} />
      </Tab.Navigator>
      <SyncOverlay />
    </View>
  );
};

export type { BottomTabBarProps };
