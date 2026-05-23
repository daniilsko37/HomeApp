import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { JournalCard } from '../../components/JournalCard';
import { supabase } from '../../lib/supabase';

type TabType = 'my' | 'waiting' | 'confirm';

export default function StatusScreen() {
  const router = useRouter(); 

  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [waitingTasks, setWaitingTasks] = useState<any[]>([]);
  const [confirmTasks, setConfirmTasks] = useState<any[]>([]);
  
  const [profiles, setProfiles] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('my');
  const [userName, setUserName] = useState('');

  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [evalModalVisible, setEvalModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [proofBase64, setProofBase64] = useState<string | null>(null); 
  const [submitting, setSubmitting] = useState(false); 
  
  const [evaluating, setEvaluating] = useState<'approve' | 'reject' | null>(null);

  const myCount = myTasks.length;
  const waitingCount = waitingTasks.length;
  const confirmCount = confirmTasks.length;

  const currentTasks = activeTab === 'my' ? myTasks : activeTab === 'waiting' ? waitingTasks : confirmTasks;

  const fetchData = async (isSilent = false, isFocusing = false) => {
    try {
      if (!isSilent) setLoading(true);
      
      const name = await AsyncStorage.getItem('user_name');
      const room = await AsyncStorage.getItem('room_id');
      if (!name || !room) return;
      setUserName(name);

      const { data: profilesData } = await supabase.from('profiles').select('*').eq('room_id', room);
      if (profilesData) {
        setProfiles(profilesData);
      }

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('room_id', room)
        .in('status', ['in_progress', 'pending_approval']);

      if (error) throw error;

      const todayZero = new Date();
      todayZero.setHours(0, 0, 0, 0);

      const allActive = (data || []).map(task => {
        let isOverdue = false;
        if ((task.type === 'green' || task.type === 'blue') && task.start_date) {
           const cDate = new Date(task.start_date);
           cDate.setHours(0, 0, 0, 0);
           const diff = Math.floor((todayZero.getTime() - cDate.getTime()) / (1000 * 60 * 60 * 24));
           if (diff >= 3) isOverdue = true;
        }
        return { ...task, isOverdue };
      });

      const myT = allActive.filter(t => t.status === 'in_progress' && t.assignee === name);
      const waitT = allActive.filter(t => t.status === 'pending_approval' && t.assignee === name);
      const confT = allActive.filter(t => t.status === 'pending_approval' && t.assignee !== name);

      setMyTasks(myT);
      setWaitingTasks(waitT);
      setConfirmTasks(confT);

      setActiveTab(prevTab => {
        if (isFocusing) {
          return confT.length > 0 ? 'confirm' : 'my';
        } else {
          if (prevTab === 'confirm' && confT.length === 0) return 'my';
          return prevTab;
        }
      });

    } catch (e) {
      console.error('Ошибка загрузки данных:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { 
    fetchData(false, true); 
  }, []));

  const openReportModal = (task: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
    setSelectedTask(task);
    setProofImage(null);
    setProofBase64(null); 
    setReportModalVisible(true);
  };

  const openEvalModal = (task: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
    setSelectedTask(task);
    setEvalModalVisible(true);
  };

  const takePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Упс', 'Нужен доступ к камере!');
    const result = await ImagePicker.launchCameraAsync({ 
      allowsEditing: true, 
      aspect: [1, 1], 
      quality: 0.3, 
      base64: true  
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setProofImage(result.assets[0].uri);
      setProofBase64(result.assets[0].base64 || null);
    }
  };

  const pickPhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
    const result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ['images'], 
      allowsEditing: true, 
      aspect: [1, 1], 
      quality: 0.3, 
      base64: true  
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setProofImage(result.assets[0].uri);
      setProofBase64(result.assets[0].base64 || null);
    }
  };

  const incrementQuestProgress = async (roomId: string, taskTitle: string, assigneeName: string) => {
    try {
      const { data: activeQuests } = await supabase
        .from('quests')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_name', assigneeName)
        .eq('is_claimed', false);

      if (!activeQuests || activeQuests.length === 0) return;

      const LEVEL_MAP: any = { 'I': 1, 'II': 2, 'III': 3 };
      const chains: Record<string, any[]> = {};
      const standalone: any[] = [];

      activeQuests.forEach(quest => {
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

      const trulyActiveQuestIds: string[] = [];

      Object.keys(chains).forEach(baseName => {
          const chainQuests = chains[baseName].sort((a, b) => a.levelNum - b.levelNum);
          if (chainQuests.length > 0) {
            trulyActiveQuestIds.push(chainQuests[0].id);
          }
      });

      standalone.forEach(quest => {
          trulyActiveQuestIds.push(quest.id);
      });

      if (trulyActiveQuestIds.length === 0) return;

      const { data: qTasks } = await supabase
        .from('quest_tasks')
        .select('*')
        .in('quest_id', trulyActiveQuestIds)
        .eq('task_title', taskTitle);

      if (!qTasks || qTasks.length === 0) return;

      for (const qt of qTasks) {
        const { data: freshQt } = await supabase.from('quest_tasks').select('current_count, target_count').eq('id', qt.id).single();
        
        if (freshQt && freshQt.current_count < freshQt.target_count) {
          await supabase
            .from('quest_tasks')
            .update({ current_count: freshQt.current_count + 1 })
            .eq('id', qt.id);
        }
      }
    } catch (err) {
      console.error('Ошибка добавления прогресса квесту:', err);
    }
  };

  const submitTask = async () => {
    if (!selectedTask || submitting) return;
    try {
      setSubmitting(true);
      const now = new Date();
      const nowIsoString = now.toISOString();
      const todayStr = nowIsoString.split('T')[0];

      let finalProofUrl = null;
      if (proofBase64) {
        const fileName = 'proof_' + Date.now() + '_' + Math.random().toString(36).substring(7) + '.jpg';
        const { error: uploadError } = await supabase.storage.from('task-images').upload(fileName, decode(proofBase64), { contentType: 'image/jpeg' });
        if (uploadError) throw new Error('Не удалось загрузить фото-отчет');
        const { data: publicUrlData } = supabase.storage.from('task-images').getPublicUrl(fileName);
        finalProofUrl = publicUrlData.publicUrl;
      }

      const isSingleUser = profiles.length === 1;

      if (isSingleUser) {
        const taskPoints = parseInt(selectedTask.points) || 0;
        const currentUser = profiles[0];

        let newStreak = currentUser.streak_count || 0;
        const lastDate = currentUser.last_task_date;

        if (lastDate !== todayStr) {
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          if (lastDate === yesterdayStr) newStreak += 1; else newStreak = 1; 
        }

        await supabase.from('profiles').update({ 
          points: (currentUser.points || 0) + taskPoints, 
          tasks_done: (currentUser.tasks_done || 0) + 1,
          streak_count: newStreak,
          last_task_date: todayStr
        }).eq('id', currentUser.id);

        await supabase.from('task_history').insert([{
          user_name: userName, 
          task_title: selectedTask.title, 
          points: taskPoints, 
          penalty: 0,
          room_id: selectedTask.room_id, 
          image_url: selectedTask.image_url, 
          proof_image_url: finalProofUrl, 
          created_at: nowIsoString
        }]);

        await incrementQuestProgress(selectedTask.room_id, selectedTask.title, userName);

        if (selectedTask.frequency_days === -1) {
          await supabase.from('tasks').delete().eq('id', selectedTask.id);
        } else {
          // ИДЕАЛЬНОЕ ЗАВЕРШЕНИЕ: СТАТУС DONE И ДАТА СЕГОДНЯ
          await supabase.from('tasks').update({ 
            status: 'done', 
            start_date: todayStr, 
            assignee: null, 
            proof_image_url: null, 
            submitted_at: null, 
            last_penalty_date: null
          }).eq('id', selectedTask.id);
        }
      } else {
        const updates: any = { status: 'pending_approval', submitted_at: nowIsoString, proof_image_url: finalProofUrl };
        await supabase.from('tasks').update(updates).eq('id', selectedTask.id);
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); 
      setReportModalVisible(false);
      fetchData(true); 
      
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); 
      Alert.alert('Ошибка', e.message || 'Что-то пошло не так');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelToHome = async (task: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
    setMyTasks(prev => prev.filter(t => t.id !== task.id));
    
    try {
      if (task.frequency_days === -1) {
        await supabase.from('tasks').delete().eq('id', task.id);
      } else {
        const isHideable = task.type === 'yellow' || task.type === 'violet' || task.type === 'orange';
        const newStatus = isHideable ? 'idle' : 'todo';
        await supabase.from('tasks').update({ status: newStatus, assignee: null, proof_image_url: null }).eq('id', task.id);
      }
      fetchData(true);
    } catch (e) {
      console.error('Ошибка отмены задачи:', e);
      fetchData(true); 
    }
  };

  const approveTask = async () => {
    if (!selectedTask || evaluating) return;
    setEvaluating('approve');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const task = selectedTask;
    const freezeDateStr = task.submitted_at ? new Date(task.submitted_at).toISOString().split('T')[0]  : new Date().toISOString().split('T')[0];
    const assigneeName = task.assignee;
    const taskPoints = parseInt(task.points) || 0;
    const roomId = task.room_id;

    setEvalModalVisible(false);
    setConfirmTasks(prev => prev.filter(t => t.id !== task.id));

    (async () => {
      try {
        const pHistory = supabase.from('task_history').insert([{
          user_name: assigneeName, task_title: task.title, points: taskPoints, penalty: 0,
          room_id: roomId, image_url: task.image_url, proof_image_url: task.proof_image_url, 
          created_at: task.submitted_at || new Date().toISOString()
        }]);

        const pProfile = (async () => {
          if (assigneeName && roomId) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('name', assigneeName).eq('room_id', roomId).maybeSingle();
            if (profile) {
              await supabase.from('profiles').update({ points: (profile.points || 0) + taskPoints, tasks_done: (profile.tasks_done || 0) + 1 }).eq('id', profile.id);
            }
          }
        })();

        const pQuest = assigneeName ? incrementQuestProgress(roomId, task.title, assigneeName) : Promise.resolve();

        // ИДЕАЛЬНОЕ ОДОБРЕНИЕ: СТАТУС DONE И ДАТА СДАЧИ
        let pTask;
        if (task.frequency_days === -1) {
          pTask = supabase.from('tasks').delete().eq('id', task.id);
        } else {
          pTask = supabase.from('tasks').update({ 
              status: 'done', 
              start_date: freezeDateStr, 
              assignee: null, 
              proof_image_url: null, 
              submitted_at: null, 
              last_penalty_date: null
          }).eq('id', task.id);
        }

        await Promise.all([pHistory, pProfile, pQuest, pTask]);
      } catch (e) {
        console.error('Ошибка при сохранении истории:', e);
      } finally {
        setEvaluating(null);
        fetchData(true);
      }
    })();
  };

  const rejectTask = async () => {
    if (!selectedTask || evaluating) return;
    setEvaluating('reject');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const task = selectedTask;
    
    setEvalModalVisible(false);
    setConfirmTasks(prev => prev.filter(t => t.id !== task.id));

    (async () => {
      try {
        await supabase.from('tasks').update({ status: 'in_progress', proof_image_url: null, submitted_at: null }).eq('id', task.id);
      } catch (e) {
        console.error(e);
      } finally {
        setEvaluating(null);
        fetchData(true);
      }
    })();
  };

  const renderLeaderboard = () => {
    if (profiles.length === 0) return null;

    const currentUser = profiles.find(p => p.name === userName);

    if (profiles.length === 1) {
      return null;
    }

    let leaderboardContent = null;

    if (profiles.length === 2 && currentUser) {
      const partner = profiles.find(p => p.name !== userName);
      const myPoints = currentUser.points || 0;
      const partnerPoints = partner?.points || 0;
      const total = myPoints + partnerPoints || 1; 
      const myPercentage = (myPoints / total) * 100;

      leaderboardContent = (
        <View style={styles.leaderboardCard}>
          <View style={styles.scoreHeaderRow}>
            <View style={{alignItems: 'flex-start'}}>
              <Text style={styles.scoreName}>{currentUser.name}</Text>
              <Text style={styles.scorePoints}>{myPoints}</Text>
            </View>
            <FontAwesome name="trophy" size={24} color="#FFD166" />
            <View style={{alignItems: 'flex-end'}}>
              <Text style={styles.scoreName}>{partner?.name}</Text>
              <Text style={styles.scorePoints}>{partnerPoints}</Text>
            </View>
          </View>

          <View style={styles.tugOfWarTrack}>
            <View style={[styles.tugOfWarFill, { width: `${myPercentage}%` }]} />
          </View>
        </View>
      );
    } else if (profiles.length > 2) {
      const sortedProfiles = [...profiles].sort((a, b) => (b.points || 0) - (a.points || 0));

      leaderboardContent = (
        <View style={styles.leaderboardCard}>
          <Text style={styles.leaderboardTitle}>Глобальный рейтинг</Text>
          {sortedProfiles.map((profile, index) => {
            const isMe = profile.name === userName;
            const rankColor = index === 0 ? '#FFD166' : '#888';

            return (
              <View key={profile.id} style={[styles.multiplayerRow, isMe && styles.multiplayerRowMe]}>
                <View style={styles.multiplayerLeft}>
                  <Text style={[styles.multiplayerRank, { color: rankColor }]}>{index + 1}</Text>
                  <Text style={[styles.multiplayerName, isMe && styles.multiplayerNameMe]}>
                    {profile.name}
                  </Text>
                </View>
                <Text style={[styles.multiplayerPoints, isMe && styles.multiplayerPointsMe]}>
                  {profile.points || 0}
                </Text>
              </View>
            );
          })}
        </View>
      );
    }

    if (leaderboardContent) {
      return (
        <TouchableOpacity 
          activeOpacity={0.8} 
          onPress={() => {
            Haptics.selectionAsync();
            router.push('/statistics' as any);
          }}
        >
          {leaderboardContent}
        </TouchableOpacity>
      );
    }

    return null;
  };

  const isSingleUser = profiles.length === 1;

  const getEmptyStateText = () => {
    if (activeTab === 'my') return 'Здесь будут отображаться задачи, взятые тобой в работу.';
    if (activeTab === 'waiting') return 'Здесь появятся выполненные задачи, ожидающие подтверждения.';
    if (activeTab === 'confirm') return 'Здесь появятся задачи, которые тебе предстоит проверить и оценить.';
    return 'Список пуст.';
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <View style={styles.container}>
        
        <View style={styles.topSection}>
          {renderLeaderboard()}

          {!isSingleUser && (
            <View style={styles.segmentedControl}>
              <TouchableOpacity 
                style={[styles.segmentBtn, activeTab === 'my' && styles.segmentBtnActive]} 
                onPress={() => { Haptics.selectionAsync(); setActiveTab('my'); }}
              >
                <Text style={[styles.segmentText, activeTab === 'my' && styles.segmentTextActive]}>
                  В работе {myCount > 0 ? `(${myCount})` : ''}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.segmentBtn, activeTab === 'waiting' && styles.segmentBtnActive]} 
                onPress={() => { Haptics.selectionAsync(); setActiveTab('waiting'); }}
              >
                <Text style={[styles.segmentText, activeTab === 'waiting' && styles.segmentTextActive]}>
                  Ждут {waitingCount > 0 ? `(${waitingCount})` : ''}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.segmentBtn, activeTab === 'confirm' && styles.segmentBtnActive]} 
                onPress={() => { Haptics.selectionAsync(); setActiveTab('confirm'); }}
              >
                <Text style={[styles.segmentText, activeTab === 'confirm' && styles.segmentTextActive, confirmCount > 0 && activeTab !== 'confirm' && {color: '#FF3B30'}]}>
                  Оценить {confirmCount > 0 ? `(${confirmCount})` : ''}
                </Text>
                {confirmCount > 0 && activeTab !== 'confirm' && <View style={styles.redDotSmall} />}
              </TouchableOpacity>
            </View>
          )}

          {isSingleUser && (
            <Text style={styles.soloSectionTitle}>Мои текущие задачи</Text>
          )}
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {loading ? (
            <ActivityIndicator color="#1A1A1A" style={{ marginTop: 40 }} />
          ) : currentTasks.length === 0 ? (
            <Text style={styles.emptyText}>{getEmptyStateText()}</Text>
          ) : (
            currentTasks.map((task) => (
              <JournalCard 
                key={task.id}
                title={task.title}
                userName={task.assignee}
                type={activeTab}
                imageSource={task.image_url ? { uri: task.image_url } : undefined}
                isOverdue={task.isOverdue} 
                onPress={() => {
                  if (activeTab === 'my') openReportModal(task);
                  if (activeTab === 'confirm') openEvalModal(task);
                }}
                onCancel={() => cancelToHome(task)}
              />
            ))
          )}
        </ScrollView>
      </View>

      <Modal visible={reportModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Завершить задачу</Text>
            <View style={styles.photoContainer}>
              {proofImage ? <Image source={{ uri: proofImage }} style={styles.previewImage} /> : <FontAwesome name="camera-retro" size={40} color="#CCC" />}
            </View>
            
            <View style={styles.photoButtonsRow}>
              <TouchableOpacity style={styles.photoButtonPrimary} onPress={takePhoto} disabled={submitting}>
                <FontAwesome name="camera" size={18} color="#FFF" style={{marginRight: 8}} />
                <Text style={styles.photoButtonTextPrimary}>Камера</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoButtonSecondary} onPress={pickPhoto} disabled={submitting}>
                <FontAwesome name="image" size={18} color="#2C2C2E" style={{marginRight: 8}} />
                <Text style={styles.photoButtonTextSecondary}>Галерея</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.submitButton, submitting && {opacity: 0.7}]} onPress={submitTask} disabled={submitting}>
              <Text style={styles.submitButtonText}>{submitting ? 'Отправка...' : 'Завершить'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelModalButton} onPress={() => setReportModalVisible(false)} disabled={submitting}>
              <Text style={styles.cancelModalText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={evalModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Проверка работы</Text>
            <Text style={styles.modalSub}>{selectedTask?.title}</Text>
            <View style={styles.photoContainer}>
              {selectedTask?.proof_image_url ? <Image source={{ uri: selectedTask.proof_image_url }} style={styles.previewImage} /> : <Text style={{color: '#AAA'}}>Без фотоотчета</Text>}
            </View>
            <View style={styles.evalButtonsRow}>
              <TouchableOpacity style={[styles.evalButton, {backgroundColor: '#FF3B30'}, !!evaluating && {opacity: 0.7}]} onPress={rejectTask} disabled={!!evaluating}>
                {evaluating === 'reject' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitButtonText}>Отклонить</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.evalButton, {backgroundColor: '#2ECC71'}, !!evaluating && {opacity: 0.7}]} onPress={approveTask} disabled={!!evaluating}>
                {evaluating === 'approve' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitButtonText}>Принять</Text>}
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setEvalModalVisible(false)} style={styles.cancelModalButton} disabled={!!evaluating}>
              <Text style={styles.cancelModalText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topSection: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15, backgroundColor: '#F8F9FA' },
  
  leaderboardCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  leaderboardTitle: { fontSize: 14, fontWeight: 'bold', color: '#888', textAlign: 'center', marginBottom: 15, textTransform: 'uppercase' },
  scoreHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  scoreName: { fontSize: 14, color: '#888', fontWeight: '500', marginBottom: 2 },
  scorePoints: { fontSize: 24, fontWeight: '900', color: '#1A1A1A' },
  tugOfWarTrack: { height: 12, backgroundColor: '#F0F0F0', borderRadius: 6, overflow: 'hidden', width: '100%' },
  tugOfWarFill: { height: '100%', backgroundColor: '#1A1A1A', borderRadius: 6 },

  multiplayerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  multiplayerRowMe: { backgroundColor: '#F5F5F5' },
  multiplayerLeft: { flexDirection: 'row', alignItems: 'center' },
  multiplayerRank: { fontSize: 16, fontWeight: '900', marginRight: 12, width: 25 },
  multiplayerName: { fontSize: 15, color: '#1A1A1A', fontWeight: '500' },
  multiplayerNameMe: { fontWeight: 'bold' },
  multiplayerPoints: { fontSize: 16, fontWeight: '600', color: '#888' },
  multiplayerPointsMe: { color: '#1A1A1A', fontWeight: 'bold' },

  soloSectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#1A1A1A', marginTop: 10, marginBottom: 5 },

  segmentedControl: { flexDirection: 'row', backgroundColor: '#EFEFEF', borderRadius: 12, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8, position: 'relative' },
  segmentBtnActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#888' },
  segmentTextActive: { color: '#1A1A1A' },
  redDotSmall: { position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF3B30' },

  emptyText: { textAlign: 'center', marginTop: 40, color: '#888', fontSize: 15, paddingHorizontal: 20, lineHeight: 22 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 25, alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 5 },
  modalSub: { fontSize: 16, color: '#888', marginBottom: 20 },
  photoContainer: { width: '100%', aspectRatio: 1, backgroundColor: '#F5F5F5', borderRadius: 16, overflow: 'hidden', marginBottom: 20, justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  
  photoButtonsRow: { flexDirection: 'row', width: '100%', marginBottom: 25, justifyContent: 'space-between' },
  photoButtonPrimary: { flex: 1, flexDirection: 'row', backgroundColor: '#4A4A4C', padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 5 },
  photoButtonSecondary: { flex: 1, flexDirection: 'row', backgroundColor: '#E5E5EA', padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 5 },
  photoButtonTextPrimary: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  photoButtonTextSecondary: { color: '#2C2C2E', fontWeight: 'bold', fontSize: 15 },
  
  submitButton: { width: '100%', backgroundColor: '#2ECC71', padding: 18, borderRadius: 14, alignItems: 'center' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  evalButtonsRow: { flexDirection: 'row', width: '100%' },
  evalButton: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center', marginHorizontal: 5 },
  cancelModalButton: { marginTop: 15, paddingVertical: 10, paddingHorizontal: 20 },
  cancelModalText: { color: '#888', fontSize: 16, fontWeight: '500' }
});