import * as Font from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../global.css';

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    async function loadFonts() {
      try {
        // Качаем вообще все паки иконок напрямую через интернет
        await Font.loadAsync({
          Ionicons: 'https://unpkg.com/@expo/vector-icons@14.0.2/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf',
          Feather: 'https://unpkg.com/@expo/vector-icons@14.0.2/build/vendor/react-native-vector-icons/Fonts/Feather.ttf',
          FontAwesome: 'https://unpkg.com/@expo/vector-icons@14.0.2/build/vendor/react-native-vector-icons/Fonts/FontAwesome.ttf',
          MaterialIcons: 'https://unpkg.com/@expo/vector-icons@14.0.2/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf',
          MaterialCommunityIcons: 'https://unpkg.com/@expo/vector-icons@14.0.2/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf',
          AntDesign: 'https://unpkg.com/@expo/vector-icons@14.0.2/build/vendor/react-native-vector-icons/Fonts/AntDesign.ttf',
        });
        setFontsLoaded(true);
      } catch (e) {
        console.warn('Ошибка загрузки шрифтов:', e);
        setFontsLoaded(true); 
      }
    }
    
    loadFonts();
  }, []);

  // Пока всё не скачается — интерфейс не показываем, чтобы не было квадратов
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