import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const generateShortCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  };

  const handleLogin = async () => {
    setError('');
    
    if (!name.trim()) { setError('Введи своё имя'); return; }
    if (isJoining && !room.trim()) { setError('Введи код дома'); return; }
    if (!gender) { setError('Выбери свой пол'); return; }

    setLoading(true);
    let finalRoomId = '';

    if (isJoining) {
      finalRoomId = room.toUpperCase().trim();
      const { data: roomData } = await supabase.from('rooms').select('id').eq('id', finalRoomId).single();
      if (!roomData) {
        setError('Дом не найден. Проверь код.');
        setLoading(false);
        return;
      }
    } else {
      finalRoomId = generateShortCode();
      const { error: insertRoomError } = await supabase.from('rooms').insert([{ id: finalRoomId }]);
      if (insertRoomError) {
        setError('Не удалось создать дом.');
        setLoading(false);
        return;
      }
    }

    const cleanName = name.trim();

    const { data: existingProfile } = await supabase
      .from('profiles').select('id').eq('name', cleanName).eq('room_id', finalRoomId).maybeSingle();

    let userId = existingProfile?.id;

    if (!existingProfile) {
      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert([{ name: cleanName, room_id: finalRoomId, points: 0, tasks_done: 0, gender }])
        .select('id').single();

      if (profileError || !newProfile) {
        setError('Не удалось создать профиль.');
        setLoading(false);
        return;
      }
      userId = newProfile.id;
    }

    await AsyncStorage.setItem('user_name', cleanName);
    await AsyncStorage.setItem('room_id', finalRoomId);
    await AsyncStorage.setItem('user_id', String(userId));
    await AsyncStorage.setItem('user_gender', gender as string);

    setLoading(false);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 🪄 Умная обертка для работы с клавиатурой */}
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView 
            contentContainerStyle={styles.scrollContent} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.inner}>

              {/* Логотип */}
              <View style={styles.logoWrap}>
                <Text style={styles.logoTitle}>HomeApp</Text>
                <Text style={styles.logoSub}>
                  {isJoining ? 'Присоединись к дому' : 'Создай своё пространство'}
                </Text>
              </View>

              {/* Карточка */}
              <View style={styles.card}>

                {/* Имя */}
                <Text style={styles.label}>Твоё имя</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Имя"
                  placeholderTextColor="#B0B0B0"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />

                {/* Код дома (Идет вторым, если мы присоединяемся) */}
                {isJoining && (
                  <>
                    <Text style={styles.label}>Код дома</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Спроси у создателя"
                      placeholderTextColor="#B0B0B0"
                      value={room}
                      onChangeText={setRoom}
                      autoCapitalize="characters"
                    />
                  </>
                )}

                {/* Выбор пола */}
                <Text style={styles.label}>Твой пол</Text>
                <View style={styles.genderRow}>
                  <TouchableOpacity
                    style={[styles.genderBtn, gender === 'male' && styles.genderBtnActive]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setGender('male');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.genderText, gender === 'male' && styles.genderTextActive]}>Мужской</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.genderBtn, gender === 'female' && styles.genderBtnActive]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setGender('female');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.genderText, gender === 'female' && styles.genderTextActive]}>Женский</Text>
                  </TouchableOpacity>
                </View>

                {/* Ошибка */}
                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {/* Главная Кнопка */}
                <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.8} disabled={loading}>
                  {loading
                    ? <ActivityIndicator color="#FFF" />
                    : <Text style={styles.buttonText}>{isJoining ? 'Войти в дом' : 'Создать дом'}</Text>
                  }
                </TouchableOpacity>

              </View>

              {/* Переключатель режимов */}
              <TouchableOpacity 
                onPress={() => { 
                  Keyboard.dismiss();
                  setIsJoining(!isJoining); 
                  setError(''); 
                }} 
                style={styles.switchButton}
              >
                <Text style={styles.switchText}>
                  {isJoining ? 'Создать новый дом' : 'Уже есть код дома? Войти'}
                </Text>
              </TouchableOpacity>

            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  scrollContent: { flexGrow: 1 },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', paddingVertical: 40 },

  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logoTitle: { fontSize: 34, fontWeight: '900', color: '#2C2C2E', letterSpacing: -0.5, marginBottom: 6 },
  logoSub: { fontSize: 16, color: '#8E8E93', textAlign: 'center', fontWeight: '500' },

  card: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 24, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3,
    marginBottom: 20
  },

  label: { fontSize: 12, fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },

  input: {
    backgroundColor: '#F8F9FA', padding: 18, borderRadius: 16,
    fontSize: 16, color: '#2C2C2E', borderWidth: 1, borderColor: '#EAEAEA',
  },

  genderRow: { flexDirection: 'row', gap: 12 },
  genderBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EAEAEA', backgroundColor: '#F8F9FA',
  },
  genderBtnActive: { borderColor: '#2C2C2E', backgroundColor: '#2C2C2E' },
  genderText: { fontSize: 15, fontWeight: '600', color: '#888' },
  genderTextActive: { color: '#FFF' },

  errorBox: { backgroundColor: '#FFEBEB', borderRadius: 14, padding: 16, marginTop: 4 },
  errorText: { fontSize: 14, color: '#FF3B30', fontWeight: '600', textAlign: 'center' },

  button: {
    backgroundColor: '#2C2C2E', padding: 18, borderRadius: 16,
    alignItems: 'center', marginTop: 12,
  },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  switchButton: { alignItems: 'center', paddingVertical: 12 },
  switchText: { color: '#8E8E93', fontSize: 15, fontWeight: '600' },
});