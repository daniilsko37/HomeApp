import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  DeviceEventEmitter,
  LayoutAnimation,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export default function QuestsScreen() {
  const router = useRouter();
  const { highlight } = useLocalSearchParams();

  const [quests, setQuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Тост
  const [toastQuest, setToastQuest] = useState<any | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (highlight) {
      highlightAnim.setValue(0.4);
      Animated.timing(highlightAnim, {
        toValue: 0,
        duration: 1200,
        delay: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [highlight, highlightAnim]);

  useFocusEffect(
    useCallback(() => {
      syncAndFetchQuests();
    }, [])
  );

  const showToast = (quest: any) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastQuest(quest);
    toastAnim.setValue(0);
    Animated.spring(toastAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 70,
      friction: 10,
    }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setToastQuest(null));
    }, 1500); // 🪄 Чуть увеличили время показа (1.5 секунды)
  };

  const toggleExpanded = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const syncAndFetchQuests = async () => {
    try {
      setLoading(true);
      const roomId = await AsyncStorage.getItem('room_id');
      const userName = await AsyncStorage.getItem('user_name');
      if (!roomId || !userName) return;

      const { data: templates } = await supabase
        .from('quests')
        .select('*')
        .eq('room_id', roomId)
        .is('user_name', null);
      const { data: myQuests } = await supabase
        .from('quests')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_name', userName);

      if (templates && templates.length > 0) {
        for (const tmpl of templates) {
          const exists = myQuests?.find(q => q.title === tmpl.title);
          if (!exists) {
            const { data: newQuest } = await supabase
              .from('quests')
              .insert([{
                room_id: roomId,
                title: tmpl.title,
                color: tmpl.color,
                icon: tmpl.icon,
                reward: tmpl.reward,
                is_active: true,
                user_name: userName,
              }])
              .select()
              .single();

            const { data: tmplTasks } = await supabase
              .from('quest_tasks')
              .select('*')
              .eq('quest_id', tmpl.id);
            if (tmplTasks && newQuest) {
              const newTasks = tmplTasks.map(t => ({
                quest_id: newQuest.id,
                task_id: t.task_id,
                task_title: t.task_title,
                target_count: t.target_count,
                current_count: 0,
              }));
              await supabase.from('quest_tasks').insert(newTasks);
            }
          }
        }
      }

      const { data: questsData, error: questsError } = await supabase
        .from('quests')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_name', userName)
        .order('created_at', { ascending: true });

      if (questsError) throw questsError;
      if (!questsData || questsData.length === 0) {
        setQuests([]);
        DeviceEventEmitter.emit('questProgressUpdated');
        return;
      }

      const questIds = questsData.map(q => q.id);
      const { data: tasksData, error: tasksError } = await supabase
        .from('quest_tasks')
        .select('*')
        .in('quest_id', questIds);

      if (tasksError) throw tasksError;

      const LEVEL_MAP: any = { I: 1, II: 2, III: 3 };
      const chains: Record<string, any[]> = {};
      const standalone: any[] = [];

      questsData.forEach(quest => {
        const match = quest.title.match(/^(.*?)\s+(I|II|III)$/i);
        if (match) {
          const baseName = match[1].trim();
          const levelStr = match[2].toUpperCase();
          if (!chains[baseName]) chains[baseName] = [];
          chains[baseName].push({ ...quest, levelNum: LEVEL_MAP[levelStr] });
        } else {
          standalone.push(quest);
        }
      });

      const activeQuestsToDisplay: any[] = [];

      Object.keys(chains).forEach(baseName => {
        const chainQuests = chains[baseName].sort((a, b) => a.levelNum - b.levelNum);
        const currentQuest = chainQuests.find(q => !q.is_claimed);
        if (currentQuest) activeQuestsToDisplay.push(currentQuest);
      });

      standalone.forEach(quest => {
        if (!quest.is_claimed) activeQuestsToDisplay.push(quest);
      });

      const finalQuests = activeQuestsToDisplay.map(quest => {
        const myTasks = (tasksData || [])
          .filter(t => t.quest_id === quest.id)
          .map(t => ({
            id: t.id,
            name: t.task_title,
            current: t.current_count || 0,
            target: t.target_count || 1,
          }));

        const isDone = myTasks.length > 0 && myTasks.every(t => t.current >= t.target);
        // Квест «в процессе» — если хотя бы одна задача начата, но не все выполнены
        const isStarted = myTasks.some(t => t.current > 0);
        
        // 🪄 Считаем общий прогресс в % для сортировки
        const totalCurrent = myTasks.reduce((sum: number, t: any) => sum + Math.min(t.current, t.target), 0);
        const totalTarget = myTasks.reduce((sum: number, t: any) => sum + t.target, 0);
        const progress = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;

        return { ...quest, tasks: myTasks, isDone, isStarted, progress };
      });

      setExpandedIds(prev => {
        const next = new Set(prev);
        finalQuests.forEach(q => {
          if (q.isDone) next.add(q.id);
        });
        return next;
      });

      setQuests(finalQuests);
      DeviceEventEmitter.emit('questProgressUpdated');
    } catch (error) {
      console.error('Ошибка загрузки квестов:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimReward = async (quest: any) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setClaimingId(quest.id);

      const roomId = await AsyncStorage.getItem('room_id');
      const userName = await AsyncStorage.getItem('user_name');
      if (!roomId || !userName) return;

      await supabase.from('quests').update({ is_claimed: true }).eq('id', quest.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('room_id', roomId)
        .eq('name', userName)
        .single();

      if (profile) {
        const newPoints = (profile.points || 0) + quest.reward;
        await supabase.from('profiles').update({ points: newPoints }).eq('id', profile.id);
        await supabase.from('task_history').insert([{
          user_name: userName,
          task_title: `Награда за квест: ${quest.title}`,
          points: quest.reward,
          room_id: roomId,
          image_url: 'quest_reward',
        }]);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(quest);
      await syncAndFetchQuests();
    } catch (error) {
      console.error(error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setClaimingId(null);
    }
  };

  const renderQuestCard = (quest: any) => {
    const safeColor = quest.color || '#4CC9F0';
    const badgeTextColor = quest.color === '#FFD166' ? '#333' : '#FFF';
    const isExpanded = expandedIds.has(quest.id);
    const isClaiming = claimingId === quest.id;
    const isHighlighted = highlight === quest.id;

    // Прогресс уже подсчитан в finalQuests, но можно юзать quest.progress
    const overallProgress = quest.progress || 0;

    const doneTasks = quest.tasks.filter((t: any) => t.current >= t.target).length;
    const totalTasks = quest.tasks.length;

    return (
      <View
        key={quest.id}
        style={[
          styles.questCard,
          { borderLeftColor: safeColor },
          quest.isDone && { borderColor: safeColor, borderWidth: 2, borderLeftWidth: 6 },
        ]}
      >
        {isHighlighted && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: safeColor,
                opacity: highlightAnim,
                borderRadius: 16,
                zIndex: 1,
              },
            ]}
            pointerEvents="none"
          />
        )}

        <TouchableOpacity
          onPress={() => toggleExpanded(quest.id)}
          activeOpacity={0.7}
          style={styles.cardHeader}
        >
          <View style={[styles.mainIconBox, { backgroundColor: safeColor + '20' }]}>
            <MaterialCommunityIcons name={quest.icon as any} size={28} color={safeColor} />
          </View>

          <View style={styles.headerTextInfo}>
            <Text style={styles.questTitle} numberOfLines={1}>{quest.title}</Text>

            <View style={styles.overallProgressBarBg}>
              <View
                style={[
                  styles.overallProgressBarFill,
                  { width: `${overallProgress}%` as any, backgroundColor: safeColor },
                ]}
              />
            </View>

            {quest.isDone ? (
              <Text style={[styles.overallProgressText, { color: safeColor }]}>
                Все этапы завершены!
              </Text>
            ) : (
              <Text style={styles.overallProgressText}>
                {doneTasks} из {totalTasks} задач · {overallProgress}%
              </Text>
            )}
          </View>

          <View style={styles.rightCol}>
            <View style={[styles.badge, { backgroundColor: safeColor }]}>
              <FontAwesome name="star" size={12} color={badgeTextColor} />
              <Text style={[styles.badgeText, { color: badgeTextColor }]}>
                {quest.reward}
              </Text>
            </View>
            <MaterialCommunityIcons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#CCC"
              style={{ marginTop: 6 }}
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <>
            <View style={styles.divider} />

            <View style={styles.tasksList}>
              {quest.tasks.map((task: any, index: number) => {
                const isTaskDone = task.current >= task.target;
                return (
                  <View key={index} style={styles.taskRow}>
                    <View style={styles.taskNameContainer}>
                      <FontAwesome
                        name={isTaskDone ? 'check-circle' : 'circle-thin'}
                        size={16}
                        color={isTaskDone ? safeColor : '#CCC'}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={[
                          styles.taskName,
                          isTaskDone && { color: '#1A1A1A', fontWeight: 'bold' },
                        ]}
                        numberOfLines={1}
                      >
                        {task.name}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.taskProgressText,
                        isTaskDone && { color: safeColor, fontWeight: 'bold' },
                      ]}
                    >
                      {Math.min(task.current, task.target)} / {task.target}
                    </Text>
                  </View>
                );
              })}
            </View>

            {quest.isDone && (
              <TouchableOpacity
                style={[
                  styles.claimButton,
                  { backgroundColor: safeColor },
                  isClaiming && { opacity: 0.7 },
                ]}
                onPress={() => handleClaimReward(quest)}
                disabled={isClaiming}
              >
                {isClaiming ? (
                  <ActivityIndicator color={badgeTextColor} />
                ) : (
                  <>
                    <Text style={[styles.claimButtonText, { color: badgeTextColor }]}>
                      Забрать награду
                    </Text>
                    <FontAwesome
                      name="star"
                      size={14}
                      color={badgeTextColor}
                      style={{ marginLeft: 6 }}
                    />
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    );
  };

  // 🪄 Три группы и сортировка IN PROGRESS
  const doneQuests = quests.filter(q => q.isDone);
  const inProgressQuests = quests.filter(q => !q.isDone && q.isStarted).sort((a, b) => b.progress - a.progress);
  const newQuests = quests.filter(q => !q.isDone && !q.isStarted);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <MaterialCommunityIcons name="chevron-left" size={32} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Личные квесты</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {loading && quests.length === 0 ? (
          <ActivityIndicator size="large" color="#1A1A1A" style={{ marginTop: 50 }} />
        ) : quests.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            <MaterialCommunityIcons
              name="treasure-chest"
              size={60}
              color="#CCC"
              style={{ marginBottom: 15 }}
            />
            <Text style={{ color: '#888', fontSize: 16 }}>Пока нет доступных квестов</Text>
          </View>
        ) : (
          <>
            {doneQuests.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Выполнено</Text>
                {doneQuests.map(q => renderQuestCard(q))}
              </View>
            )}

            {inProgressQuests.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>В процессе</Text>
                {inProgressQuests.map(q => renderQuestCard(q))}
              </View>
            )}

            {newQuests.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Новые</Text>
                {newQuests.map(q => renderQuestCard(q))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Тост — появляется после получения награды */}
      <Modal visible={!!toastQuest} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.toastCard,
              {
                opacity: toastAnim,
                transform: [{
                  scale: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }),
                }],
              },
            ]}
          >
            {toastQuest && (() => {
              const qColor = toastQuest.color || '#4CC9F0';
              const qTextColor = qColor === '#FFD166' ? '#333' : '#FFF';
              
              return (
                <>
                  <View style={[styles.toastIconCircle, { backgroundColor: qColor + '20' }]}>
                    <MaterialCommunityIcons
                      name={toastQuest.icon as any}
                      size={48}
                      color={qColor}
                    />
                  </View>
                  <Text style={styles.toastTitle}>{toastQuest.title}</Text>
                  <Text style={styles.toastDesc}>Квест выполнен!</Text>
                  
                  {/* 🪄 ПЛАШКА В ЦВЕТ КВЕСТА: +15 ⭐️ */}
                  <View style={[styles.toastRewardPill, { backgroundColor: qColor }]}>
                    <Text style={[styles.toastRewardText, { color: qTextColor }]}>+{toastQuest.reward}</Text>
                    <FontAwesome name="star" size={16} color={qTextColor} />
                  </View>
                </>
              );
            })()}
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 15,
  },
  backButton: { width: 44, height: 44, justifyContent: 'center', marginLeft: -8 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1A1A1A' },
  container: { paddingHorizontal: 20, paddingBottom: 40 },

  section: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#AAAAAA',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 2,
  },

  questCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  mainIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTextInfo: { flex: 1, justifyContent: 'center' },
  questTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 6 },

  overallProgressBarBg: {
    width: '90%',
    height: 6,
    backgroundColor: '#EAEAEA',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  overallProgressBarFill: { height: '100%', borderRadius: 3 },
  overallProgressText: { fontSize: 12, color: '#888', fontWeight: '600' },

  rightCol: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  badgeText: { fontWeight: 'bold', fontSize: 13, marginLeft: 4 },

  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#F0F0F0',
    marginTop: 14,
    marginBottom: 12,
    zIndex: 2,
  },

  tasksList: { width: '100%', zIndex: 2 },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  taskName: { fontSize: 13, color: '#555', fontWeight: '500', flexShrink: 1 },
  taskProgressText: { fontSize: 13, color: '#888', fontWeight: '600' },

  claimButton: {
    flexDirection: 'row',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  claimButtonText: { fontSize: 15, fontWeight: 'bold' },

  // Тост
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toastCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 32,
    alignItems: 'center',
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  toastIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  toastTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 6,
  },
  toastDesc: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
  },
  toastRewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toastRewardText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});