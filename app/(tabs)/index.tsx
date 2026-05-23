import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, DeviceEventEmitter, Image, Modal, PanResponder, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { RoutineCard } from '../../components/RoutineCard';
import { supabase } from '../../lib/supabase';

export default function HomeScreen() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [manualTasks, setManualTasks] = useState<any[]>([]);
  const [topQuests, setTopQuests] = useState<any[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'yellow' | 'violet'>('yellow');
  
  const router = useRouter();
  const { width } = useWindowDimensions();

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

  const today = new Date();
  const formattedDate = useMemo(() => {
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return 'Сегодня ' + today.getDate() + ' ' + months[today.getMonth()];
  }, []);

  const weekDays = useMemo(() => {
    const daysOfWeek = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const startOfWeek = new Date(today);
    const diff = today.getDay() === 0 ? -6 : 1 - today.getDay();
    startOfWeek.setDate(today.getDate() + diff);

    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      return {
        dayName: daysOfWeek[d.getDay()],
        dateNumber: d.getDate(),
        isToday: d.toDateString() === today.toDateString()
      };
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkAndFetchTasks(true); 
      const sub = DeviceEventEmitter.addListener('questProgressUpdated', () => checkAndFetchTasks(false)); 
      return () => sub.remove();
    }, [])
  );

  const checkAndFetchTasks = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const name = await AsyncStorage.getItem('user_name');
      const room = await AsyncStorage.getItem('room_id');
      if (!name || !room) return router.replace('/login');
      setUserName(name);

      const todayZero = new Date();
      todayZero.setHours(0, 0, 0, 0);
      
      const yyyy = todayZero.getFullYear();
      const mm = (todayZero.getMonth() + 1).toString().padStart(2, '0');
      const dd = todayZero.getDate().toString().padStart(2, '0');
      const todayStr = yyyy + "-" + mm + "-" + dd;

      const { data: myQuests } = await supabase
        .from('quests')
        .select('*')
        .eq('room_id', room)
        .eq('user_name', name)
        .eq('is_claimed', false)
        .order('created_at', { ascending: true });
      
      if (myQuests && myQuests.length > 0) {
        const uniqueQuests: any[] = [];
        const seenBases = new Set();
        myQuests.forEach(q => {
          const match = q.title.match(/^(.*?)\s+(I|II|III)$/i);
          if (match) {
            const baseName = match[1].trim();
            if (!seenBases.has(baseName)) {
              seenBases.add(baseName);
              uniqueQuests.push(q);
            }
          } else {
            uniqueQuests.push(q);
          }
        });

        const questsWithProgress = await Promise.all(uniqueQuests.map(async (topQuest) => {
          const { data: qTasks } = await supabase.from('quest_tasks').select('*').eq('quest_id', topQuest.id);
          if (qTasks && qTasks.length > 0) {
            const totalCurrent = qTasks.reduce((sum: number, t: any) => sum + Math.min(t.current_count || 0, t.target_count || 1), 0);
            const totalTarget = qTasks.reduce((sum: number, t: any) => sum + (t.target_count || 1), 0);
            topQuest.progress = totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;
          } else {
            topQuest.progress = 0;
          }
          return topQuest;
        }));

        questsWithProgress.sort((a, b) => b.progress - a.progress);
        setTopQuests(questsWithProgress.slice(0, 3));
      } else {
        setTopQuests([]);
      }

      const { data: allTasks, error: fetchErr } = await supabase.from('tasks').select('*').eq('room_id', room);
      if (fetchErr) throw fetchErr;

      const { data: profiles } = await supabase.from('profiles').select('*').eq('room_id', room);

      for (const task of allTasks) {
        // ВОЗРОЖДЕНИЕ ЗАДАЧИ
        if (task.status === 'done' && task.type === 'green' && task.start_date) {
          const taskDate = new Date(task.start_date);
          taskDate.setHours(0, 0, 0, 0);

          const nextDueDate = new Date(taskDate);
          nextDueDate.setDate(taskDate.getDate() + (task.frequency_days || 0));

          if (todayZero >= nextDueDate) {
            const ny = nextDueDate.getFullYear();
            const nm = (nextDueDate.getMonth() + 1).toString().padStart(2, '0');
            const nd = nextDueDate.getDate().toString().padStart(2, '0');
            const nextDateStr = ny + "-" + nm + "-" + nd;

            await supabase.from('tasks').update({ 
              status: 'todo',
              start_date: nextDateStr,  
              assignee: null,
              last_penalty_date: null,
              submitted_at: null 
            }).eq('id', task.id);
          }
        }

        const isAutoTask = task.type === 'green' || task.type === 'blue';
        const isActiveState = task.status === 'todo' || task.status === 'in_progress';
        
        if (isAutoTask && isActiveState && task.start_date) {
          const creationDate = new Date(task.start_date);
          creationDate.setHours(0, 0, 0, 0);
          
          // ЗАЩИТА: Если задача в будущем - никаких штрафов!
          if (creationDate > todayZero) {
            continue;
          }
          
          const diffTime = todayZero.getTime() - creationDate.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays >= 3 && task.last_penalty_date !== todayStr) {
            if (task.status === 'todo') {
              if (profiles) {
                for (const p of profiles) {
                  await supabase.from('profiles').update({ points: (p.points || 0) - 1 }).eq('id', p.id);
                  await supabase.from('task_history').insert([{
                    user_name: p.name, task_title: "Просрочено: " + task.title, points: 0, penalty: 1, room_id: room, image_url: 'error' 
                  }]);
                }
              }
            } else if (task.status === 'in_progress' && task.assignee) {
              const assigneeProfile = profiles?.find(p => p.name === task.assignee);
              if (assigneeProfile) {
                await supabase.from('profiles').update({ points: (assigneeProfile.points || 0) - 1 }).eq('id', assigneeProfile.id);
                await supabase.from('task_history').insert([{
                  user_name: assigneeProfile.name, task_title: "Просрочено: " + task.title, points: 0, penalty: 1, room_id: room, image_url: 'error' 
                }]);
              }
            }
            await supabase.from('tasks').update({ last_penalty_date: todayStr }).eq('id', task.id);
          }
        }
      }

      // БЕРЕМ ТОЛЬКО НОВЫЕ ЗАДАЧИ ДЛЯ ГЛАВНОГО ЭКРАНА
      const { data: activeTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'todo') // ВОЗВРАЩЕНО 'todo'
        .eq('room_id', room)
        .lte('start_date', todayStr);

      const sortedActive = (activeTasks || []).map(task => {
        let isOverdue = false;
        if ((task.type === 'green' || task.type === 'blue') && task.start_date) {
          const cDate = new Date(task.start_date);
          cDate.setHours(0, 0, 0, 0);
          const diff = Math.floor((todayZero.getTime() - cDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diff >= 3) isOverdue = true;
        }
        return { ...task, isOverdue };
      }).sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999));

      setTasks(sortedActive);

      const { data: mTasks } = await supabase.from('tasks').select('*').in('type', ['yellow', 'violet']).eq('room_id', room).in('status', ['idle', 'done']);
      const filteredManual = (mTasks || []).filter((t: any) => t.frequency_days !== -1);
      const sortedManual = filteredManual.sort((a, b) => (a.sort_order || 999) - (b.sort_order || 999));
      setManualTasks(sortedManual);

    } catch (error) {
      console.error('Ошибка:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await checkAndFetchTasks(false); 
    setRefreshing(false);
  }, []);

  const takeTaskInWork = async (taskId: any) => {
    if (!taskId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // МГНОВЕННО УБИРАЕМ ЗАДАЧУ С ЭКРАНА
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    
    try {
      await supabase.from('tasks').update({ status: 'in_progress', assignee: userName }).eq('id', taskId);
    } catch (error) {
      console.error(error);
      checkAndFetchTasks(false); 
    }
  };

  const summonTask = async (taskId: any) => {
    try {
      const taskTemplate = manualTasks.find(t => t.id === taskId);
      if (!taskTemplate) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const d = new Date();
      const syyyy = d.getFullYear();
      const smm = (d.getMonth() + 1).toString().padStart(2, '0');
      const sdd = d.getDate().toString().padStart(2, '0');
      const todayStr = syyyy + "-" + smm + "-" + sdd;
      
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let newId = '';
      for (let i = 0; i < 8; i++) newId += chars.charAt(Math.floor(Math.random() * chars.length));

      const { error } = await supabase.from('tasks').insert([{
        id: newId,
        room_id: taskTemplate.room_id,
        title: taskTemplate.title,
        points: taskTemplate.points,
        type: taskTemplate.type,
        description: taskTemplate.description,
        image_url: taskTemplate.image_url,
        start_date: todayStr,
        status: 'in_progress',
        assignee: userName,
        frequency_days: -1 
      }]);

      if (error) throw error;
      await checkAndFetchTasks(false);
      showToast('Задача взята в работу!');
    } catch (error) {
      console.error("Ошибка вызова задачи:", error);
    }
  };

  const getBadgeColor = (type: string) => {
    if (type === 'yellow') return '#FFD166';
    if (type === 'violet') return '#B19CD9';
    if (type === 'orange') return '#F4A261';
    if (type === 'blue') return '#4CC9F0';
    return '#2ECC71';
  };

  const filteredManualTasks = manualTasks.filter(task => task.type === activeModalTab);

  const isTabBarVisible = useRef(true); 
  const prevOffset = useRef(0);

  const handleScroll = (event: any) => {
    const currentOffset = event.nativeEvent.contentOffset.y;
    const diff = currentOffset - prevOffset.current;

    if (Math.abs(diff) > 10) {
      if (diff > 0 && currentOffset > 50) {
        if (isTabBarVisible.current) {
          DeviceEventEmitter.emit('toggleTabBar', false);
          isTabBarVisible.current = false;
        }
      } else {
        if (!isTabBarVisible.current) {
          DeviceEventEmitter.emit('toggleTabBar', true);
          isTabBarVisible.current = true;
        }
      }
      prevOffset.current = currentOffset;
    }
  };

  const slideAnim = useRef(new Animated.Value(800)).current;

  React.useEffect(() => {
    if (isModalVisible) {
      slideAnim.setValue(800);
      Animated.spring(slideAnim, { toValue: 0, bounciness: 6, useNativeDriver: true }).start();
    }
  }, [isModalVisible]);

  const closeModalGracefully = () => {
    Animated.timing(slideAnim, { toValue: 800, duration: 250, useNativeDriver: true }).start(() => {
      setIsModalVisible(false);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) slideAnim.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150 || gestureState.vy > 1.5) {
          closeModalGracefully();
        } else {
          Animated.spring(slideAnim, { toValue: 0, bounciness: 6, useNativeDriver: true }).start();
        }
      }
    })
  ).current;

  const questCardWidth = topQuests.length === 1 ? width - 40 : 280;

  return (
    <View style={styles.safeArea}>
      <ScrollView 
        contentContainerStyle={styles.container} 
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2C2C2E']}
            tintColor="#2C2C2E"
          />
        }
      >
        
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.iconCircle}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/gallery' as any);
            }}
          >
            <FontAwesome name="image" size={18} color="#2C2C2E" />
          </TouchableOpacity>
          
          <View style={styles.headerTextCenter}>
            <Text style={styles.greeting}>Привет, {userName}</Text>
            <Text style={styles.dateSubtext}>{formattedDate}</Text>
          </View>

          <TouchableOpacity 
            style={styles.iconCircle} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsModalVisible(true);
            }}
          >
            <FontAwesome name="plus" size={20} color="#2C2C2E" />
          </TouchableOpacity>
        </View>

        <View style={styles.widgetWrapper}>
          {topQuests.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEnabled={topQuests.length > 1}
              contentContainerStyle={{ paddingLeft: 20, paddingRight: 5, paddingBottom: 5 }}
            >
              {topQuests.map((quest) => {
                const isCompleted = quest.progress >= 100;
                const isStarted = quest.progress > 0 && !isCompleted;
                const questColor = quest.color || '#4CC9F0';

                let statusLabel = 'Новое';
                if (isCompleted) statusLabel = 'Выполнено';
                else if (isStarted) statusLabel = 'В процессе';

                return (
                  <TouchableOpacity 
                    key={quest.id}
                    style={[
                      styles.questWidgetCard,
                      { borderLeftColor: questColor, width: questCardWidth },
                      isCompleted && {
                        backgroundColor: questColor + '15',
                        borderWidth: 1,
                        borderColor: questColor,
                      }
                    ]}
                    activeOpacity={0.8}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push({ pathname: '/quests', params: { highlight: quest.id } } as any);
                    }}
                  >
                    <View style={styles.widgetHeader}>
                      <View style={[styles.widgetIconBox, { backgroundColor: questColor + '20' }]}>
                        <MaterialCommunityIcons 
                          name={quest.icon as any} 
                          size={24} 
                          color={questColor} 
                        />
                      </View>
                      <View style={styles.widgetTextInfo}>
                        <Text style={[styles.widgetLabel, isCompleted && { color: questColor, fontWeight: '700' }]}>
                          {statusLabel}
                        </Text>
                        <Text style={styles.widgetTitle} numberOfLines={1}>{quest.title}</Text>
                      </View>
                      <View style={[styles.widgetBadge, { backgroundColor: questColor }]}>
                        <FontAwesome name="star" size={10} color={questColor === '#FFD166' ? '#333' : '#FFF'} />
                        <Text style={[styles.widgetBadgeText, { color: questColor === '#FFD166' ? '#333' : '#FFF' }]}>{quest.reward}</Text>
                      </View>
                    </View>
                    <View style={styles.widgetProgressRow}>
                      <View style={[styles.widgetProgressBarBg, isCompleted && { backgroundColor: '#FFF' }]}>
                        <View style={[styles.widgetProgressBarFill, { width: `${quest.progress}%`, backgroundColor: questColor }]} />
                      </View>
                      <Text style={[styles.widgetProgressPercent, isCompleted && { color: questColor }]}>{quest.progress}%</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <TouchableOpacity 
              style={styles.questWidgetCardEmpty}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/quests' as any);
              }}
            >
              <MaterialCommunityIcons name="star-face" size={26} color="#888" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyWidgetTitle}>Нет активных квестов!</Text>
                <Text style={styles.emptyWidgetSub}>Отдыхай или создай новые квесты.</Text>
              </View>
              <FontAwesome name="chevron-right" size={14} color="#CCC" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.calendarContainer}>
          {weekDays.map((day, index) => (
            <View key={index} style={styles.dayColumn}>
              <Text style={[styles.dayName, day.isToday && styles.dayNameActive]}>{day.dayName}</Text>
              <View style={[styles.dayCircle, day.isToday && styles.dayCircleActive]}>
                <Text style={[styles.dayNumber, day.isToday && styles.dayNumberActive]}>{day.dateNumber}</Text>
              </View>
            </View>
          ))}
        </View>
        
        <View style={styles.tasksContainer}>
          {loading && !refreshing ? ( 
            <ActivityIndicator size="large" color="#2C2C2E" style={{ marginTop: 50 }} />
          ) : tasks.length === 0 ? (
            <Text style={styles.emptyText}>На сегодня всё! Отдыхаем!</Text>
          ) : (
            tasks.map((task) => (
              <RoutineCard 
                key={task.id}
                title={task.title} 
                badgePoints={task.points || 0} 
                badgeColor={getBadgeColor(task.type)}
                descriptionLines={task.description || []} 
                imageSource={task.image_url ? { uri: task.image_url } : undefined} 
                onPress={() => takeTaskInWork(task.id)}
                isOverdue={task.isOverdue} 
              />
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={isModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeModalGracefully} />
          <Animated.View style={[styles.modalContent, { transform: [{ translateY: slideAnim }] }]}>
            <View {...panResponder.panHandlers} style={{ width: '100%', alignItems: 'center' }}>
              <View style={{ width: 40, height: 5, backgroundColor: '#DDD', borderRadius: 3, marginBottom: 15 }} />
            </View>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Вызвать задачу</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={closeModalGracefully}>
                <FontAwesome name="times-circle" size={28} color="#888" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalTabs}>
              <TouchableOpacity 
                style={[styles.modalTab, activeModalTab === 'yellow' && styles.modalTabActive]} 
                onPress={() => { Haptics.selectionAsync(); setActiveModalTab('yellow'); }}
              >
                <Text style={[styles.modalTabText, activeModalTab === 'yellow' && styles.modalTabTextActive]}>Ручное</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalTab, activeModalTab === 'violet' && styles.modalTabActive]} 
                onPress={() => { Haptics.selectionAsync(); setActiveModalTab('violet'); }}
              >
                <Text style={[styles.modalTabText, activeModalTab === 'violet' && styles.modalTabTextActive]}>Готовка</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
              {filteredManualTasks.length === 0 ? (
                <Text style={styles.emptyText}>Нет задач в этой категории.</Text>
              ) : (
                filteredManualTasks.map(task => (
                  <TouchableOpacity key={task.id} style={[styles.summonCard, { borderLeftColor: getBadgeColor(task.type) }]} onPress={() => summonTask(task.id)}>
                    <View style={styles.cardLeftColumn}>
                      <View style={[styles.cardBadge, { backgroundColor: getBadgeColor(task.type) }]}>
                        <FontAwesome name="star" size={14} color={task.type === 'yellow' ? '#333' : '#fff'} />
                        <Text style={[styles.cardBadgeText, { color: task.type === 'yellow' ? '#333' : '#fff' }]}>{task.points}</Text>
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={2}>{task.title}</Text>
                      <View style={styles.cardDivider} />
                      <View style={styles.cardDescContainer}>
                        {(task.description || []).map((line: string, i: number) => (
                          <Text key={i} style={styles.cardDescriptionLine} numberOfLines={2}>{line}</Text>
                        ))}
                      </View>
                    </View>
                    <View style={styles.cardRightColumn}>
                      {task.image_url ? <Image source={{ uri: task.image_url }} style={styles.cardImage} /> : null}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Animated.View>
          {toastMessage && (
            <Animated.View style={[styles.toastContainer, { opacity: toastFade }]} pointerEvents="none">
              <Text style={styles.toastText}>{toastMessage}</Text>
            </Animated.View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA', paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  container: { paddingBottom: 120 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 10, marginBottom: 15 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  headerTextCenter: { alignItems: 'center' },
  greeting: { fontSize: 18, fontWeight: 'bold', color: '#2C2C2E' },
  dateSubtext: { fontSize: 13, color: '#888', marginTop: 2 },
  
  widgetWrapper: { marginBottom: 10 }, 
  questWidgetCard: { marginRight: 15, backgroundColor: '#FFF', borderRadius: 20, padding: 16, borderLeftWidth: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  
  widgetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  widgetIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  widgetTextInfo: { flex: 1, justifyContent: 'center' },
  widgetLabel: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  widgetTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A' },
  widgetBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  widgetBadgeText: { fontWeight: 'bold', fontSize: 12, marginLeft: 3 },
  widgetProgressRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  widgetProgressBarBg: { flex: 1, height: 6, backgroundColor: '#EAEAEA', borderRadius: 3, overflow: 'hidden', marginRight: 10 },
  widgetProgressBarFill: { height: '100%', borderRadius: 3 },
  widgetProgressPercent: { fontSize: 12, fontWeight: '700', color: '#555', width: 35, textAlign: 'right' },
  
  questWidgetCardEmpty: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#EAEAEA', borderStyle: 'dashed' },
  emptyWidgetTitle: { fontSize: 15, fontWeight: 'bold', color: '#2C2C2E', marginBottom: 2 },
  emptyWidgetSub: { fontSize: 13, color: '#888', fontWeight: '500' },
  calendarContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 },
  dayColumn: { alignItems: 'center' },
  dayName: { fontSize: 13, color: '#888', marginBottom: 8, fontWeight: '500' },
  dayNameActive: { color: '#2C2C2E', fontWeight: 'bold' },
  dayCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  dayCircleActive: { backgroundColor: '#FFD166', shadowOpacity: 0 },
  dayNumber: { fontSize: 16, fontWeight: '600', color: '#2C2C2E' },
  dayNumberActive: { color: '#2C2C2E', fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 16 },
  tasksContainer: { paddingHorizontal: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#F8F9FA', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, maxHeight: '85%' },
  modalHeader: { justifyContent: 'center', alignItems: 'center', marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#EEE', position: 'relative' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#2C2C2E' },
  modalCloseBtn: { position: 'absolute', right: 0, top: -4 },
  modalTabs: { flexDirection: 'row', backgroundColor: '#EFEFEF', borderRadius: 12, padding: 4, marginBottom: 20 },
  modalTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  modalTabActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  modalTabText: { fontSize: 14, fontWeight: '600', color: '#888' },
  modalTabTextActive: { color: '#2C2C2E' },
  summonCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', aspectRatio: 1100 / 520, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2, borderLeftWidth: 6 },
  cardLeftColumn: { width: '60%', height: '100%', justifyContent: 'flex-start', alignItems: 'flex-start' },
  cardRightColumn: { flex: 1, height: '100%', alignItems: 'flex-end', justifyContent: 'center' },
  cardBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, marginBottom: 8 },
  cardBadgeText: { fontWeight: 'bold', fontSize: 16, marginLeft: 4 },
  cardTitle: { fontSize: 22, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  cardDivider: { width: '100%', height: 1, backgroundColor: '#000', marginBottom: 8 },
  cardDescContainer: { flex: 1, width: '100%' },
  cardDescriptionLine: { fontSize: 10, color: '#333', marginBottom: 2 },
  cardImage: { width: '95%', height: '95%', resizeMode: 'contain' },
  toastContainer: { position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: '#3A3A3C', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 24, zIndex: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 10 },
  toastText: { color: '#FFF', fontSize: 15, fontWeight: 'bold', textAlign: 'center' }
});