import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// Импортируем самые ходовые наборы иконок, чтобы они правильно рендерились в вебе
import { Feather, FontAwesome, Ionicons, MaterialIcons } from '@expo/vector-icons';
import '../global.css';

export default function RootLayout() {
  // Подгружаем шрифты иконок перед запуском интерфейса
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...Feather.font,
    ...FontAwesome.font,
    ...MaterialIcons.font,
  });

  // Пока шрифты полностью не скачаются браузером, держим экран пустым,
  // чтобы пользователь не видел уродливые квадраты вместо красивых иконок
  if (!fontsLoaded) {
    return null;
  }

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