import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function StatisticsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  const [trackedTasks, setTrackedTasks] = useState<string[]>([]);
  const [uniqueTaskTitles, setUniqueTaskTitles] = useState<string[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [tempSelection, setTempSelection] = useState<string[]>([]);

  const trackedTasksLoaded = useRef(false);
  const lastHapticIndex = useRef(0);

  // Загружаем сохранённый список — сначала из Supabase, потом AsyncStorage как fallback
  useEffect(() => {
    const loadSavedTasks = async () => {
      try {
        const userId = await AsyncStorage.getItem('user_id');
        if (userId) {
          const { data } = await supabase
            .from('profiles')
            .select('tracked_statistics')
            .eq('id', userId)
            .single();
          if (data?.tracked_statistics && data.tracked_statistics.length > 0) {
            setTrackedTasks(data.tracked_statistics);
            trackedTasksLoaded.current = true;
            return;
          }
        }
        // Fallback на AsyncStorage
        const savedTasks = await AsyncStorage.getItem('tracked_statistics');
        if (savedTasks) setTrackedTasks(JSON.parse(savedTasks));
      } catch (e) {
        console.error('Ошибка загрузки tracked_statistics:', e);
      } finally {
        trackedTasksLoaded.current = true;
      }
    };
    loadSavedTasks();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const room = await AsyncStorage.getItem('room_id');
      if (!room) return;

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*')
        .eq('room_id', room)
        .order('points', { ascending: false });

      if (profilesData) setProfiles(profilesData);

      const { data: historyData } = await supabase
        .from('task_history')
        .select('*')
        .eq('room_id', room);

      if (historyData) {
        // Фильтруем только реальные выполненные дела
        const filteredHistory = historyData.filter(h => {
          const isShopPurchase = h.image_url === 'shop';
          const isWishlistPurchase = h.task_title?.toLowerCase().includes('куплено');
          const isPenalty = h.image_url === 'error' || h.task_title?.toLowerCase().includes('просрочено');
          const isQuestReward = h.image_url === 'quest_reward';
          return !isShopPurchase && !isWishlistPurchase && !isPenalty && !isQuestReward && h.points > 0;
        });

        setHistory(filteredHistory);

        // Только уникальные названия реальных дел
        const uniqueTitles = Array.from(new Set(filteredHistory.map(h => h.task_title)))
          .filter(Boolean) as string[];
        setUniqueTaskTitles(uniqueTitles);
      }

    } catch (e) {
      console.error('Ошибка загрузки статистики:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempSelection([...trackedTasks]);
    setIsModalVisible(true);
  };

  const toggleTaskSelection = (title: string) => {
    Haptics.selectionAsync();
    setTempSelection(prev => {
      if (prev.includes(title)) return prev.filter(t => t !== title);
      if (prev.length >= 3) return prev;
      return [...prev, title];
    });
  };

  const saveSettings = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTrackedTasks(tempSelection);

    // Сохраняем в Supabase
    const userId = await AsyncStorage.getItem('user_id');
    if (userId) {
      await supabase
        .from('profiles')
        .update({ tracked_statistics: tempSelection })
        .eq('id', userId);
    }

    // И в AsyncStorage как fallback
    await AsyncStorage.setItem('tracked_statistics', JSON.stringify(tempSelection));
    setIsModalVisible(false);
  };

  const handleTaskScroll = (event: any) => {
    const currentOffset = event.nativeEvent.contentOffset.y;
    const index = Math.round(currentOffset / 70);
    if (index !== lastHapticIndex.current && index >= 0) {
      Haptics.selectionAsync();
      lastHapticIndex.current = index;
    }
  };

  const renderTrackedStats = () => {
    if (trackedTasks.length === 0) {
      return (
        <View style={styles.emptyTrackerCard}>
          <Text style={styles.emptyTrackerText}>
            Выберите до 3 задач для детального анализа активности участников.
          </Text>
          <TouchableOpacity style={styles.setupButton} onPress={openSettings} activeOpacity={0.8}>
            <Text style={styles.setupButtonText}>Настроить отслеживание</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.trackedContainer}>
        <View style={styles.trackedHeaderRow}>
          <Text style={styles.sectionTitle}>Детальная статистика</Text>
          <TouchableOpacity onPress={openSettings} style={styles.editIconBtn} activeOpacity={0.7}>
            <FontAwesome name="cog" size={20} color="#888" />
          </TouchableOpacity>
        </View>

        {trackedTasks.map((taskTitle, index) => {
          const taskHistory = history.filter(h => h.task_title === taskTitle);
          const totalDone = taskHistory.length;

          const countsByUser: Record<string, number> = {};
          profiles.forEach(p => (countsByUser[p.name] = 0));
          taskHistory.forEach(h => {
            if (countsByUser[h.user_name] !== undefined) countsByUser[h.user_name] += 1;
          });
          const sortedUsers = Object.entries(countsByUser).sort((a, b) => b[1] - a[1]);

          return (
            <View key={index} style={styles.statCard}>
              <Text style={styles.statCardTitle}>{taskTitle}</Text>
              <Text style={styles.statCardTotal}>Всего выполнено: {totalDone} раз</Text>
              <View style={styles.statBarsContainer}>
                {sortedUsers.map(([name, count], i) => {
                  const percentage = totalDone === 0 ? 0 : (count / totalDone) * 100;
                  const barColor = i === 0 && count > 0 ? '#1A1A1A' : '#CCC';
                  return (
                    <View key={name} style={styles.statRow}>
                      <Text style={styles.statRowName} numberOfLines={1}>{name}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: barColor }]} />
                      </View>
                      <Text style={styles.statRowCount}>{count}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          activeOpacity={0.7}
        >
          <FontAwesome name="angle-left" size={28} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Общий рейтинг</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#1A1A1A" style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.mainLeaderboard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.columnText, { width: 30 }]}></Text>
                <Text style={[styles.columnText, { flex: 1 }]}></Text>
                <Text style={[styles.columnText, { width: 60, textAlign: 'center' }]}>Дела</Text>
                <Text style={[styles.columnText, { width: 60, textAlign: 'right' }]}>Баллы</Text>
              </View>
              {profiles.map((profile, index) => (
                <View key={profile.id} style={styles.tableRow}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                  <Text style={styles.nameText} numberOfLines={1}>{profile.name}</Text>
                  <Text style={styles.tasksText}>{profile.tasks_done || 0}</Text>
                  <Text style={styles.pointsText}>{profile.points || 0}</Text>
                </View>
              ))}
            </View>
            {renderTrackedStats()}
          </>
        )}
      </ScrollView>

      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsModalVisible(false)}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Настройка статистики</Text>
            <Text style={styles.modalSub}>
              Выбери до 3 задач для отслеживания ({tempSelection.length}/3)
            </Text>
            <ScrollView
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
              onScroll={handleTaskScroll}
              scrollEventThrottle={16}
            >
              {uniqueTaskTitles.length === 0 ? (
                <Text style={styles.emptyText}>История задач пуста.</Text>
              ) : (
                uniqueTaskTitles.map((title, i) => {
                  const isSelected = tempSelection.includes(title);
                  const isDisabled = !isSelected && tempSelection.length >= 3;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.taskOption,
                        isSelected && styles.taskOptionSelected,
                        isDisabled && { opacity: 0.5 },
                      ]}
                      onPress={() => !isDisabled && toggleTaskSelection(title)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.taskOptionText, isSelected && styles.taskOptionTextSelected]}>
                        {title}
                      </Text>
                      {isSelected && <FontAwesome name="check-circle" size={20} color="#1A1A1A" />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <TouchableOpacity style={styles.saveButton} onPress={saveSettings} activeOpacity={0.8}>
              <Text style={styles.saveButtonText}>Сохранить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setIsModalVisible(false)} activeOpacity={0.6}>
              <Text style={styles.cancelButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1A1A1A' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 15 },
  mainLeaderboard: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 30,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  tableHeader: {
    flexDirection: 'row', paddingBottom: 8, marginBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  columnText: { fontSize: 11, fontWeight: '700', color: '#AAA', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F8F9FA',
  },
  rankText: { width: 30, fontSize: 16, fontWeight: '900', color: '#1A1A1A' },
  nameText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1A1A1A', paddingRight: 10 },
  tasksText: { width: 60, fontSize: 16, fontWeight: '600', color: '#888', textAlign: 'center' },
  pointsText: { width: 60, fontSize: 16, fontWeight: 'bold', color: '#1A1A1A', textAlign: 'right' },
  trackedContainer: { marginTop: 10 },
  trackedHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editIconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end', paddingBottom: 15 },
  emptyTrackerCard: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 25, alignItems: 'center',
    borderStyle: 'dashed', borderWidth: 2, borderColor: '#EFEFEF',
  },
  emptyTrackerText: { fontSize: 15, color: '#888', textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  setupButton: { backgroundColor: '#1A1A1A', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  setupButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  statCard: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  statCardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 4 },
  statCardTotal: { fontSize: 13, color: '#888', marginBottom: 15 },
  statBarsContainer: { marginTop: 5 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statRowName: { width: 80, fontSize: 14, fontWeight: '500', color: '#1A1A1A' },
  barTrack: { flex: 1, height: 8, backgroundColor: '#F0F0F0', borderRadius: 4, marginHorizontal: 10, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  statRowCount: { width: 30, fontSize: 14, fontWeight: 'bold', color: '#1A1A1A', textAlign: 'right' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#F8F9FA', borderTopLeftRadius: 30, borderTopRightRadius: 30,
    padding: 25, maxHeight: '80%',
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 5, textAlign: 'center' },
  modalSub: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 20 },
  modalScroll: { marginBottom: 20 },
  taskOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#EFEFEF',
  },
  taskOptionSelected: { borderColor: '#1A1A1A', backgroundColor: '#FAFAFA' },
  taskOptionText: { fontSize: 16, color: '#1A1A1A', fontWeight: '500', flex: 1 },
  taskOptionTextSelected: { fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 20 },
  saveButton: { width: '100%', backgroundColor: '#1A1A1A', padding: 18, borderRadius: 16, alignItems: 'center', marginBottom: 10 },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  cancelButton: { width: '100%', padding: 15, alignItems: 'center' },
  cancelButtonText: { color: '#888', fontSize: 16, fontWeight: '600' },
});
