import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, UIManager, View } from 'react-native';
import { supabase } from '../../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// МАГАЗИН
const SHOP_ICONS = [
  'hamburger', 'pizza', 'coffee', 'candy', 'ice-cream',
  'cupcake', 'glass-cocktail', 'popcorn', 'silverware-fork-knife', 'gamepad-variant', 
  'puzzle', 'movie-open', 'music-note', 'ticket', 'bed', 
  'sofa', 'car', 'airplane', 'map-marker', 'shopping', 
  'star', 'heart', 'gift', 'diamond-stone', 'trophy'
];

const SHOP_COLORS = [
  '#3A3A3C', '#8C6239', '#E07A5F', '#D0021B', '#F5A623', 
  '#FFD166', '#7ED321', '#2ECC71', '#4A90E2', '#9C27B0'
];

// КВЕСТЫ
const QUEST_ICONS = [
  'snowflake', 'feather', 'crown', 'flag', 'treasure-chest', 
  'map', 'star', 'key', 'bell', 'fire', 
  'water', 'trophy', 'flare', 'broom', 'washing-machine', 
  'silverware-fork-knife', 'home', 'flash', 'diamond-stone', 'medal',
  'clock-outline', 'calendar-check', 'check-decagram', 'format-list-checks', 'ticket'
];

const QUEST_COLORS = [
  '#4CC9F0', '#B19CD9', '#FFD166', '#2ECC71', '#FF6B6B', 
  '#3A3A3C', '#F5A623', '#4A90E2', '#9C27B0', '#E07A5F'
];

const TASK_TYPE_WEIGHTS: Record<string, number> = {
  'green': 1, 'yellow': 2, 'violet': 3, 'orange': 4, 'blue': 5
};

