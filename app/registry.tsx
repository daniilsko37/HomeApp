import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RoutineCard } from '../components/RoutineCard';
import { supabase } from '../lib/supabase';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_EXACT_HEIGHT = ((SCREEN_WIDTH - 40) * (520 / 1100)) + 15;

const TASK_TYPES = [
  { id: 'green', color: '#2ECC71' },
  { id: 'yellow', color: '#FFD166' },
  { id: 'violet', color: '#B19CD9' },
  { id: 'orange', color: '#F4A261' },
  { id: 'blue', color: '#4CC9F0' }
];

export default function RegistryScreen() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('green'); 
  const [searchQuery, setSearchQuery] = useState(''); 
  const router = useRouter();

  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPoints, setEditPoints] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editType, setEditType] = useState('green');
  const [editFreq, setEditFreq] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editImageUri, setEditImageUri] = useState<string | null>(null);
  const [editImageBase64, setEditImageBase64] = useState<string | null>(null); 
  const [saving, setSaving] = useState(false);

  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  
  const [showBalancePrompt, setShowBalancePrompt] = useState(false);
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<any>(null);

  const [pendingBalanceUpdates, setPendingBalanceUpdates] = useState<any[]>([]);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const lastHapticIndex = useRef(0);

  const showCustomToast = (msg: string) => {
    setToastMessage(msg);
    Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setToastMessage(null);
      });
    }, 2500);
  };

  const fetchRegistry = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const room = await AsyncStorage.getItem('room_id');
      if (!room) return;
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('room_id', room)
        .neq('frequency_days', -1) 
        .order('points', { ascending: true })
        .order('title', { ascending: true });
      if (error) throw error;
      setTasks(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  // 🪄 УМНЫЙ БАЛАНСИРОВЩИК
  const checkBalanceNeeds = async () => {
    try {
      const room = await AsyncStorage.getItem('room_id');
      if (!room) return;

      // Проверяем есть ли todo задачи
      const { data: todoTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('room_id', room)
        .eq('type', 'green')
        .eq('status', 'todo')
        .gt('frequency_days', 0);

      const hasTodo = todoTasks && todoTasks.length > 0;

      // Берём только done задачи для балансировки
      const { data: doneTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('room_id', room)
        .eq('type', 'green')
        .eq('status', 'done')
        .gt('frequency_days', 0);

      if (error) throw error;
      if (!doneTasks || doneTasks.length === 0) {
        showCustomToast('Нет задач для балансировки');
        return;
      }

      const todayZero = new Date();
      todayZero.setHours(0, 0, 0, 0);

      const getTaskTag = (task: any) => {
        if (!task.description) return null;
        const tagLine = task.description.find((line: string) => line.trim().startsWith('#'));
        return tagLine ? tagLine.trim() : null;
      };

      const groups: { [key: string]: any[] } = {};
      const singleTasks: any[] = [];

      const sortedTasks = [...doneTasks].sort((a, b) => {
        if (a.frequency_days !== b.frequency_days) return a.frequency_days - b.frequency_days;
        return a.id.localeCompare(b.id);
      });

      sortedTasks.forEach(task => {
        const tag = getTaskTag(task);
        if (tag) {
          if (!groups[tag]) groups[tag] = [];
          groups[tag].push(task);
        } else {
          singleTasks.push(task);
        }
      });

      const allGroups: any[][] = [];
      Object.values(groups).forEach(g => allGroups.push(g));
      singleTasks.forEach(t => allGroups.push([t]));
      allGroups.sort((a, b) => a[0].frequency_days - b[0].frequency_days);

      const dailyLoad = new Array(365).fill(0);
      const updates: any[] = [];

      for (const group of allGroups) {
        const firstTask = group[0];
        const freq = firstTask.frequency_days;
        const groupSize = group.length;

        let currentOffset = 0;
        if (firstTask.start_date) {
          const [y, m, d] = firstTask.start_date.split('-');
          const sd = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
          sd.setHours(0, 0, 0, 0);
          const nextDate = new Date(sd);
          nextDate.setDate(sd.getDate() + freq);
          const diffDays = Math.round((nextDate.getTime() - todayZero.getTime()) / (1000 * 60 * 60 * 24));
          currentOffset = ((diffDays % freq) + freq) % freq;
        }

        let bestOffset = currentOffset;
        let minScore = 0;
        for (let day = currentOffset; day < 365; day += freq) {
          minScore += Math.pow(dailyLoad[day] + groupSize, 2);
        }

        for (let offset = 0; offset < freq; offset++) {
          if (offset === currentOffset) continue;
          let score = 0;
          for (let day = offset; day < 365; day += freq) {
            score += Math.pow(dailyLoad[day] + groupSize, 2);
          }
          if (score < minScore) {
            minScore = score;
            bestOffset = offset;
          }
        }

        for (let day = bestOffset; day < 365; day += freq) {
          dailyLoad[day] += groupSize;
        }

        const newNextDate = new Date(todayZero);
        newNextDate.setDate(todayZero.getDate() + bestOffset);
        const newStartDate = new Date(newNextDate);
        newStartDate.setDate(newNextDate.getDate() - freq);

        const yyyy = newStartDate.getFullYear();
        const mm = String(newStartDate.getMonth() + 1).padStart(2, '0');
        const dd = String(newStartDate.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        group.forEach(task => {
          if (task.start_date !== dateStr) {
            updates.push({ id: task.id, start_date: dateStr });
          }
        });
      }

      if (updates.length > 0) {
        // Не сбалансировано
        if (hasTodo) {
          // Есть todo — блокируем
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          showCustomToast(`Сначала выполни все активные задачи (${todoTasks!.length})`);
        } else {
          // Нет todo — показываем окно подтверждения
          setPendingBalanceUpdates(updates);
          setShowBalancePrompt(true);
        }
      } else {
        // Уже сбалансировано — тост независимо от todo
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showCustomToast('Всё идеально!');
      }

    } catch (e) {
      console.error(e);
      showCustomToast('Ошибка при проверке баланса');
    }
  };

  const applyBalanceUpdates = async () => {
    setShowBalancePrompt(false);
    try {
      await Promise.all(
        pendingBalanceUpdates.map(u =>
          supabase.from('tasks').update({ start_date: u.start_date }).eq('id', u.id)
        )
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showCustomToast('Расписание обновлено!');
      fetchRegistry(true);
    } catch (e) {
      console.error(e);
      showCustomToast('Ошибка при применении баланса');
    }
  };

  useEffect(() => { fetchRegistry(); }, []);

  useEffect(() => {
    if (editingTask) {
      slideAnim.setValue(SCREEN_HEIGHT);
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }).start();
    }
  }, [editingTask]);

  const handleScroll = (event: any) => {
    const currentOffset = event.nativeEvent.contentOffset.y;
    if (currentOffset > 180) {
      const scrolledInList = currentOffset - 180;
      const currentIndex = Math.floor(scrolledInList / CARD_EXACT_HEIGHT);
      if (currentIndex !== lastHapticIndex.current) {
        Haptics.selectionAsync();
        lastHapticIndex.current = currentIndex;
      }
    }
  };

  const formatDateToRU = (dbDate: string | null) => {
    if (!dbDate) return '';
    const [y, m, d] = dbDate.split('-');
    return d + '.' + m + '.' + y;
  };
  
  const formatDateToDB = (ruDate: string) => {
    if (!ruDate || ruDate.length !== 10) return null;
    const [d, m, y] = ruDate.split('.');
    return y + '-' + m + '-' + d;
  };

  const handleDateChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '.' + cleaned.slice(2);
    if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '.' + cleaned.slice(4, 8);
    setEditStartDate(formatted);
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
      setEditImageUri(result.assets[0].uri);
      setEditImageBase64(result.assets[0].base64 || null); 
    }
  };

  const openEditModal = (task: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingTask(task);
    setEditTitle(task.title);
    setEditPoints(task.points ? String(task.points) : '0');
    setEditDesc(task.description ? task.description.join('\n') : '');
    setEditType(task.type);
    setEditFreq(task.frequency_days ? String(task.frequency_days) : '');
    setEditStartDate(formatDateToRU(task.start_date));
    setEditImageUri(task.image_url || null);
    setEditImageBase64(null); 
  };

  const hasChanges = () => {
    if (!editingTask) return false;
    const origDesc = editingTask.description ? editingTask.description.join('\n') : '';
    const origFreq = editingTask.frequency_days ? String(editingTask.frequency_days) : '';
    const origPoints = editingTask.points ? String(editingTask.points) : '0';
    return (
      editTitle !== editingTask.title ||
      editPoints !== origPoints ||
      editDesc !== origDesc ||
      editType !== editingTask.type ||
      editStartDate !== formatDateToRU(editingTask.start_date) ||
      editFreq !== origFreq ||
      editImageUri !== (editingTask.image_url || null)
    );
  };

  const closeModalGracefully = () => {
    Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start(() => {
      setEditingTask(null);
      setShowConfirmClose(false);
      setShowConfirmDelete(false);
    });
  };

  const handleCloseAttempt = () => {
    if (hasChanges()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowConfirmClose(true); 
    } else {
      closeModalGracefully();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => gestureState.dy > 10, 
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0) slideAnim.setValue(gestureState.dy);
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > 250 || (gestureState.dy > 120 && gestureState.vy > 2.5)) {
          if (hasChanges()) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
            setShowConfirmClose(true);
          } else {
            closeModalGracefully();
          }
        } else {
          Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }).start();
        }
      }
    })
  ).current;

  const handleUpdateTask = async () => {
    if (!editTitle) return;
    try {
      setSaving(true);
      let finalImageUrl = editImageUri;
      if (editImageBase64) {
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const { error } = await supabase.storage
          .from('task-images')
          .upload(fileName, decode(editImageBase64), { contentType: 'image/jpeg' });
        if (error) throw new Error('Не удалось загрузить картинку в облако');
        const { data: publicUrlData } = supabase.storage.from('task-images').getPublicUrl(fileName);
        finalImageUrl = publicUrlData.publicUrl;
      }
      const descArray = editDesc.split('\n').filter(item => item.trim() !== '');
      const { error } = await supabase.from('tasks').update({
          title: editTitle,
          points: parseInt(editPoints) || 0,
          type: editType,
          description: descArray,
          image_url: finalImageUrl, 
          start_date: formatDateToDB(editStartDate),
          frequency_days: parseInt(editFreq) || 0
      }).eq('id', editingTask.id);
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); 
      closeModalGracefully();
      fetchRegistry(true); 
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const deletePermanently = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); 
    await supabase.from('tasks').delete().eq('id', editingTask.id);
    closeModalGracefully();
    fetchRegistry(true); 
  };

  const filteredTasks = tasks.filter(t => {
    const matchesColor = t.type === activeFilter;
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase());
    const isNotDoneOrange = !(t.type === 'orange' && t.status === 'done');
    return matchesColor && matchesSearch && isNotDoneOrange;
  });

  const activeEditColor = TASK_TYPES.find(t => t.id === editType)?.color || '#2ECC71';
  const isLightEditBadge = editType === 'yellow';
  const badgeTextColor = isLightEditBadge ? '#333' : '#fff';
  const badgePlaceholder = isLightEditBadge ? '#666' : (editType === 'violet' ? '#E0E0E0' : 'rgba(255, 255, 255, 0.6)');
  const requiresDate = editType === 'green' || editType === 'blue';

  return (
    <SafeAreaView style={styles.safeArea}>
      
      <Animated.View 
        style={[styles.toastContainer, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}
        pointerEvents="none"
      >
        <Text style={styles.toastText}>{toastMessage}</Text>
      </Animated.View>

      <ScrollView 
        contentContainerStyle={styles.mainContainer} 
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll} 
        scrollEventThrottle={16} 
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}>
            <FontAwesome name="chevron-left" size={16} color="#2C2C2E" />
          </TouchableOpacity>
          <Text style={styles.headerText}>Библиотека задач</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.searchContainer}>
          <FontAwesome name="search" size={16} color="#AAA" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по названию..."
            placeholderTextColor="#AAA"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setSearchQuery(''); }}>
              <FontAwesome name="times-circle" size={18} color="#CCC" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.typeSelector}>
          {TASK_TYPES.map((type) => (
            <TouchableOpacity 
              key={type.id} 
              style={[styles.colorBlock, { backgroundColor: type.color }, activeFilter === type.id && styles.activeColorBlock]}
              onPress={() => { Haptics.selectionAsync(); setActiveFilter(type.id); }}
            />
          ))}
        </View>

        {activeFilter === 'green' && (
          <TouchableOpacity style={styles.magicButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); checkBalanceNeeds(); }}>
            <FontAwesome name="magic" size={16} color="#FFF" />
            <Text style={styles.magicButtonText}>Умный баланс</Text>
          </TouchableOpacity>
        )}

        <View style={styles.listContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#2C2C2E" style={{ marginTop: 50 }} />
          ) : filteredTasks.length === 0 ? (
            <Text style={styles.emptyText}>Задач не найдено...</Text>
          ) : (
            filteredTasks.map(task => {
              const activeColor = TASK_TYPES.find(t => t.id === task.type)?.color || '#2ECC71';
              return (
                <View key={task.id} style={styles.cardWrapper}>
                  <RoutineCard 
                    title={task.title}
                    badgePoints={task.points || 0}
                    badgeColor={activeColor}
                    descriptionLines={task.description || []}
                    imageSource={task.image_url ? { uri: task.image_url } : undefined}
                    onPress={() => openEditModal(task)} 
                  />
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {showBalancePrompt && (
        <Modal transparent animationType="fade">
          <View style={styles.alertOverlay}>
            <View style={styles.alertBox}>
              <View style={[styles.alertIconCircle, { backgroundColor: '#E8F5E9' }]}>
                <FontAwesome name="magic" size={28} color="#2ECC71" />
              </View>
              <Text style={styles.alertTitle}>Настроить график?</Text>
              <Text style={styles.alertMessage}>
                Алгоритм возьмёт все выполненные <Text style={{fontWeight: 'bold', color: '#2ECC71'}}>ЗЕЛЕНЫЕ</Text> задачи и расставит их равномерно на весь год.{'\n\n'} Связанные хэштегами задачи останутся вместе.
              </Text>
              <View style={styles.alertButtons}>
                <TouchableOpacity style={[styles.alertBtn, styles.alertBtnPrimary]} onPress={applyBalanceUpdates}>
                  <Text style={styles.alertBtnTextWhite}>Сбалансировать</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.alertTextBtn} onPress={() => setShowBalancePrompt(false)}>
                  <Text style={styles.alertTextBtnText}>Отмена</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <Modal visible={!!editingTask} transparent={true} animationType="none" onRequestClose={handleCloseAttempt}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={handleCloseAttempt} />
          <Animated.View style={[styles.modalSheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.modalDragHandleContainer} {...panResponder.panHandlers}>
              <View style={styles.modalDragIndicator} />
            </View>
            <View style={styles.modalHeader} {...panResponder.panHandlers}>
               <View style={{ width: 40 }} />
               <Text style={styles.modalTitleText}>Редактирование</Text>
               <TouchableOpacity onPress={handleCloseAttempt} style={styles.modalCloseBtn}>
                  <FontAwesome name="times" size={20} color="#888" />
               </TouchableOpacity>
            </View>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
                <View style={styles.typeSelector}>
                  {TASK_TYPES.map((type) => (
                    <TouchableOpacity 
                      key={type.id} 
                      style={[styles.colorBlock, { backgroundColor: type.color }, editType === type.id && styles.activeColorBlock]}
                      onPress={() => { Haptics.selectionAsync(); setEditType(type.id); }}
                    />
                  ))}
                </View>
                <View style={styles.card}>
                  <View style={styles.leftColumn}>
                    <View style={[styles.badge, { backgroundColor: activeEditColor }]}>
                      <FontAwesome name="star" size={14} color={badgeTextColor} />
                      <TextInput style={[styles.badgeInput, { color: badgeTextColor }]} placeholder="0" placeholderTextColor={badgePlaceholder} keyboardType="numeric" value={editPoints} onChangeText={setEditPoints} maxLength={3} />
                    </View>
                    <TextInput style={styles.titleInput} placeholder="Название" placeholderTextColor="#AAA" value={editTitle} onChangeText={setEditTitle} />
                    <View style={styles.divider} />
                    <View style={styles.descContainer}>
                      <TextInput style={styles.descriptionInput} placeholder="Описание (каждая с новой строки)" placeholderTextColor="#AAA" multiline value={editDesc} onChangeText={setEditDesc} />
                    </View>
                  </View>
                  <TouchableOpacity style={styles.rightColumn} onPress={pickImage}>
                    {editImageUri ? <Image source={{ uri: editImageUri }} style={styles.selectedImage} /> : <View style={styles.iconPlaceholder}><FontAwesome name="camera" size={32} color="#CCC" /></View>}
                  </TouchableOpacity>
                </View>
                {requiresDate && (
                   <View style={styles.settingsRow}>
                     <View style={styles.settingBlock}>
                       <Text style={styles.settingLabel}>Интервал (дней)</Text>
                       <View style={styles.settingInputContainer}>
                         <FontAwesome name="repeat" size={14} color="#888" style={{ marginRight: 8 }} />
                         <TextInput style={styles.settingInput} placeholder="7" placeholderTextColor="#AAA" keyboardType="numeric" value={editFreq} onChangeText={setEditFreq} />
                       </View>
                     </View>
                     <View style={styles.settingBlock}>
                       <Text style={styles.settingLabel}>Дата старта</Text>
                       <View style={styles.settingInputContainer}>
                         <FontAwesome name="calendar" size={14} color="#888" style={{ marginRight: 8 }} />
                         <TextInput style={styles.settingInput} placeholder="ДД.ММ.ГГГГ" placeholderTextColor="#AAA" keyboardType="numeric" maxLength={10} value={editStartDate} onChangeText={handleDateChange} />
                       </View>
                     </View>
                   </View>
                )}
                <View style={styles.modalFooter}>
                  <TouchableOpacity style={styles.saveButton} onPress={handleUpdateTask} disabled={saving}>
                    <Text style={styles.saveButtonText}>{saving ? 'Загрузка...' : 'Сохранить изменения'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowConfirmDelete(true); }}>
                    <FontAwesome name="trash-o" size={16} color="#FF3B30" style={{ marginRight: 8 }} />
                    <Text style={styles.deleteButtonText}>Удалить задачу</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
            {(showConfirmClose || showConfirmDelete) && (
              <View style={styles.alertOverlay}>
                <View style={styles.alertBox}>
                  <Text style={styles.alertTitle}>{showConfirmDelete ? 'Удалить задачу?' : 'Остались изменения'}</Text>
                  <Text style={styles.alertMessage}>
                    {showConfirmDelete ? 'Задача «' + editTitle + '» будет удалена навсегда.' : 'Сохранить новые правки перед закрытием?'}
                  </Text>
                  <View style={styles.alertButtons}>
                    {showConfirmDelete ? (
                      <>
                        <TouchableOpacity style={[styles.alertBtn, styles.alertBtnRed]} onPress={deletePermanently}>
                          <Text style={styles.alertBtnTextRed}>Удалить навсегда</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.alertTextBtn} onPress={() => setShowConfirmDelete(false)}>
                          <Text style={styles.alertTextBtnText}>Отмена</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity style={[styles.alertBtn, styles.alertBtnPrimary]} onPress={handleUpdateTask}>
                          <Text style={styles.alertBtnTextWhite}>Сохранить изменения</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.alertBtn, styles.alertBtnRed]} onPress={closeModalGracefully}>
                          <Text style={styles.alertBtnTextRed}>Сбросить и выйти</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.alertTextBtn} onPress={() => setShowConfirmClose(false)}>
                          <Text style={styles.alertTextBtnText}>Вернуться к правкам</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  mainContainer: { padding: 20, alignItems: 'center', paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 20 },
  headerText: { fontSize: 24, fontWeight: 'bold', color: '#2C2C2E' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EAEAEA', justifyContent: 'center', alignItems: 'center' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', width: '100%', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 12, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, color: '#2C2C2E' },
  typeSelector: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 25, width: '100%' },
  colorBlock: { width: 50, height: 40, borderRadius: 12, opacity: 0.3 }, 
  activeColorBlock: { opacity: 1, borderWidth: 3, borderColor: '#555555', transform: [{ scale: 1.1 }] }, 
  magicButton: { flexDirection: 'row', backgroundColor: '#555555', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 5, width: '90%' },
  magicButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15, marginLeft: 8 },
  toastContainer: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#333333F2', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, zIndex: 9999 },
  toastText: { color: '#FFF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  listContainer: { width: '100%' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 16 },
  cardWrapper: { marginBottom: 15, width: '100%' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalSheet: { backgroundColor: '#F8F9FA', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '94%', shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 10 },
  modalDragHandleContainer: { width: '100%', alignItems: 'center', paddingTop: 12, paddingBottom: 5, backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalDragIndicator: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#DDD' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 15, backgroundColor: '#FFF' },
  modalTitleText: { fontSize: 18, fontWeight: 'bold', color: '#2C2C2E' },
  modalCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
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
  settingInput: { flex: 1, fontSize: 14, color: '#2C2C2E' },
  modalFooter: { marginTop: 20, width: '100%', alignItems: 'center' },
  saveButton: { backgroundColor: '#555555', width: '100%', padding: 18, borderRadius: 16, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  deleteButton: { flexDirection: 'row', backgroundColor: '#FFEBEB', width: '100%', padding: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  deleteButtonText: { color: '#FF3B30', fontSize: 16, fontWeight: 'bold' },
  alertOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  alertBox: { width: '85%', backgroundColor: '#FFF', borderRadius: 24, padding: 25, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 20 },
  alertIconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 15 },
  alertTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C2C2E', textAlign: 'center', marginBottom: 10 },
  alertMessage: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 25 },
  alertButtons: { gap: 10 },
  alertBtn: { width: '100%', padding: 16, borderRadius: 14, alignItems: 'center' },
  alertBtnPrimary: { backgroundColor: '#555555' },
  alertBtnRed: { backgroundColor: '#FFEBEB' },
  alertBtnTextWhite: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  alertBtnTextRed: { color: '#FF3B30', fontWeight: 'bold', fontSize: 15 },
  alertTextBtn: { width: '100%', padding: 16, alignItems: 'center', marginTop: 5 },
  alertTextBtnText: { color: '#888', fontWeight: '600', fontSize: 15 }
});
