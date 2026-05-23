import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type NotifKey = 'new' | 'overdue' | 'check' | 'reward';

interface NotifConfig {
  key: NotifKey;
  icon: string;
  color: string;
  bg: string;
  title: string;
  sub: string;
  hasTime: boolean;
  multiUserOnly?: boolean;
}

const NOTIF_CONFIGS: NotifConfig[] = [
  { key: 'new', icon: 'format-list-checks', color: '#4A90E2', bg: '#EBF4FF', title: 'Новые задачи', sub: 'план на день', hasTime: true },
  { key: 'overdue', icon: 'alert-circle-outline', color: '#FF3B30', bg: '#FFF0EF', title: 'Просрочка', sub: 'риск штрафов', hasTime: true },
  { key: 'check', icon: 'account-search-outline', color: '#9C27B0', bg: '#F5EEF8', title: 'Проверки', sub: 'ждут одобрения', hasTime: true, multiUserOnly: true },
  { key: 'reward', icon: 'gift-outline', color: '#2ECC71', bg: '#EAFAF1', title: 'Призы', sub: 'моментально', hasTime: false, multiUserOnly: true },
];

const DEFAULT_TIMES: Record<string, string> = {
  new: '07:00',
  overdue: '17:00',
  check: '20:00',
};

function AccordionSection({ title, sub, icon, iconBg, iconColor, rightLabel, children, defaultOpen = false }: {
  title: string; sub?: string; icon: string; iconBg: string; iconColor: string;
  rightLabel?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rotation = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const toValue = open ? 0 : 1;
    Animated.spring(rotation, { toValue, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
    setOpen((v) => !v);
  };

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <>
      <TouchableOpacity style={styles.accordionHeader} onPress={toggle} activeOpacity={0.7}>
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
        </View>
        <View style={styles.accordionText}>
          <Text style={styles.rowTitle}>{title}</Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
        <View style={styles.accordionRight}>
          {rightLabel ? <Text style={styles.rightLabel}>{rightLabel}</Text> : null}
          <Animated.View style={{ transform: [{ rotate }] }}>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#CCC" />
          </Animated.View>
        </View>
      </TouchableOpacity>
      {open && <View style={styles.accordionBody}>{children}</View>}
    </>
  );
}

function NotifRow({ config, enabled, time, onToggle, onTimePress }: {
  config: NotifConfig; enabled: boolean; time?: string;
  onToggle: (val: boolean) => void; onTimePress?: () => void;
}) {
  const badgeOpacity = useRef(new Animated.Value(enabled ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(badgeOpacity, { toValue: enabled ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [enabled]);

  return (
    <View style={styles.notifRow}>
      <View style={[styles.iconWrap, { backgroundColor: config.bg }]}>
        <MaterialCommunityIcons name={config.icon as any} size={20} color={config.color} />
      </View>
      <View style={styles.notifText}>
        <Text style={styles.rowTitle}>{config.title}</Text>
        <Text style={styles.rowSub}>{config.sub}</Text>
      </View>
      <View style={styles.notifRight}>
        {config.hasTime && time && (
          <Animated.View style={{ opacity: badgeOpacity }}>
            <TouchableOpacity style={styles.timeBadge} onPress={onTimePress} disabled={!enabled} activeOpacity={0.7}>
              <Text style={styles.timeBadgeText}>{time}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
        <Switch
          trackColor={{ false: '#E5E5EA', true: '#34C759' }}
          thumbColor="#FFF"
          ios_backgroundColor="#E5E5EA"
          onValueChange={onToggle}
          value={enabled}
          style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
        />
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const rateInputRef = useRef<TextInput>(null);

  const [roomId, setRoomId] = useState('');
  const [isSingleUser, setIsSingleUser] = useState(true);
  const [rate, setRate] = useState('1');
  const [loading, setLoading] = useState(false);
  const [selectedBot, setSelectedBot] = useState('');
  const [botConnected, setBotConnected] = useState(false);

  const [enabled, setEnabled] = useState<Record<NotifKey, boolean>>({
    new: true, overdue: true, check: true, reward: true,
  });
  const [times, setTimes] = useState<Record<string, string>>({
    new: DEFAULT_TIMES.new, overdue: DEFAULT_TIMES.overdue, check: DEFAULT_TIMES.check,
  });

  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [activeTimeKey, setActiveTimeKey] = useState<string>('');
  const [tempTime, setTempTime] = useState('');

  useEffect(() => {
    const load = async () => {
      const room = await AsyncStorage.getItem('room_id');
      if (!room) return;
      setRoomId(room);

      const { data: profiles } = await supabase.from('profiles').select('id').eq('room_id', room);
      if (profiles && profiles.length > 1) setIsSingleUser(false);

      const { data: roomData } = await supabase.from('room_settings').select('star_rate').eq('room_id', room).single();
      if (roomData?.star_rate) {
        setRate(roomData.star_rate.toString());
        await AsyncStorage.setItem('star_rate', roomData.star_rate.toString());
      } else {
        const saved = await AsyncStorage.getItem('star_rate');
        if (saved) setRate(saved);
      }

      const keys: NotifKey[] = ['new', 'overdue', 'check', 'reward'];
      const newEnabled: Record<NotifKey, boolean> = { new: true, overdue: true, check: true, reward: true };
      const newTimes = { new: DEFAULT_TIMES.new, overdue: DEFAULT_TIMES.overdue, check: DEFAULT_TIMES.check };

      // Загружаем актуальные данные из базы
      const userId = await AsyncStorage.getItem('user_id');
      let dbProfile: any = null;
      if (userId) {
        const { data } = await supabase
          .from('profiles')
          .select('notif_new_enabled, notif_new_time, notif_overdue_enabled, notif_overdue_time, notif_check_enabled, notif_check_time, notif_reward_enabled, telegram_chat_id, selected_bot')
          .eq('id', userId)
          .single();
        dbProfile = data;
        if (data?.telegram_chat_id) setBotConnected(true);
      }

      for (const k of keys) {
        const state = await AsyncStorage.getItem(`notif_state_${k}`);
        if (state !== null) {
          newEnabled[k] = state === 'true';
        } else if (dbProfile) {
          newEnabled[k] = dbProfile[`notif_${k}_enabled`] ?? true;
        }

        if (k !== 'reward') {
          const t = await AsyncStorage.getItem(`notif_time_${k}`);
          if (t) {
            newTimes[k] = t;
          } else if (dbProfile?.[`notif_${k}_time`]) {
            const dbTime = dbProfile[`notif_${k}_time`].slice(0, 5);
            newTimes[k] = dbTime;
            await AsyncStorage.setItem(`notif_time_${k}`, dbTime);
          }
        }
      }
      setEnabled(newEnabled);
      setTimes(newTimes);

      const bot = await AsyncStorage.getItem('settings_bot');
      if (bot) {
        setSelectedBot(bot);
      } else if (dbProfile?.selected_bot) {
        const botNames: Record<string, string> = { sir_blesk: 'Сэр Блеск', tyler: 'Тайлер' };
        const botName = botNames[dbProfile.selected_bot] ?? dbProfile.selected_bot;
        setSelectedBot(botName);
        await AsyncStorage.setItem('settings_bot', botName);
      }
    };

    load();
  }, []);

  const handleToggle = async (key: NotifKey, val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEnabled((prev) => ({ ...prev, [key]: val }));
    await AsyncStorage.setItem(`notif_state_${key}`, val.toString());
    const userId = await AsyncStorage.getItem('user_id');
    if (userId) {
      await supabase.from('profiles').update({ [`notif_${key}_enabled`]: val }).eq('id', userId);
    }
  };

  const openTimePicker = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTimeKey(key);
    setTempTime(times[key] ?? DEFAULT_TIMES[key] ?? '');
    setTimeModalVisible(true);
  };

  const handleTimeInput = (text: string) => {
    let cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length >= 3) cleaned = cleaned.slice(0, 2) + ':' + cleaned.slice(2, 4);
    setTempTime(cleaned);
  };

  const saveTime = async () => {
    const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!regex.test(tempTime)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimes((prev) => ({ ...prev, [activeTimeKey]: tempTime }));
    await AsyncStorage.setItem(`notif_time_${activeTimeKey}`, tempTime);
    const userId = await AsyncStorage.getItem('user_id');
    if (userId) {
      await supabase.from('profiles').update({ [`notif_${activeTimeKey}_time`]: tempTime }).eq('id', userId);
    }
    setTimeModalVisible(false);
  };

  const saveSettings = async () => {
    if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    if (roomId) {
      await supabase.from('room_settings').upsert({ room_id: roomId, star_rate: Number(rate) });
    }
    await AsyncStorage.setItem('star_rate', rate);
    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const visibleConfigs = NOTIF_CONFIGS.filter((c) => !c.multiUserOnly || !isSingleUser);
  const activeCount = visibleConfigs.filter((c) => enabled[c.key]).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={32} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Настройки</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <Text style={styles.sectionHeading}>Экономика</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.accordionHeader} activeOpacity={1} onPress={() => rateInputRef.current?.focus()}>
            <View style={[styles.iconWrap, { backgroundColor: '#FFF9E6' }]}>
              <FontAwesome name="star" size={18} color="#FFD166" />
            </View>
            <View style={styles.accordionText}>
              <Text style={styles.rowTitle}>Стоимость балла</Text>
              <Text style={styles.rowSub}>1 балл = {rate || '?'} ₽</Text>
            </View>
            <View style={styles.rateWrap}>
              <TextInput
                ref={rateInputRef}
                style={styles.rateInput}
                value={rate}
                onChangeText={setRate}
                keyboardType="numeric"
                maxLength={5}
                selectTextOnFocus
              />
              <Text style={styles.rateCurrency}>₽</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeading}>Коммуникации</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.accordionHeader}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/bot-selection' as any);
            }}
          >
            <View style={[styles.iconWrap, { backgroundColor: '#F0F4FF' }]}>
              <MaterialCommunityIcons name="robot-outline" size={20} color="#5C6BC0" />
            </View>
            <View style={styles.accordionText}>
              <Text style={styles.rowTitle}>Telegram-бот</Text>
            </View>
            <View style={styles.accordionRight}>
              <Text style={[styles.rightLabel, { color: selectedBot ? '#3A3A3C' : '#FF3B30' }]}>
                {selectedBot || 'не подключён'}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#CCC" />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <AccordionSection
            title="Уведомления"
            sub={`${activeCount} активных`}
            icon="bell-outline"
            iconBg="#E3F2FD"
            iconColor="#1976D2"
          >
            {visibleConfigs.map((config, i) => (
              <React.Fragment key={config.key}>
                {i > 0 && <View style={styles.notifDivider} />}
                <NotifRow
                  config={config}
                  enabled={enabled[config.key]}
                  time={config.hasTime ? times[config.key] : undefined}
                  onToggle={(val) => handleToggle(config.key, val)}
                  onTimePress={config.hasTime ? () => openTimePicker(config.key) : undefined}
                />
              </React.Fragment>
            ))}
          </AccordionSection>
        </View>

      </ScrollView>

      <View style={styles.footerWrap}>
        <TouchableOpacity style={styles.saveBtn} onPress={saveSettings} activeOpacity={0.8} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Сохранить настройки</Text>}
        </TouchableOpacity>
      </View>

      <Modal visible={timeModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.timeModal}>
            <Text style={styles.timeModalTitle}>Время уведомления</Text>
            <Text style={styles.timeModalSub}>Формат ЧЧ:ММ</Text>
            <TextInput
              style={styles.timeInput}
              value={tempTime}
              onChangeText={handleTimeInput}
              keyboardType="number-pad"
              maxLength={5}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.timeModalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTimeModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={saveTime}>
                <Text style={styles.confirmBtnText}>Готово</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15,
    backgroundColor: '#F2F2F7',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', marginLeft: -8 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A' },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  sectionHeading: {
    fontSize: 12, fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 8, marginTop: 16, marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginLeft: 60 },
  accordionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  accordionText: { flex: 1 },
  accordionBody: {
    backgroundColor: '#FAFAFA', borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA', paddingHorizontal: 16, paddingVertical: 14,
  },
  accordionRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rightLabel: { fontSize: 13, fontWeight: '500' },
  iconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  rowSub: { fontSize: 12, color: '#8E8E93', marginTop: 1 },
  rateWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7',
    borderRadius: 10, paddingHorizontal: 10, height: 36,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#DADADF',
  },
  rateInput: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', minWidth: 36, textAlign: 'right', padding: 0 },
  rateCurrency: { fontSize: 13, fontWeight: '600', color: '#8E8E93', marginLeft: 4 },
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 10 },
  notifDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginVertical: 8, marginLeft: 46 },
  notifText: { flex: 1 },
  notifRight: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 80, justifyContent: 'flex-end' },
  timeBadge: {
    backgroundColor: '#F2F2F7', paddingVertical: 4, paddingHorizontal: 9,
    borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DADADF',
  },
  timeBadgeText: { fontSize: 12, fontWeight: '600', color: '#3A3A3C' },
  footerWrap: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#F2F2F7' },
  saveBtn: { backgroundColor: '#3A3A3C', borderRadius: 14, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  timeModal: { width: 280, backgroundColor: '#FFF', borderRadius: 20, padding: 24, alignItems: 'center' },
  timeModalTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  timeModalSub: { fontSize: 13, color: '#8E8E93', marginBottom: 20 },
  timeInput: {
    width: 120, height: 52, backgroundColor: '#F2F2F7', borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#DADADF',
    fontSize: 26, fontWeight: '700', textAlign: 'center', letterSpacing: 2, marginBottom: 24, color: '#1A1A1A',
  },
  timeModalBtns: { flexDirection: 'row', width: '100%', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', backgroundColor: '#F2F2F7', borderRadius: 12 },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#8E8E93' },
  confirmBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', backgroundColor: '#3A3A3C', borderRadius: 12 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