export default function AdminScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'shop' | 'quest'>('shop');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const scrollViewRef = useRef<ScrollView>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- СТЕЙТЫ МАГАЗИНА ---
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('star');
  const [selectedColor, setSelectedColor] = useState('#3A3A3C');
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const titleInputRef = useRef<TextInput>(null);
  const priceInputRef = useRef<TextInput>(null);

  // --- СТЕЙТЫ КВЕСТОВ ---
  const [questTitle, setQuestTitle] = useState('');
  const [questReward, setQuestReward] = useState('');
  const [questIcon, setQuestIcon] = useState('flag');
  const [questColor, setQuestColor] = useState('#4CC9F0');
  const [questTasks, setQuestTasks] = useState<any[]>([]);
  
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [libraryQuests, setLibraryQuests] = useState<any[]>([]); 
  const [isTasksModalVisible, setIsTasksModalVisible] = useState(false);
  const questRewardInputRef = useRef<TextInput>(null);

  // --- МОДАЛКИ И СТИЛИ ---
  const [isStyleModalVisible, setIsStyleModalVisible] = useState(false);
  const [styleMode, setStyleMode] = useState<'shop' | 'quest'>('shop');

  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]);

  const translateY = useRef(new Animated.Value(0)).current;

  // --- ТОСТ ---
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastFade = useRef(new Animated.Value(0)).current;
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    Animated.timing(toastFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => {
      Animated.timing(toastFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setToastMessage(null));
    }, 2000);
  };
  
  const handleCloseStyleModal = useCallback(() => {
    Animated.timing(translateY, { toValue: 1000, duration: 250, useNativeDriver: true }).start(() => setIsStyleModalVisible(false));
  }, [translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) translateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) handleCloseStyleModal();
        else Animated.spring(translateY, { toValue: 0, bounciness: 6, useNativeDriver: true }).start();
      },
    })
  ).current;

  const handleOpenStyleModal = (mode: 'shop' | 'quest') => {
    Keyboard.dismiss();
    setStyleMode(mode);
    translateY.setValue(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsStyleModalVisible(true);
  };

  const fetchData = useCallback(async () => {
    try {
      setFetching(true);
      const roomId = await AsyncStorage.getItem('room_id');
      if (!roomId) return;

      const { data: shopData } = await supabase.from('shop_items').select('*').eq('room_id', roomId).order('created_at', { ascending: false });
      if (shopData) setLibraryItems(shopData);

      // 🪄 Грузим ТОЛЬКО ШАБЛОНЫ (где user_name пустое)
      const { data: qData } = await supabase.from('quests').select('*').eq('room_id', roomId).is('user_name', null).order('created_at', { ascending: false });
      if (qData) setLibraryQuests(qData);

      const { data: tasksData } = await supabase.from('tasks').select('*').eq('room_id', roomId);
      if (tasksData) {
          const sorted = tasksData.sort((a, b) => {
              const weightA = TASK_TYPE_WEIGHTS[a.type] || 99;
              const weightB = TASK_TYPE_WEIGHTS[b.type] || 99;
              if (weightA !== weightB) return weightA - weightB;
              return a.title.localeCompare(b.title);
          });
          setAllTasks(sorted);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- ЛОГИКА МАГАЗИНА ---
  const handleSaveShopItem = async () => {
    Keyboard.dismiss();
    if (!title.trim() || !price.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return showToast('Укажи название и цену!');
    }
    try {
      setLoading(true);
      const roomId = await AsyncStorage.getItem('room_id');
      if (!roomId) throw new Error('Нет комнаты');
      const itemData = { room_id: roomId, title: title.trim(), price: parseInt(price, 10), icon: selectedIcon, color: selectedColor };
      if (editingId) {
        await supabase.from('shop_items').update(itemData).eq('id', editingId);
        showToast('Изменения сохранены');
      } else {
        await supabase.from('shop_items').insert([itemData]);
        showToast('Товар добавлен!');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetShopForm();
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEditShopInit = (item: any) => {
    Haptics.selectionAsync();
    setEditingId(item.id);
    setTitle(item.title);
    setPrice(item.price.toString());
    setSelectedIcon(SHOP_ICONS.includes(item.icon) ? item.icon : 'star');
    setSelectedColor(item.color || '#3A3A3C');
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const resetShopForm = () => {
    setEditingId(null);
    setTitle('');
    setPrice('');
    setSelectedIcon('star');
    setSelectedColor('#3A3A3C');
  };

  // --- ЛОГИКА КВЕСТОВ ---
  const handleEditQuestInit = async (quest: any) => {
    Haptics.selectionAsync();
    setEditingId(quest.id);
    setQuestTitle(quest.title);
    setQuestReward(quest.reward.toString());
    setQuestIcon(QUEST_ICONS.includes(quest.icon) ? quest.icon : 'flag');
    setQuestColor(quest.color || '#4CC9F0');
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });

    try {
      const { data: qTasks, error } = await supabase
        .from('quest_tasks')
        .select('*')
        .eq('quest_id', quest.id);
      
      if (error) throw error;
      if (qTasks) {
        setQuestTasks(qTasks.map(qt => ({
          id: qt.task_id,
          name: qt.task_title,
          target: qt.target_count
        })));
      }
    } catch (e) {
      console.error(e);
      showToast('Не удалось загрузить задачи квеста');
    }
  };

  const resetQuestForm = () => {
    setEditingId(null);
    setQuestTitle('');
    setQuestReward('');
    setQuestTasks([]);
    setQuestIcon('flag');
    setQuestColor('#4CC9F0');
  };

  const handleSaveQuest = async () => {
    Keyboard.dismiss();
    if (!questTitle.trim() || !questReward.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return showToast('Укажи название и награду!');
    }
    if (questTasks.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return showToast('Добавь хотя бы одну задачу!');
    }
    
    const invalidTask = questTasks.find(t => !t.target || t.target <= 0);
    if (invalidTask) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return showToast(`Укажи количество для: ${invalidTask.name}`);
    }

    try {
      setLoading(true);
      const roomId = await AsyncStorage.getItem('room_id');
      if (!roomId) throw new Error('Нет комнаты');

      // 🪄 СОЗДАЕМ ШАБЛОН КВЕСТА
      const questData = {
          room_id: roomId,
          title: questTitle.trim(),
          color: questColor,
          icon: questIcon,
          reward: parseInt(questReward, 10),
          is_active: true,
          user_name: null // Это указывает, что квест является шаблоном
      };

      if (editingId) {
        await supabase.from('quests').update(questData).eq('id', editingId);
        await supabase.from('quest_tasks').delete().eq('quest_id', editingId);
        
        const tasksToInsert = questTasks.map(qt => ({
            quest_id: editingId,
            task_id: qt.id,
            task_title: qt.name,
            target_count: qt.target,
            current_count: 0
        }));
        await supabase.from('quest_tasks').insert(tasksToInsert);
        showToast('Шаблон обновлен!');
      } else {
        const { data: newQuest, error: questError } = await supabase
          .from('quests')
          .insert([questData])
          .select()
          .single();

        if (questError) throw questError;

        const tasksToInsert = questTasks.map(qt => ({
            quest_id: newQuest.id,
            task_id: qt.id,
            task_title: qt.name,
            target_count: qt.target,
            current_count: 0
        }));
        await supabase.from('quest_tasks').insert(tasksToInsert);
        showToast('Шаблон квеста успешно создан!');
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetQuestForm();
      fetchData(); 

    } catch (e) {
      console.error(e);
      showToast('Ошибка при сохранении квеста');
    } finally {
      setLoading(false);
    }
  };

  const toggleDeleteMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDeleteMode(!isDeleteMode);
    setSelectedForDelete([]);
  };

  const toggleDeleteSelection = (id: string) => {
    Haptics.selectionAsync();
    setSelectedForDelete(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const confirmBatchDelete = async () => {
    if (selectedForDelete.length === 0) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLoading(true);
      const targetTable = activeTab === 'shop' ? 'shop_items' : 'quests';
      await supabase.from(targetTable).delete().in('id', selectedForDelete);
      
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setIsDeleteMode(false);
      setSelectedForDelete([]);
      
      if (editingId && selectedForDelete.includes(editingId)) {
        if (activeTab === 'shop') resetShopForm();
        else resetQuestForm();
      }
      fetchData();
      showToast('Удалено успешно');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleTaskSelection = (task: any) => {
      Haptics.selectionAsync();
      const exists = questTasks.find(t => t.id === task.id);
      if (exists) setQuestTasks(prev => prev.filter(t => t.id !== task.id));
      else setQuestTasks(prev => [...prev, { id: task.id, name: task.title, target: 1 }]);
  };

  const updateQuestTaskTarget = (taskId: string, val: string) => {
      const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
      setQuestTasks(prev => prev.map(t => t.id === taskId ? { ...t, target: isNaN(num) ? '' : num } : t));
  };

  // --- РЕНДЕР МАГАЗИНА ---
  const renderShopForm = () => (
    <View style={styles.formContainer}>
      <Text style={styles.sectionHeading}>{editingId ? 'Редактирование товара:' : 'Создание товара:'}</Text>
      
      <View style={styles.cardBase}>
        <TouchableOpacity style={[styles.iconWrapper, { backgroundColor: selectedColor + '1A' }]} onPress={() => handleOpenStyleModal('shop')} activeOpacity={0.7}>
          <MaterialCommunityIcons name={selectedIcon as any} size={28} color={selectedColor} />
          <View style={styles.editBadge}><MaterialCommunityIcons name="pencil" size={10} color="#FFF" /></View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.textColumn} activeOpacity={1} onPress={() => titleInputRef.current?.focus()}>
          <View pointerEvents="none" style={{ width: '100%' }}>
            <TextInput ref={titleInputRef} style={styles.inputTitle} placeholder="Название товара..." placeholderTextColor="#AAA" value={title} onChangeText={setTitle} maxLength={30} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.priceBadgeActive} activeOpacity={0.8} onPress={() => priceInputRef.current?.focus()}>
          <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput ref={priceInputRef} style={styles.inputPrice} placeholder="0" placeholderTextColor="rgba(51,51,51,0.5)" value={price} onChangeText={setPrice} keyboardType="numeric" maxLength={5} />
            <MaterialCommunityIcons name="star" size={14} color="#1A1A1A" style={{ marginLeft: 2 }} />
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={handleSaveShopItem} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>{editingId ? 'Сохранить' : 'Добавить'}</Text>}
      </TouchableOpacity>

      {editingId && (
        <TouchableOpacity style={styles.cancelEditBtn} onPress={resetShopForm}>
          <Text style={styles.cancelEditText}>Отменить редактирование</Text>
        </TouchableOpacity>
      )}

      <View style={styles.divider} />
      
      <View style={styles.libraryHeaderRow}>
        <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>Библиотека товаров</Text>
        {libraryItems.length > 0 && !isDeleteMode && (
          <TouchableOpacity onPress={toggleDeleteMode} style={{ padding: 5 }}>
            <MaterialCommunityIcons name="trash-can-outline" size={26} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>
      
      {fetching ? (
        <ActivityIndicator color="#1A1A1A" style={{ marginTop: 20 }} />
      ) : libraryItems.length === 0 ? (
        <Text style={styles.emptyText}>Пусто.</Text>
      ) : (
        libraryItems.map((item) => {
          const isSelected = selectedForDelete.includes(item.id);
          const safeIcon = SHOP_ICONS.includes(item.icon) ? item.icon : 'star';

          return (
            <View key={item.id} style={styles.libraryRowWrapper}>
              {isDeleteMode && (
                <TouchableOpacity style={styles.checkboxContainer} onPress={() => toggleDeleteSelection(item.id)} activeOpacity={0.7}>
                  <View style={[styles.checkboxOutline, isSelected && styles.checkboxFilled]}>
                    {isSelected && <MaterialCommunityIcons name="check" size={16} color="#FFF" />}
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[styles.cardBase, { flex: 1, marginBottom: 0 }, isDeleteMode && isSelected && styles.cardSelected]} 
                activeOpacity={0.8}
                onPress={() => {
                  if (isDeleteMode) toggleDeleteSelection(item.id);
                  else handleEditShopInit(item);
                }}
              >
                <View style={[styles.iconWrapper, { backgroundColor: (item.color || '#3A3A3C') + '1A' }]}>
                  <MaterialCommunityIcons name={safeIcon as any} size={28} color={item.color || '#3A3A3C'} />
                </View>
                <View style={styles.textColumnOnlyView}>
                  <Text style={styles.libTitle} numberOfLines={1}>{item.title}</Text>
                </View>
                <View style={styles.priceBadgeActiveView}>
                  <Text style={styles.inputPriceView}>{item.price}</Text>
                  <MaterialCommunityIcons name="star" size={14} color="#1A1A1A" style={{ marginLeft: 2 }} />
                </View>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );

  // --- РЕНДЕР КВЕСТОВ ---
  const renderQuestForm = () => {
    const badgeTextColor = questColor === '#FFD166' ? '#333333' : '#FFFFFF';
    const badgePlaceholderColor = questColor === '#FFD166' ? 'rgba(51,51,51,0.5)' : 'rgba(255,255,255,0.6)';
    
    return (
    <View style={styles.formContainer}>
      <Text style={styles.sectionHeading}>{editingId ? 'Редактирование шаблона:' : 'Создание шаблона:'}</Text>
      
      <View style={[styles.questCardPreview, { borderLeftColor: questColor }]}>
        <View style={styles.questCardHeader}>
            <TouchableOpacity style={[styles.mainQuestIconBox, { backgroundColor: questColor + '20' }]} onPress={() => handleOpenStyleModal('quest')}>
                <MaterialCommunityIcons name={questIcon as any} size={28} color={questColor} />
                <View style={styles.editBadge}><MaterialCommunityIcons name="pencil" size={10} color="#FFF" /></View>
            </TouchableOpacity>

            <View style={styles.headerTextInfo}>
                <TextInput style={styles.questTitleInput} placeholder="Название квеста..." placeholderTextColor="#AAA" value={questTitle} onChangeText={setQuestTitle} />
                <Text style={styles.overallProgressText}>Выполнено: 0%</Text>
            </View>

            <View style={styles.rewardContainer}>
                <TouchableOpacity style={[styles.questBadge, { backgroundColor: questColor }]} activeOpacity={0.8} onPress={() => questRewardInputRef.current?.focus()}>
                    <FontAwesome name="star" size={12} color={badgeTextColor} />
                    <View pointerEvents="none">
                      <TextInput 
                          ref={questRewardInputRef}
                          style={[styles.badgeInput, { color: badgeTextColor }]} 
                          placeholder="0"
                          placeholderTextColor={badgePlaceholderColor}
                          value={questReward}
                          onChangeText={setQuestReward}
                          keyboardType="numeric"
                          maxLength={4}
                      />
                    </View>
                </TouchableOpacity>
            </View>
        </View>

        <View style={styles.dividerQuest} />

        <TouchableOpacity style={styles.tasksListClickableArea} activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsTasksModalVisible(true); }}>
            {questTasks.length === 0 ? (
                <View style={styles.emptyTasksContainer}>
                  <MaterialCommunityIcons name="plus-circle-outline" size={24} color="#CCC" style={{ marginBottom: 5 }} />
                  <Text style={styles.emptyTasksText}>Нажми сюда, чтобы добавить задачи</Text>
                </View>
            ) : (
                questTasks.map((task, idx) => (
                    <View key={task.id} style={styles.taskRow}>
                        <View style={styles.taskTextRow}>
                            <View style={styles.taskNameContainer}>
                                <FontAwesome name="circle-thin" size={16} color="#CCC" style={{ marginRight: 8 }} />
                                <Text style={styles.taskName}>{task.name}</Text>
                            </View>
                            <View style={styles.targetInputWrapper}>
                                <Text style={styles.targetLabel}>0 / </Text>
                                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ minWidth: 20 }}>
                                  <TextInput style={styles.targetInput} value={String(task.target)} onChangeText={(val) => updateQuestTaskTarget(task.id, val)} keyboardType="numeric" maxLength={3} />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={styles.progressBarBg} />
                    </View>
                ))
            )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={handleSaveQuest} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>{editingId ? 'Сохранить изменения' : 'Создать шаблон'}</Text>}
      </TouchableOpacity>

      {editingId && (
        <TouchableOpacity style={styles.cancelEditBtn} onPress={resetQuestForm}>
          <Text style={styles.cancelEditText}>Отменить редактирование</Text>
        </TouchableOpacity>
      )}

      <View style={styles.divider} />
      
      <View style={styles.libraryHeaderRow}>
        <Text style={[styles.sectionHeading, { marginBottom: 0 }]}>Библиотека шаблонов</Text>
        {libraryQuests.length > 0 && !isDeleteMode && (
          <TouchableOpacity onPress={toggleDeleteMode} style={{ padding: 5 }}>
            <MaterialCommunityIcons name="trash-can-outline" size={26} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>

      {fetching ? (
        <ActivityIndicator color="#1A1A1A" style={{ marginTop: 20 }} />
      ) : libraryQuests.length === 0 ? (
        <Text style={styles.emptyText}>Пусто.</Text>
      ) : (
        libraryQuests.map((quest) => {
          const isSelected = selectedForDelete.includes(quest.id);
          const safeColor = quest.color || '#4CC9F0';
          const badgeTextCol = safeColor === '#FFD166' ? '#333' : '#FFF';

          return (
            <View key={quest.id} style={styles.libraryRowWrapper}>
              {isDeleteMode && (
                <TouchableOpacity style={styles.checkboxContainer} onPress={() => toggleDeleteSelection(quest.id)} activeOpacity={0.7}>
                  <View style={[styles.checkboxOutline, isSelected && styles.checkboxFilled]}>
                    {isSelected && <MaterialCommunityIcons name="check" size={16} color="#FFF" />}
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[styles.cardBase, { flex: 1, marginBottom: 0, borderLeftWidth: 6, borderLeftColor: safeColor }, isDeleteMode && isSelected && styles.cardSelected]} 
                activeOpacity={0.8}
                onPress={() => {
                  if (isDeleteMode) toggleDeleteSelection(quest.id);
                  else handleEditQuestInit(quest);
                }}
              >
                <View style={[styles.iconWrapper, { backgroundColor: safeColor + '1A' }]}>
                  <MaterialCommunityIcons name={quest.icon as any} size={28} color={safeColor} />
                </View>
                <View style={styles.textColumnOnlyView}>
                  <Text style={styles.libTitle} numberOfLines={1}>{quest.title} (шаблон)</Text>
                </View>
                <View style={[styles.questBadge, { backgroundColor: safeColor }]}>
                  <Text style={[styles.badgeInput, { color: badgeTextCol }]}>{quest.reward}</Text>
                  <FontAwesome name="star" size={12} color={badgeTextCol} style={{ marginLeft: 4 }} />
                </View>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  )};

  const currentIcons = styleMode === 'shop' ? SHOP_ICONS : QUEST_ICONS;
  const currentColors = styleMode === 'shop' ? SHOP_COLORS : QUEST_COLORS;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialCommunityIcons name="chevron-left" size={32} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Админка</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ paddingHorizontal: 20, marginBottom: 15 }}>
          <View style={styles.segmentedControl}>
            <TouchableOpacity style={[styles.segmentBtn, activeTab === 'shop' && styles.segmentBtnActive]} onPress={() => { Haptics.selectionAsync(); setActiveTab('shop'); setIsDeleteMode(false); setSelectedForDelete([]); resetShopForm(); resetQuestForm(); }}>
              <Text style={[styles.segmentText, activeTab === 'shop' && styles.segmentTextActive]}>Магазин</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentBtn, activeTab === 'quest' && styles.segmentBtnActive]} onPress={() => { Haptics.selectionAsync(); setActiveTab('quest'); setIsDeleteMode(false); setSelectedForDelete([]); resetShopForm(); resetQuestForm(); }}>
              <Text style={[styles.segmentText, activeTab === 'quest' && styles.segmentTextActive]}>Квесты</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {activeTab === 'shop' ? renderShopForm() : renderQuestForm()}
        </ScrollView>

        {toastMessage && (
          <Animated.View style={[styles.toastContainer, { opacity: toastFade }]} pointerEvents="none">
            <Text style={styles.toastText}>{toastMessage}</Text>
          </Animated.View>
        )}

        {isDeleteMode && (
          <View style={styles.deleteBottomBar}>
            <TouchableOpacity style={styles.cancelDeleteBtn} onPress={toggleDeleteMode}>
              <Text style={styles.cancelDeleteText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmDeleteBtn, selectedForDelete.length === 0 && { opacity: 0.5 }]} disabled={selectedForDelete.length === 0 || loading} onPress={confirmBatchDelete}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmDeleteText}>Удалить ({selectedForDelete.length})</Text>}
            </TouchableOpacity>
          </View>
        )}

        <Modal visible={isStyleModalVisible} animationType="fade" transparent={true} onRequestClose={handleCloseStyleModal}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleCloseStyleModal} />
            <Animated.View style={[styles.modalContent, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
              <View style={styles.dragHandleArea}><View style={styles.dragHandle} /></View>
              
              <Text style={styles.modalLabel}>Цвет</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorScroll}>
                {currentColors.map((color) => {
                   const isSel = styleMode === 'shop' ? selectedColor === color : questColor === color;
                   return (
                  <TouchableOpacity key={color} style={[styles.colorCircle, { backgroundColor: color }, isSel && styles.selectedColorCircle]} onPress={() => { Haptics.selectionAsync(); styleMode === 'shop' ? setSelectedColor(color) : setQuestColor(color); }}>
                    {isSel && <MaterialCommunityIcons name="check" size={16} color="#FFF" />}
                  </TouchableOpacity>
                )})}
              </ScrollView>

              <Text style={styles.modalLabel}>Иконка</Text>
              <View style={styles.iconGrid}>
                {currentIcons.map((icon) => {
                  const selColor = styleMode === 'shop' ? selectedColor : questColor;
                  const isSel = styleMode === 'shop' ? selectedIcon === icon : questIcon === icon;
                  return(
                  <TouchableOpacity key={icon} style={[styles.optionCircle, isSel && { borderColor: selColor, backgroundColor: selColor + '1A' }]} onPress={() => { Haptics.selectionAsync(); styleMode === 'shop' ? setSelectedIcon(icon) : setQuestIcon(icon); }}>
                    <MaterialCommunityIcons name={icon as any} size={26} color={isSel ? selColor : '#888'} />
                  </TouchableOpacity>
                )})}
              </View>
              <TouchableOpacity style={styles.closeModalBtn} onPress={handleCloseStyleModal}><Text style={styles.closeModalText}>Готово</Text></TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>

        <Modal visible={isTasksModalVisible} animationType="slide" transparent={true}>
          <View style={styles.tasksModalOverlay}>
              <View style={styles.tasksModalContent}>
                  <View style={styles.tasksModalHeader}>
                      <Text style={styles.tasksModalTitle}>Выберите задачи</Text>
                      <TouchableOpacity onPress={() => setIsTasksModalVisible(false)} style={styles.tasksModalClose}><MaterialCommunityIcons name="close" size={24} color="#888" /></TouchableOpacity>
                  </View>
                  <ScrollView style={styles.tasksModalList} showsVerticalScrollIndicator={false}>
                      {allTasks.map(task => {
                          const isSelected = !!questTasks.find(t => t.id === task.id);
                          let taskColor = '#2ECC71';
                          if (task.type === 'yellow') taskColor = '#FFD166';
                          if (task.type === 'violet') taskColor = '#B19CD9';
                          if (task.type === 'blue') taskColor = '#4CC9F0';
                          if (task.type === 'orange') taskColor = '#F4A261';

                          return (
                              <TouchableOpacity key={task.id} style={[styles.taskSelectItem, isSelected && styles.taskSelectItemSelected]} onPress={() => toggleTaskSelection(task)}>
                                  <View style={[styles.taskColorDot, { backgroundColor: taskColor }]} />
                                  <Text style={styles.taskSelectText}>{task.title}</Text>
                                  <View style={[styles.checkboxOutline, isSelected && styles.checkboxFilled]}>
                                      {isSelected && <MaterialCommunityIcons name="check" size={16} color="#FFF" />}
                                  </View>
                              </TouchableOpacity>
                          );
                      })}
                  </ScrollView>
                  <TouchableOpacity style={styles.submitBtn} onPress={() => setIsTasksModalVisible(false)}><Text style={styles.submitBtnText}>Готово ({questTasks.length})</Text></TouchableOpacity>
              </View>
          </View>
        </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', marginLeft: -8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#EFEFEF', borderRadius: 12, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#888' },
  segmentTextActive: { color: '#1A1A1A' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },
  formContainer: { marginTop: 10 },
  libraryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionHeading: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 15 },
  cardBase: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 24, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3, borderWidth: 1, borderColor: '#F0F0F0' },
  cardSelected: { borderColor: '#FF3B30', backgroundColor: '#FFF5F5' },
  iconWrapper: { width: 54, height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 15, position: 'relative' },
  editBadge: { position: 'absolute', bottom: -5, right: -5, backgroundColor: '#3A3A3C', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  textColumn: { flex: 1, paddingHorizontal: 5, paddingVertical: 15, alignSelf: 'stretch', justifyContent: 'center' },
  textColumnOnlyView: { flex: 1, paddingHorizontal: 5, justifyContent: 'center' },
  inputTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A', padding: 0 },
  libTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A' },
  priceBadgeActive: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFD166', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, minWidth: 70, justifyContent: 'center' },
  priceBadgeActiveView: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFD166', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, minWidth: 60, justifyContent: 'center' },
  inputPrice: { fontWeight: '900', fontSize: 16, color: '#1A1A1A', padding: 0, textAlign: 'right' },
  inputPriceView: { fontWeight: '900', fontSize: 16, color: '#1A1A1A' },
  submitBtn: { backgroundColor: '#3A3A3C', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  cancelEditBtn: { marginTop: 15, alignItems: 'center', padding: 10 },
  cancelEditText: { color: '#888', fontSize: 14, fontWeight: '600' },
  toastContainer: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#3A3A3C', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 24, zIndex: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 10 },
  toastText: { color: '#FFF', fontSize: 15, fontWeight: 'bold', textAlign: 'center' },
  libraryRowWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  checkboxContainer: { paddingRight: 12, paddingVertical: 10, justifyContent: 'center', alignItems: 'center' },
  checkboxOutline: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#CCC', justifyContent: 'center', alignItems: 'center' },
  checkboxFilled: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  deleteBottomBar: { position: 'absolute', bottom: 30, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFF', padding: 12, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 15, elevation: 10 },
  cancelDeleteBtn: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },
  cancelDeleteText: { color: '#888', fontSize: 16, fontWeight: 'bold' },
  confirmDeleteBtn: { flex: 1.5, backgroundColor: '#FF3B30', padding: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmDeleteText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 25, paddingBottom: Platform.OS === 'ios' ? 40 : 25 },
  dragHandleArea: { width: '100%', alignItems: 'center', paddingTop: 15, paddingBottom: 15 },
  dragHandle: { width: 50, height: 5, borderRadius: 3, backgroundColor: '#CCC' },
  modalLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 10 },
  colorScroll: { paddingBottom: 20 },
  colorCircle: { width: 48, height: 48, borderRadius: 24, marginRight: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'transparent' },
  selectedColorCircle: { borderColor: '#CCC' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  optionCircle: { width: '18%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#F8F9FA', borderWidth: 2, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center', marginBottom: '2%' },
  closeModalBtn: { backgroundColor: '#3A3A3C', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 15 },
  closeModalText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#EFEFEF', marginVertical: 30 },
  emptyText: { textAlign: 'center', color: '#888', fontStyle: 'italic' },
  questCardPreview: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 20, borderLeftWidth: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  questCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  mainQuestIconBox: { width: 54, height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 15, position: 'relative' },
  headerTextInfo: { flex: 1, justifyContent: 'center' },
  questTitleInput: { fontSize: 18, fontWeight: 'bold', color: '#2C2C2E', marginBottom: 4, padding: 0 },
  overallProgressText: { fontSize: 13, color: '#888', fontWeight: '600' },
  rewardContainer: { justifyContent: 'flex-start', alignItems: 'flex-end', height: '100%' },
  questBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12 },
  badgeInput: { fontWeight: 'bold', fontSize: 14, padding: 0, minWidth: 20, textAlign: 'center' },
  dividerQuest: { width: '100%', height: 1, backgroundColor: '#EFEFEF', marginBottom: 15 },
  tasksListClickableArea: { width: '100%', minHeight: 60, justifyContent: 'center' },
  emptyTasksContainer: { alignItems: 'center', paddingVertical: 10 },
  emptyTasksText: { color: '#AAA', fontStyle: 'italic', textAlign: 'center' },
  taskRow: { marginBottom: 14 },
  taskTextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  taskNameContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  taskName: { fontSize: 14, color: '#555', fontWeight: '500', flexShrink: 1 },
  targetInputWrapper: { flexDirection: 'row', alignItems: 'center' },
  targetLabel: { fontSize: 13, color: '#888', fontWeight: '600' },
  targetInput: { fontSize: 14, fontWeight: 'bold', color: '#1A1A1A', padding: 0, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#CCC' },
  progressBarBg: { width: '100%', height: 6, backgroundColor: '#EAEAEA', borderRadius: 3 },
  tasksModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  tasksModalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, maxHeight: '80%' },
  tasksModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  tasksModalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' },
  tasksModalClose: { padding: 5 },
  tasksModalList: { marginBottom: 15 },
  taskSelectItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  taskSelectItemSelected: { backgroundColor: '#F8F9FA' },
  taskColorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  taskSelectText: { flex: 1, fontSize: 15, color: '#1A1A1A' }
});