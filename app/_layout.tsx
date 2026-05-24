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
        // Заставляем сам движок Expo скачать шрифты из интернета, минуя локальную сборку
        await Font.loadAsync({
          Ionicons: 'https://unpkg.com/@expo/vector-icons@14.0.2/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf',
          Feather: 'https://unpkg.com/@expo/vector-icons@14.0.2/build/vendor/react-native-vector-icons/Fonts/Feather.ttf',
          FontAwesome: 'https://unpkg.com/@expo/vector-icons@14.0.2/build/vendor/react-native-vector-icons/Fonts/FontAwesome.ttf',
          MaterialIcons: 'https://unpkg.com/@expo/vector-icons@14.0.2/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf',
        });
        setFontsLoaded(true);
      } catch (e) {
        console.warn('Ошибка загрузки шрифтов:', e);
        setFontsLoaded(true); 
      }
    }
    
    loadFonts();
  }, []);

  // Ждем загрузки шрифтов
  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack 
        screenOptions={{ 
          headerShown: false,
          gestureEnabled: true, 
          animation: 'slide_from_right' 
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="statistics" />
        <Stack.Screen name="shop" />
      </Stack>
    </GestureHandlerRootView>
  );
}