import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, DeviceEventEmitter, LayoutAnimation, Platform, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TAB_ICONS: Record<string, any> = {
  index: 'home',
  status: 'check-square-o',
  profile: 'user',
};

const TAB_LABELS: Record<string, string> = {
  index: 'Главная',
  status: 'Журнал',
  profile: 'Профиль',
};

const VISUAL_ORDER = ['index', 'status', 'profile'];

function CustomTabBar({ state, navigation, badgeCount }: any) {
  const mainTabs = state.routes
    .filter((r: any) => VISUAL_ORDER.includes(r.name))
    .sort((a: any, b: any) => VISUAL_ORDER.indexOf(a.name) - VISUAL_ORDER.indexOf(b.name));

  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('toggleTabBar', (visible: boolean) => {
      Animated.timing(translateY, {
        toValue: visible ? 0 : 120,
        duration: 200, 
        useNativeDriver: true, 
      }).start();
    });

    return () => subscription.remove();
  }, []);

  return (
    <Animated.View style={[styles.customTabBarWrapper, { transform: [{ translateY }] }]}>
      
      <View style={styles.pillContainer}>
        {mainTabs.map((route: any) => {
          const isFocused = state.routes[state.index].name === route.name;
          const iconName = TAB_ICONS[route.name];
          const label = TAB_LABELS[route.name];

          const onPress = () => {
            if (!isFocused) {
              Haptics.selectionAsync(); 
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={[styles.pillTab, isFocused && styles.pillTabActive]}
              onPress={onPress}
              activeOpacity={0.8}
            >
              <View style={[styles.tabContent, isFocused && styles.activeTabContent]}>
                
                <View style={styles.iconContainer}>
                  <FontAwesome
                    name={iconName}
                    size={22} 
                    color={isFocused ? '#1A1A1A' : '#888'} 
                  />
                  
                  {route.name === 'status' && badgeCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{badgeCount}</Text>
                    </View>
                  )}
                </View>

                {isFocused && (
                  <Text style={styles.activeTabText} numberOfLines={1}>
                    {label}
                  </Text>
                )}
                
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.fabContainer}
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
          navigation.navigate('add');
        }}
      >
        <FontAwesome name="plus" size={24} color="#FFF" />
      </TouchableOpacity>
      
    </Animated.View>
  );
}

export default function TabLayout() {
  const [badgeCount, setBadgeCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    const fetchBadgeCount = async () => {
      try {
        const name = await AsyncStorage.getItem('user_name');
        const room = await AsyncStorage.getItem('room_id');
        if (!name || !room) return;

        const { count, error } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room)
          .eq('status', 'pending_approval')
          .neq('assignee', name);

        if (!error) {
          setBadgeCount(count && count > 0 ? count : undefined);
        }
      } catch (e) {
        console.error('Ошибка бейджика:', e);
      }
    };

    fetchBadgeCount();
    const interval = setInterval(fetchBadgeCount, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Tabs 
      initialRouteName="index" 
      tabBar={(props) => <CustomTabBar {...props} badgeCount={badgeCount} />}
      screenOptions={{ 
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          elevation: 0, 
          backgroundColor: 'transparent',
          borderTopWidth: 0,
        }
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="status" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="add" />
      
      <Tabs.Screen name="gallery" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="registry" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  customTabBarWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 30 : 20,
    left: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    elevation: 0,
  },
  pillContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF', 
    borderRadius: 30,
    height: 60,
    paddingHorizontal: 8,
    marginRight: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5, 
  },
  pillTab: {
    flex: 1, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTabActive: {
    flex: 2, 
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 0,
  },
  activeTabContent: {
    backgroundColor: '#F0F0F0', 
    paddingHorizontal: 16,
  },
  iconContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTabText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  fabContainer: {
    width: 60, 
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
    includeFontPadding: false,
  }
});