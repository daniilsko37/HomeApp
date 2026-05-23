import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

// 5 цветов для карточек
const TASK_TYPES = [
  { id: 'green', color: '#2ECC71' },
  { id: 'yellow', color: '#FFD166' },
  { id: 'violet', color: '#B19CD9' },
  { id: 'orange', color: '#F4A261' },
  { id: 'blue', color: '#4CC9F0' }
];

// Подсказки
const TASK_HINTS: Record<string, { title: string, desc: string }> = {
  green: { title: 'Автоматическая', desc: 'Сама появляется на главном экране по расписанию.' },
  yellow: { title: 'Ручная (по запросу)', desc: 'Без расписания, вызывается вручную через плюсик на главном экране.' },
  violet: { title: 'Готовка', desc: 'Ручная задача специально для кулинарных дел. Вызывается через плюсик на главном экране.' },
  orange: { title: 'Разовая', desc: 'Появляется сразу, а после выполнения навсегда исчезает из базы.' },
  blue: { title: 'Редкая задача', desc: 'Работает как зеленая, но создана для тяжелых или нечастых дел.' }
};

export default function AddScreen() {
  const [taskType, setTaskType] = useState('green'); 
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState('');
  const [description, setDescription] = useState(''); 
  const [startDate, setStartDate] = useState(''); 
  const [frequency, setFrequency] = useState(''); 
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null); 
  const [loading, setLoading] = useState(false);
  
  // 🪄 Стейты для нашей кастомной плашки-уведомления
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const router = useRouter();
  const expandAnim = useRef(new Animated.Value(1)).current;

  const requiresDate = taskType === 'green' || taskType === 'blue';
  const activeColor = TASK_TYPES.find(t => t.id === taskType)?.color || '#2ECC71';

  const getBadgeStyle = () => {
    switch (taskType) {
      case 'yellow': return { text: '#333', placeholder: '#666' }; 
      case 'violet': return { text: '#fff', placeholder: '#E0E0E0' }; 
      default: return { text: '#fff', placeholder: 'rgba(255, 255, 255, 0.6)' };
    }
  };
  const badgeStyle = getBadgeStyle();

  const generateTaskId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  };

  const handleDateChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '.' + cleaned.slice(2);
    if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '.' + cleaned.slice(4, 8);
    setStartDate(formatted);
  };

  // 🪄 Функция вызова исчезающей плашки
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    
    setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setToastVisible(false));
    }, 2500); // Плашка висит 2.5 секунды и плавно исчезает
  };

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], 
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3, 
      base64: true, 
    });
    
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || null); 
    }
  };

  const handleTypeSelect = (id: string) => {
    Haptics.selectionAsync(); 
    setTaskType(id);
    const needsSettings = id === 'green' || id === 'blue';
    
    Animated.timing(expandAnim, {
      toValue: needsSettings ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const handleCreateTask = async () => {
    // 🪄 Вместо Alert используем наш кастомный Toast
    if (!title) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); 
      return showToast('Введи название задачи!');
    }
    
    if (requiresDate && (!startDate || startDate.length !== 10)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); 
      return showToast('Введи дату старта (ДД.ММ.ГГГГ)');
    }

    try {
      setLoading(true);
      const roomId = await AsyncStorage.getItem('room_id');
      const descArray = description.split('\n').filter(item => item.trim() !== '');

      let finalImageUrl = null;

      if (imageBase64) {
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        
        const { data, error } = await supabase.storage
          .from('task-images')
          .upload(fileName, decode(imageBase64), { contentType: 'image/jpeg' });
          
        if (error) throw new Error('Не удалось загрузить картинку');
        
        const { data: publicUrlData } = supabase.storage.from('task-images').getPublicUrl(fileName);
        finalImageUrl = publicUrlData.publicUrl;
      }

      let initialStatus = 'todo';
      let dbDateStr = null;
      let freq = 0;

      if (requiresDate) {
        const [d, m, y] = startDate.split('.');
        dbDateStr = `${y}-${m}-${d}`;
        freq = parseInt(frequency) || 0;
        
        const taskDate = new Date(`${dbDateStr}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (freq > 0) {
          if (taskDate > today) initialStatus = 'done';
          else if (taskDate < today) {
            const nextRun = new Date(taskDate);
            nextRun.setDate(taskDate.getDate() + freq);
            initialStatus = nextRun > today ? 'done' : 'todo';
          }
        }
      } else if (taskType === 'yellow' || taskType === 'violet') {
        initialStatus = 'idle';
      } else if (taskType === 'orange') {
        initialStatus = 'todo'; 
      }

      const { error } = await supabase.from('tasks').insert([{ 
          id: generateTaskId(), title: title, points: parseInt(points) || 0, status: initialStatus, type: taskType, description: descArray, room_id: roomId, image_url: finalImageUrl, start_date: dbDateStr, frequency_days: freq 
      }]);

      if (error) throw error;
      
      setTitle(''); setPoints(''); setDescription(''); setStartDate(''); setFrequency(''); setImageUri(null); setImageBase64(null); setTaskType('green');
      expandAnim.setValue(1);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); 
      router.replace('/(tabs)');
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); 
      showToast('Не получилось создать задачу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        
        {/* 🪄 САМА ПЛАШКА */}
        {toastVisible && (
          <Animated.View style={[styles.toastContainer, { opacity: fadeAnim }]}>
            <FontAwesome name="exclamation-circle" size={16} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.toastText}>{toastMsg}</Text>
          </Animated.View>
        )}

        <ScrollView contentContainerStyle={styles.mainContainer} showsVerticalScrollIndicator={false}>
          
          <View style={styles.headerRow}>
            <Text style={styles.headerText}>Создать задачу</Text>
            <TouchableOpacity 
              style={styles.registryButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
                router.push('/registry');
              }} 
            >
              <FontAwesome name="list-ul" size={16} color="#1A1A1A" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.typeSelector}>
            {TASK_TYPES.map((type) => (
              <TouchableOpacity key={type.id} style={[styles.colorBlock, { backgroundColor: type.color }, taskType === type.id && styles.activeColorBlock]} onPress={() => handleTypeSelect(type.id)} />
            ))}
          </View>

          <View style={styles.hintContainer}>
             <View style={[styles.hintIndicator, { backgroundColor: activeColor }]} />
             <View style={styles.hintTextContent}>
                <Text style={styles.hintTitle}>{TASK_HINTS[taskType].title}</Text>
                <Text style={styles.hintDesc}>{TASK_HINTS[taskType].desc}</Text>
             </View>
          </View>

          <View style={styles.card}>
            <View style={styles.leftColumn}>
              <View style={[styles.badge, { backgroundColor: activeColor }]}>
                <FontAwesome name="star" size={14} color={badgeStyle.text} />
                <TextInput style={[styles.badgeInput, { color: badgeStyle.text }]} placeholder="0" placeholderTextColor={badgeStyle.placeholder} keyboardType="numeric" value={points} onChangeText={setPoints} maxLength={3} />
              </View>
              <TextInput style={styles.titleInput} placeholder="Название" placeholderTextColor="#AAA" value={title} onChangeText={setTitle} />
              <View style={styles.divider} />
              <View style={styles.descContainer}>
                <TextInput style={styles.descriptionInput} placeholder="Описание" placeholderTextColor="#AAA" multiline value={description} onChangeText={setDescription} />
              </View>
            </View>
            <TouchableOpacity style={styles.rightColumn} onPress={pickImage}>
              {imageUri ? <Image source={{ uri: imageUri }} style={styles.selectedImage} /> : <View style={styles.iconPlaceholder}><FontAwesome name="camera" size={32} color="#CCC" /></View>}
            </TouchableOpacity>
          </View>

          <Animated.View style={{ width: '100%', overflow: 'hidden', maxHeight: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 150] }), opacity: expandAnim }}>
            <View style={styles.settingsRow}>
              <View style={styles.settingBlock}>
                <Text style={styles.settingLabel}>Интервал (дней)</Text>
                <View style={styles.settingInputContainer}>
                  <FontAwesome name="repeat" size={14} color="#888" style={{ marginRight: 8 }} />
                  <TextInput style={styles.settingInput} placeholder="7" placeholderTextColor="#AAA" keyboardType="numeric" value={frequency} onChangeText={setFrequency} />
                </View>
              </View>
              <View style={styles.settingBlock}>
                <Text style={styles.settingLabel}>Дата старта</Text>
                <View style={styles.settingInputContainer}>
                  <FontAwesome name="calendar" size={14} color="#888" style={{ marginRight: 8 }} />
                  <TextInput style={styles.settingInput} placeholder="ДД.ММ.ГГГГ" placeholderTextColor="#AAA" keyboardType="numeric" maxLength={10} value={startDate} onChangeText={handleDateChange} />
                </View>
              </View>
            </View>
          </Animated.View>

          <TouchableOpacity style={[styles.saveButton, loading && { opacity: 0.7 }]} onPress={handleCreateTask} disabled={loading}>
            <Text style={styles.saveButtonText}>{loading ? 'Загрузка в облако...' : 'Добавить задачу'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  mainContainer: { padding: 20, alignItems: 'center' },
  
  headerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '100%', marginBottom: 25, position: 'relative' },
  headerText: { fontSize: 24, fontWeight: 'bold', color: '#1A1A1A' },
  registryButton: { position: 'absolute', right: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAEAEA', justifyContent: 'center', alignItems: 'center' },
  
  typeSelector: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 15, width: '100%' },
  colorBlock: { width: 50, height: 40, borderRadius: 12, opacity: 0.3 }, 
  activeColorBlock: { opacity: 1, borderWidth: 3, borderColor: '#555555', transform: [{ scale: 1.1 }] }, 

  hintContainer: { flexDirection: 'row', width: '100%', backgroundColor: '#FFF', borderRadius: 12, marginBottom: 25, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2, overflow: 'hidden', minHeight: 70 },
  hintIndicator: { width: 6, height: '100%', borderRadius: 3, marginRight: 12 },
  hintTextContent: { flex: 1, justifyContent: 'center' },
  hintTitle: { fontSize: 14, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 2 },
  hintDesc: { fontSize: 12, color: '#666', lineHeight: 16 },

  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', aspectRatio: 1100 / 520, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  leftColumn: { width: '60%', height: '100%', justifyContent: 'flex-start', alignItems: 'flex-start' },
  rightColumn: { flex: 1, height: '100%', alignItems: 'flex-end', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, marginBottom: 8 },
  badgeInput: { fontWeight: 'bold', fontSize: 16, marginLeft: 4, padding: 0, minWidth: 20 },
  titleInput: { fontSize: 22, fontWeight: 'bold', color: '#000', marginBottom: 4, width: '100%' },
  divider: { width: '100%', height: 1, backgroundColor: '#000', marginBottom: 8 },
  descContainer: { flex: 1, width: '100%' },
  descriptionInput: { flex: 1, fontSize: 10, color: '#333', textAlignVertical: 'top' },
  iconPlaceholder: { width: '95%', height: '95%', backgroundColor: '#F5F5F5', borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  selectedImage: { width: '95%', height: '95%', borderRadius: 8, resizeMode: 'cover' },
  
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 20 },
  settingBlock: { width: '48%', backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EFEFEF' },
  settingLabel: { fontSize: 12, color: '#888', marginBottom: 6, fontWeight: '600' },
  settingInputContainer: { flexDirection: 'row', alignItems: 'center' },
  settingInput: { flex: 1, fontSize: 14, color: '#1A1A1A' },
  
  saveButton: { backgroundColor: '#1A1A1A', width: '100%', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },

  // 🪄 Стили для плашки-уведомления
  toastContainer: {
    position: 'absolute',
    top: 20, 
    alignSelf: 'center',
    backgroundColor: '#FF3B30', 
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 100 
  },
  toastText: { color: '#FFF', fontWeight: '600' },
});