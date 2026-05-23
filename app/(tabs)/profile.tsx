import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Animated, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ points: 0, tasks_done: 0 });
  const [history, setHistory] = useState<any[]>([]);
  const [userName, setUserName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  
  const [questStats, setQuestStats] = useState({ total: 0, completed: 0 });
  
  const [toastVisible, setToastVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [clickCount, setClickCount] = useState(0);
  const clickTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const router = useRouter();

  const fetchData = async () => {
    try {
      const name = await AsyncStorage.getItem('user_name');
      const room = await AsyncStorage.getItem('room_id');
      const g = await AsyncStorage.getItem('user_gender');
      if (!name || !room) return;
      
      setUserName(name);
      setRoomCode(room);
      if (g === 'female') setGender('female');

      const cachedData = await AsyncStorage.getItem(`profile_cache_${name}`);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (parsed.profile) setProfile(parsed.profile);
        if (parsed.questStats) setQuestStats(parsed.questStats);
      } else {
        setLoading(true);
      }

      let { data: profData } = await supabase.from('profiles').select('*').eq('name', name).eq('room_id', room).single();
      
      let { data: histData } = await supabase
        .from('task_history')
        .select('*')
        .eq('user_name', name)
        .eq('room_id', room)
        .order('completed_at', { ascending: false });
      
      const { count: totalQuestsCount } = await supabase
        .from('quests')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room)
        .is('user_name', null);

      const { count: completedQuestsCount } = await supabase
        .from('quests')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room)
        .eq('user_name', name)
        .eq('is_claimed', true);

      const newQuestStats = {
        total: totalQuestsCount || 0,
        completed: completedQuestsCount || 0
      };

      if (profData) setProfile(profData);
      setHistory(histData || []);
      setQuestStats(newQuestStats);

      if (profData) {
        await AsyncStorage.setItem(`profile_cache_${name}`, JSON.stringify({
          profile: profData,
          questStats: newQuestStats
        }));
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(roomCode);
    setToastVisible(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setToastVisible(false));
    }, 2000);

    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (clickTimeout.current) clearTimeout(clickTimeout.current);

    if (newCount >= 5) {
      setClickCount(0); 
      router.push('/admin/create-quest' as any); 
      return;
    }

    clickTimeout.current = setTimeout(() => { setClickCount(0); }, 1000);
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowLogoutModal(false);
    await AsyncStorage.clear();
    router.replace('/login');
  };

  const renderHistoryIcon = (item: any) => {
    const isQuestReward = item.image_url === 'quest_reward';
    const isPurchase = item.image_url === 'shop' || item.task_title?.toLowerCase().includes('куплено');
    const isError = item.image_url === 'error';

    if (isQuestReward) {
      return (
        <View style={styles.histIconWrapper}>
          <FontAwesome name="check-circle" size={34} color="#2ECC71" />
        </View>
      );
    }

    if (isPurchase) {
      return (
        <View style={styles.histIconWrapper}>
          <MaterialCommunityIcons name="gift" size={26} color="#E07A5F" />
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.histIconWrapper}>
          <FontAwesome name="exclamation-circle" size={34} color="#FF3B30" />
        </View>
      );
    }

    if (item.image_url) {
      return (
        <View style={styles.histIconWrapper}>
          <Image source={{ uri: item.image_url }} style={styles.histIcon} />
        </View>
      );
    }

    return <View style={styles.histIconWrapper} />;
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBackground}>
        <SafeAreaView>
          <Text style={styles.headerTitle}>{userName}</Text>
          
          <Text style={styles.pointsNumber}>
            {loading && profile.points === 0 ? '...' : profile.points}
          </Text>
          <Text style={styles.pointsLabel}>Всего баллов</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <FontAwesome name="check-circle" size={20} color="#E0C097" />
              <Text style={styles.statValue}>
                {loading && profile.tasks_done === 0 ? '...' : profile.tasks_done}
              </Text>
              <Text style={styles.statLabel}>Сделано дел</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <FontAwesome name="trophy" size={20} color="#E0C097" />
              <Text style={styles.statValue}>
                {loading && questStats.total === 0 ? '...' : `${questStats.completed}/${questStats.total}`}
              </Text>
              <Text style={styles.statLabel}>Квестов</Text>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#81B29A' }]}>
          <FontAwesome name="star" size={22} color="#FFF" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.mainActionButton, { backgroundColor: '#FFF' }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/shop' as any);
          }}
          activeOpacity={0.8}
        >
          <FontAwesome name="shopping-cart" size={32} color="#8C6239" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: '#E07A5F' }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/wishlist' as any);
          }}
          activeOpacity={0.8}
        >
          <FontAwesome name="heart" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.bottomScroll} contentContainerStyle={styles.bottomContent} showsVerticalScrollIndicator={false}>
        <View style={styles.menuGroup}>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={handleCopyCode}>
            <View style={[styles.iconWrapper, { backgroundColor: '#F4F1DE' }]}><FontAwesome name="home" size={20} color="#8C6239" /></View>
            <View style={styles.menuTextContainer}><Text style={styles.menuTitle}>Код дома</Text><Text style={styles.menuSub}>{roomCode}</Text></View>
            <FontAwesome name="copy" size={18} color="#CCC" />
          </TouchableOpacity>
          
          <View style={styles.menuDivider} />
          
          <TouchableOpacity style={styles.menuItem} onPress={() => setHistoryVisible(true)}>
            <View style={[styles.iconWrapper, { backgroundColor: '#E3EADA' }]}><FontAwesome name="history" size={20} color="#81B29A" /></View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitle}>История дел</Text>
              <Text style={styles.menuSub}>
                {gender === 'female' ? 'Что ты выполнила' : 'Что ты выполнил'}
              </Text>
            </View>
            <FontAwesome name="chevron-right" size={14} color="#CCC" />
          </TouchableOpacity>
        </View>

        <View style={styles.menuGroup}>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings' as any)}>
            <View style={[styles.iconWrapper, { backgroundColor: '#E8F0FE' }]}><FontAwesome name="cog" size={20} color="#4285F4" /></View>
            <View style={styles.menuTextContainer}><Text style={styles.menuTitle}>Настройки</Text><Text style={styles.menuSub}>Профиль и уведомления</Text></View>
            <FontAwesome name="chevron-right" size={14} color="#CCC" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/help' as any)}>
            <View style={[styles.iconWrapper, { backgroundColor: '#F3E5F5' }]}><FontAwesome name="life-ring" size={20} color="#9C27B0" /></View>
            <View style={styles.menuTextContainer}><Text style={styles.menuTitle}>Помощь</Text><Text style={styles.menuSub}>Справочник</Text></View>
            <FontAwesome name="chevron-right" size={14} color="#CCC" />
          </TouchableOpacity>
        </View>

        <View style={styles.menuGroup}>
          <TouchableOpacity style={styles.menuItem} onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowLogoutModal(true);
          }}>
            <View style={[styles.iconWrapper, { backgroundColor: '#FFEBEB' }]}>
              <FontAwesome name="sign-out" size={20} color="#FF3B30" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={[styles.menuTitle, { color: '#FF3B30' }]}>Выйти из аккаунта</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>DanSko</Text>
        <Text style={styles.versionSubText}>HomeApp v2.0.0</Text>
      </ScrollView>

      {/* Модалка выхода */}
      <Modal visible={showLogoutModal} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowLogoutModal(false)} />
          <View style={styles.logoutCard}>
            <View style={styles.logoutIconCircle}>
              <MaterialCommunityIcons name="door-open" size={48} color="#FF3B30" />
            </View>
            <Text style={styles.logoutTitle}>Выйти?</Text>
            <Text style={styles.logoutDesc}>Данные сохранятся, но придётся войти заново</Text>
            <View style={styles.logoutActionRow}>
              <TouchableOpacity style={styles.logoutCancelBtn} onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowLogoutModal(false);
              }}>
                <Text style={styles.logoutCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutConfirmBtn} onPress={handleLogout}>
                <Text style={styles.logoutConfirmText}>Выйти</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={historyVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.historyContainer}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>История дел</Text>
            <TouchableOpacity onPress={() => setHistoryVisible(false)}>
              <FontAwesome name="times-circle" size={28} color="#888" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            {history.length === 0 ? (
              <Text style={styles.emptyText}>Истории пока нет...</Text>
            ) : (
              history.map((item) => {
                const isPurchase = item.image_url === 'shop' || item.task_title?.toLowerCase().includes('куплено');
                const isQuestReward = item.image_url === 'quest_reward';

                return (
                  <View key={item.id} style={styles.historyItem}>
                    {renderHistoryIcon(item)}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      {item.penalty > 0 && !isPurchase && !isQuestReward ? (
                        <Text style={[styles.histTaskTitle, { color: '#FF3B30' }]} numberOfLines={2}>
                          {'ШТРАФ: ' + item.task_title.replace('Просрочено: ', '')}
                        </Text>
                      ) : (
                        <Text style={styles.histTaskTitle} numberOfLines={2}>
                          {item.task_title}
                        </Text>
                      )}
                      <Text style={styles.histDate}>
                        {new Date(item.completed_at).toLocaleDateString()} в {new Date(item.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                      {isPurchase ? (
                        <Text style={styles.histPenalty}>-{item.penalty}</Text>
                      ) : (
                        <>
                          {item.points > 0 && <Text style={styles.histPoints}>+{item.points}</Text>}
                          {item.penalty > 0 && <Text style={styles.histPenalty}>-{item.penalty}</Text>}
                        </>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>

      {toastVisible && (
        <Animated.View style={[styles.toastContainer, { opacity: fadeAnim }]}>
          <FontAwesome name="check-circle" size={16} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.toastText}>Код скопирован</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  headerBackground: { backgroundColor: '#8C6239', borderBottomLeftRadius: 40, borderBottomRightRadius: 40, paddingBottom: 60 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginTop: 10 },
  pointsNumber: { fontSize: 80, fontWeight: '900', color: '#FFF', textAlign: 'center', marginTop: 10 },
  pointsLabel: { fontSize: 16, color: '#E0C097', textAlign: 'center', fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30, paddingHorizontal: 20 },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginTop: 5 },
  statLabel: { fontSize: 12, color: '#E0C097', marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, height: 40, backgroundColor: '#A67B5B' },
  actionButtonsContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: -35, zIndex: 10 },
  actionButton: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 5, marginHorizontal: 15 },
  mainActionButton: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 5 },
  bottomScroll: { flex: 1 },
  bottomContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
  menuGroup: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 15 },
  menuDivider: { height: 1, backgroundColor: '#F0F0F0', marginLeft: 65 },
  iconWrapper: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuTextContainer: { flex: 1, marginLeft: 15 },
  menuTitle: { fontSize: 16, fontWeight: '600' },
  menuSub: { fontSize: 13, color: '#888' },
  toastContainer: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#333', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24, flexDirection: 'row', alignItems: 'center', zIndex: 100, elevation: 10 },
  toastText: { color: '#FFF', fontWeight: '600' },
  historyContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEE', backgroundColor: '#FFF' },
  historyTitle: { fontSize: 20, fontWeight: 'bold' },
  historyItem: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
  histIconWrapper: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  histIcon: { width: '100%', height: '100%', resizeMode: 'contain' },
  histTaskTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A' },
  histDate: { fontSize: 12, color: '#888', marginTop: 4 },
  histPoints: { fontSize: 18, fontWeight: 'bold', color: '#2ECC71' },
  histPenalty: { fontSize: 18, fontWeight: 'bold', color: '#FF3B30' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#999' },
  versionText: { textAlign: 'center', color: '#CCC', fontSize: 13, fontWeight: '700', marginTop: 10 },
  versionSubText: { textAlign: 'center', color: '#CCC', fontSize: 12, marginTop: 2, marginBottom: 20 },

  // Модалка выхода
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  logoutCard: { backgroundColor: '#FFF', width: '100%', borderRadius: 32, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  logoutIconCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#FFF0EF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoutTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A', marginBottom: 8 },
  logoutDesc: { fontSize: 15, color: '#888', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  logoutActionRow: { flexDirection: 'row', width: '100%', gap: 10 },
  logoutCancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#F0F0F0', alignItems: 'center' },
  logoutCancelText: { fontSize: 16, fontWeight: 'bold', color: '#888' },
  logoutConfirmBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#FF3B30', alignItems: 'center' },
  logoutConfirmText: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
});
