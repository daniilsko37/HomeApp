import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.72;

// 🪄 Обновили фразы с переносами строк и списком задач
const BOTS = [
  {
    id: 'sir_blesk',
    username: 'sir_shine_bot',
    name: 'Сэр Блеск',
    emoji: '🎩',
    color: '#5C6BC0',
    bg: '#F0F4FF',
    description: 'Благородный дворецкий. Напомнит о делах с достоинством и лёгкой иронией.',
    phrasesNew: {
      male: 'Сэр, порядок — это не конечная точка, это ежедневный бой. Наш тактический манёвр сегодня:\n- Пропылесосить\n- Протри пыль',
      female: 'Мисс, дом всегда расцветает от вашего прикосновения.\nНа сегодня запланировано:\n- Пропылесосить\n- Протри пыль',
    },
    phrasesPenalty: {
      male: 'Смею напомнить, что просроченные дела обходятся нам слишком дорого.',
      female: 'Поверьте, я бы предпочёл только начислять баллы, но правила есть правила.',
    },
  },
  {
    id: 'tyler',
    username: 'tailer_derner_bot',
    name: 'Тайлер',
    emoji: '🧨',
    color: '#E53935',
    bg: '#FFF0EF',
    description: 'Никаких церемоний. Уборка для него — это вопрос дисциплины, а не настроения.',
    phrasesNew: {
      male: 'Обрастая вещами, ты попадаешь к ним в рабство. Вот тебе задание:\n- Пропылесосить\n- Протри пыль',
      female: 'Обрастая вещами, ты попадаешь к ним в рабство. Вот тебе задание:\n- Пропылесосить\n- Протри пыль',
    },
    phrasesPenalty: {
      male: '⚠️ Химический ожог \nПочувствуй эту боль — это штраф за просроченные задачи.',
      female: '⚠️ Химический ожог \nПочувствуй эту боль — это штраф за просроченные задачи.',
    },
  },
];

function generateToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function BotSelectionScreen() {
  const router = useRouter();

  const [connectedBotId, setConnectedBotId] = useState<string | null>(null);
  const [loadingBotId, setLoadingBotId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  
  const [activeIndex, setActiveIndex] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const id = await AsyncStorage.getItem('user_id');
      const g = await AsyncStorage.getItem('user_gender');
      if (!id) return;
      setUserId(id);
      if (g === 'female') setGender('female');

      const { data } = await supabase
        .from('profiles')
        .select('telegram_chat_id, selected_bot')
        .eq('id', id)
        .single();

      if (data?.telegram_chat_id && data?.selected_bot) {
        setConnectedBotId(data.selected_bot);
      }
    };
    init();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const disconnect = async () => {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await supabase
      .from('profiles')
      .update({ telegram_chat_id: null, telegram_username: null, selected_bot: null })
      .eq('id', userId);
    await AsyncStorage.removeItem('settings_bot');
    setConnectedBotId(null);
  };

  const connect = async (bot: typeof BOTS[0]) => {
    if (!userId) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLoadingBotId(bot.id);

      if (connectedBotId && connectedBotId !== bot.id) {
        await supabase
          .from('profiles')
          .update({ telegram_chat_id: null, telegram_username: null, selected_bot: null })
          .eq('id', userId);
        setConnectedBotId(null);
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await supabase
        .from('profiles')
        .update({ connect_token: token, connect_token_expires_at: expiresAt })
        .eq('id', userId);

      await Linking.openURL(`https://t.me/${bot.username}?start=${token}`);

      pollRef.current = setInterval(async () => {
        const { data } = await supabase
          .from('profiles')
          .select('telegram_chat_id, telegram_username')
          .eq('id', userId)
          .single();

        if (data?.telegram_chat_id) {
          clearInterval(pollRef.current!);
          clearTimeout(timeoutRef.current!);
          await AsyncStorage.setItem('settings_bot', bot.name);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setConnectedBotId(bot.id);
          setLoadingBotId(null);
        }
      }, 2000);

      timeoutRef.current = setTimeout(() => {
        clearInterval(pollRef.current!);
        setLoadingBotId(null);
      }, 15 * 60 * 1000);

    } catch (e) {
      setLoadingBotId(null);
    }
  };

  const handleScroll = (event: any) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / (CARD_WIDTH + 16));
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  const renderBotCard = ({ item }: { item: typeof BOTS[0] }) => {
    const isConnected = connectedBotId === item.id;
    const isLoading = loadingBotId === item.id;
    const isOtherConnected = connectedBotId !== null && connectedBotId !== item.id;
    const phraseNew = item.phrasesNew[gender];
    const phrasePenalty = item.phrasesPenalty[gender];

    return (
      <View style={[
        styles.botCard,
        { width: CARD_WIDTH, height: CARD_HEIGHT },
        isConnected && { borderColor: item.color },
      ]}>
        <View style={styles.cardTop}>
          
          <View style={[styles.botCardEmoji, { backgroundColor: item.bg }]}>
            <Text style={styles.botCardEmojiText}>{item.emoji}</Text>
          </View>

          <Text style={[styles.botCardName, { color: item.color }]}>{item.name}</Text>
          <Text style={styles.botCardDesc}>{item.description}</Text>

          <View style={styles.chatPreview}>
            <View style={styles.chatBubble}>
              <Text style={styles.phraseText}>{phraseNew}</Text>
              <Text style={styles.bubbleTime}>09:00</Text>
            </View>

            <View style={[styles.chatBubble, { marginTop: 6 }]}>
              <Text style={styles.phraseText}>{phrasePenalty}</Text>
              <Text style={styles.bubbleTime}>14:30</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardBottom}>
          {isLoading && (
            <Text style={styles.waitingText}>Открой Telegram и нажми «Запустить»</Text>
          )}
          {isConnected ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: item.color, backgroundColor: '#FFF' }]}
              onPress={disconnect}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnOutlineText, { color: item.color }]}>Отключить</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: item.color }]}
              onPress={() => connect(item)}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnText}>
                  {isOtherConnected ? 'Переключиться' : 'Подключить'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={32} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Выбери ассистента</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <FlatList
          data={BOTS}
          renderItem={renderBotCard}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + 16} 
          decelerationRate="fast"
          contentContainerStyle={styles.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />
        
        <View style={styles.pagination}>
          {BOTS.map((bot, index) => (
            <View
              key={bot.id}
              style={[
                styles.dot,
                activeIndex === index && styles.dotActive
              ]}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10, 
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', marginLeft: -8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' },
  
  body: { flex: 1 },
  listContent: {
    paddingLeft: 24, 
    paddingRight: 8, 
    paddingTop: 10, 
    paddingBottom: 10 
  },

  botCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    justifyContent: 'space-between',
    marginRight: 16, 
    borderWidth: 3, 
    borderColor: '#F0F0F0', 
    shadowColor: '#8E8E93',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2, 
  },

  cardTop: { alignItems: 'center', gap: 10 },
  cardBottom: { gap: 8 },

  botCardEmoji: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4, 
  },
  botCardEmojiText: { fontSize: 40 },
  botCardName: { fontSize: 24, fontWeight: '900', marginBottom: 2 }, 
  botCardDesc: { 
    fontSize: 13, 
    color: '#8E8E93', 
    textAlign: 'center', 
    lineHeight: 18, 
    paddingHorizontal: 10, 
    marginBottom: 16 
  },

  chatPreview: { alignSelf: 'stretch', marginTop: 2 },
  
  chatBubble: {
    backgroundColor: '#F2F2F7', 
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8, 
    borderRadius: 18,
    borderBottomLeftRadius: 4, 
    alignSelf: 'flex-start',
    maxWidth: '95%',
  },
  phraseText: { fontSize: 14, color: '#2C2C2E', lineHeight: 20 },
  bubbleTime: {
    fontSize: 10,
    color: '#8E8E93',
    alignSelf: 'flex-end',
    marginTop: 4,
    fontWeight: '500',
  },

  btn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  btnOutline: { borderWidth: 1.5, backgroundColor: '#FFF' },
  btnOutlineText: { fontSize: 16, fontWeight: '700' },

  waitingText: { fontSize: 13, color: '#8E8E93', textAlign: 'center', fontWeight: '500' },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D1D6', 
  },
  dotActive: {
    backgroundColor: '#1A1A1A', 
  },
});