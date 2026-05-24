import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../global.css';
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack 
        screenOptions={{ 
          headerShown: false,
          // 🪄 ГЛОБАЛЬНАЯ МАГИЯ: включаем нативные свайпы для ВСЕХ экранов приложения
          gestureEnabled: true, 
          // Задаем красивую нативную анимацию перехода по умолчанию
          animation: 'slide_from_right' 
        }}
      >
        {/* Главный экран с табами (с него свайпать назад некуда) */}
        <Stack.Screen name="(tabs)" />
        
        {/* Экраны, которые открываются поверх табов и поддерживают свайп назад */}
        <Stack.Screen name="statistics" />
        <Stack.Screen name="shop" />
      </Stack>
    </GestureHandlerRootView>
  );
}