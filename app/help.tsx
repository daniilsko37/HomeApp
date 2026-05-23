import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRID_PADDING = 20;
const GAP = 16;
const HALF_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GAP) / 2;

// ─── Анимированная карточка штрафа ─────────────────────────────────────────

function AnimatedPenaltyCard() {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(animValue, { toValue: 1, duration: 1000, useNativeDriver: false }),
        Animated.delay(2500),
        Animated.timing(animValue, { toValue: 0, duration: 1000, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const colorAnim = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['#2ECC71', '#FF3B30']
  });

  const badgeOpacity = animValue.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0, 0, 1]
  });

  return (
    <Animated.View style={[styles.routineCard, { borderLeftColor: colorAnim }]}>
      <View style={styles.routineLeftColumn}>
        
        <View style={styles.routineBadgesRow}>
          <Animated.View style={[styles.routineBadge, { backgroundColor: colorAnim }]}>
            <FontAwesome name="star" size={14} color="#FFFFFF" />
            <Text style={styles.routineBadgeText}>7</Text>
          </Animated.View>

          <Animated.View style={[styles.routinePenaltyBadge, { opacity: badgeOpacity }]}>
            <FontAwesome name="warning" size={12} color="#FFFFFF" />
            <Text style={styles.routinePenaltyText}>ШТРАФ</Text>
          </Animated.View>
        </View>

        <Text style={styles.routineTitle} numberOfLines={2}>Пропылесосить</Text>
        <View style={styles.routineDivider} />
        <View style={styles.routineDescContainer}>
          <Text style={styles.routineDescriptionLine} numberOfLines={2}>
            - Пропылесосить всю квартиру
          </Text>
          <Text style={styles.routineDescriptionLine} numberOfLines={2}>
            - Опустошить бак от мусора
          </Text>
        </View>
      </View>
      
      <View style={styles.routineRightColumn}>
        <Image 
          source={require('../assets/images/vacuum.png')} 
          style={styles.routineImage} 
        />
      </View>
    </Animated.View>
  );
}

// ─── Карточка-пример для Квестов ──────────────────────────────────────────

function MockQuestCard() {
  const safeColor = '#FFD166';
  const badgeTextColor = '#333';
  
  const tasks = [
    { name: 'Протри люстру', current: 1, target: 1 },
    { name: 'Натри зеркало', current: 2, target: 2 },
    { name: 'Намыть окна', current: 0, target: 1 }
  ];

  return (
    <View style={[styles.questCard, { borderLeftColor: safeColor }]}>
      <View style={styles.questCardHeader}>
        <View style={[styles.questMainIconBox, { backgroundColor: safeColor + '30' }]}>
          <MaterialCommunityIcons name="weather-sunny" size={28} color="#D4A017" />
        </View>

        <View style={styles.questHeaderTextInfo}>
          <Text style={styles.questTitle} numberOfLines={1}>Ловец бликов</Text>
          <View style={styles.questProgressBarBg}>
            <View style={[styles.questProgressBarFill, { width: '75%', backgroundColor: safeColor }]} />
          </View>
          <Text style={styles.questProgressText}>
            2 из 3 задач · 75%
          </Text>
        </View>

        <View style={styles.questRightCol}>
          <View style={[styles.questBadge, { backgroundColor: safeColor }]}>
            <FontAwesome name="star" size={12} color={badgeTextColor} />
            <Text style={[styles.questBadgeText, { color: badgeTextColor }]}>20</Text>
          </View>
          <MaterialCommunityIcons name="chevron-up" size={20} color="#CCC" style={{ marginTop: 6 }} />
        </View>
      </View>

      <View style={styles.questDivider} />

      <View style={styles.questTasksList}>
        {tasks.map((task, index) => {
          const isTaskDone = task.current >= task.target;
          return (
            <View key={index} style={styles.questTaskRow}>
              <View style={styles.questTaskNameContainer}>
                <FontAwesome
                  name={isTaskDone ? 'check-circle' : 'circle-thin'}
                  size={16}
                  color={isTaskDone ? safeColor : '#CCC'}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={[
                    styles.questTaskName,
                    isTaskDone && { color: '#1A1A1A', fontWeight: 'bold' },
                  ]}
                  numberOfLines={1}
                >
                  {task.name}
                </Text>
              </View>
              <Text
                style={[
                  styles.questTaskProgressText,
                  isTaskDone && { color: '#D4A017', fontWeight: 'bold' },
                ]}
              >
                {task.current} / {task.target}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Контент для раздела "Задачи и их виды" ──────────────────────────────

const TASK_TYPES = [
  { id: 'green', color: '#2ECC71', title: 'Зелёные (Автоматические)' },
  { id: 'blue', color: '#4CC9F0', title: 'Синие (Авто-редкие)' },
  { id: 'yellow', color: '#FFD166', title: 'Жёлтые (Ручные)' },
  { id: 'violet', color: '#B19CD9', title: 'Фиолетовые (Готовка)' },
  { id: 'orange', color: '#F4A261', title: 'Оранжевые (Разовые)' }
];

const TASK_HINTS: Record<string, string> = {
  green: 'Сама появляется на главном экране по расписанию. На выполнение даётся 3 дня.',
  blue: 'Работает как зеленая, но создана для тяжелых или нечастых бытовых дел.',
  yellow: 'Без постоянного расписания, вызывается вручную через кнопку на главном экране.',
  violet: 'Ручная задача, созданная специально для кулинарных дел. Вызывается по запросу.',
  orange: 'Появляется на главном экране сразу, а после первого выполнения навсегда удаляется.'
};

function TasksHelpContent() {
  const [activeType, setActiveType] = useState('green');
  const activeColor = TASK_TYPES.find(t => t.id === activeType)?.color || '#2ECC71';
  const activeTitle = TASK_TYPES.find(t => t.id === activeType)?.title || '';

  return (
    <View style={styles.sheetContent}>
      <View style={styles.typeSelector}>
        {TASK_TYPES.map((type) => (
          <TouchableOpacity 
            key={type.id} 
            style={[
              styles.colorBlock, 
              { backgroundColor: type.color }, 
              activeType === type.id && styles.activeColorBlock
            ]} 
            onPress={() => {
              Haptics.selectionAsync();
              setActiveType(type.id);
            }} 
          />
        ))}
      </View>

      <View style={styles.hintContainer}>
        <View style={[styles.hintIndicator, { backgroundColor: activeColor }]} />
        <View style={styles.hintTextContent}>
          <Text style={styles.hintTitle}>{activeTitle}</Text>
          <Text style={styles.hintDesc}>{TASK_HINTS[activeType]}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <Text style={styles.stepTitle}>Штраф</Text>
      <AnimatedPenaltyCard />

      <Text style={[styles.sheetText, { marginTop: 10 }]}>
        Если автоматическая задача (зеленая или синяя) не выполняется в течение 3 дней со дня старта, она переходит в категорию штрафных санкций.
      </Text>
      
      <View style={styles.stepBlock}>
        <Text style={styles.sheetText}>
          • <Text style={{ fontWeight: 'bold' }}>Задача взята:</Text> Если у задачи был назначен исполнитель, штрафные баллы спишутся с его личного баланса.
        </Text>
        <Text style={[styles.sheetText, { marginTop: 6 }]}>
          • <Text style={{ fontWeight: 'bold' }}>Задача не взята:</Text> Штраф списывается одновременно со всех участников дома. Списания будут повторяться каждый день, пока задача не закроется.
        </Text>
      </View>
    </View>
  );
}

// ─── Контент для раздела "Журнал задач" ──────────────────────────────────

function JournalHelpContent() {
  const [activeTab, setActiveTab] = useState<'my' | 'waiting' | 'confirm'>('my');

  const getTabContent = () => {
    switch (activeTab) {
      case 'my':
        return {
          title: 'Задачи в работе',
          desc: 'Здесь находятся ваши текущие дела. Нажмите на карточку, чтобы завершить задачу и прикрепить фотоотчет о работе.'
        };
      case 'waiting':
        return {
          title: 'Ожидают подтверждения',
          desc: 'Выполненные задачи, которые ждут одобрения партнером. После подтверждения баллы зачислятся (в соло-режиме — сразу).'
        };
      case 'confirm':
        return {
          title: 'Требуют вашей оценки',
          desc: 'Задачи партнера. Посмотрите фото-отчет и выберите: «Принять» (начислить баллы) или «Отклонить» (вернуть в работу).'
        };
    }
  };

  const content = getTabContent();

  return (
    <View style={styles.sheetContent}>
      <Text style={styles.sheetText}>
        Журнал — это место, где задачи проходят весь жизненный цикл от старта до начисления баллов.
      </Text>
      
      <View style={styles.stepBlock}>
        <Text style={styles.stepTitle}>Как взять в работу</Text>
        <Text style={styles.sheetText}>
          Чтобы задача попала в журнал, кликните на неё на главном экране. Ручные задачи вызываются через кнопку плюса «+».
        </Text>
      </View>

      <View style={styles.divider} />
      <Text style={styles.stepTitle}>Жизненный цикл задачи</Text>

      <View style={styles.segmentedControl}>
        <TouchableOpacity 
          style={[styles.segmentBtn, activeTab === 'my' && styles.segmentBtnActive]} 
          onPress={() => { Haptics.selectionAsync(); setActiveTab('my'); }}
        >
          <Text style={[styles.segmentText, activeTab === 'my' && styles.segmentTextActive]}>
            В работе
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.segmentBtn, activeTab === 'waiting' && styles.segmentBtnActive]} 
          onPress={() => { Haptics.selectionAsync(); setActiveTab('waiting'); }}
        >
          <Text style={[styles.segmentText, activeTab === 'waiting' && styles.segmentTextActive]}>
            Ждут
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.segmentBtn, activeTab === 'confirm' && styles.segmentBtnActive]} 
          onPress={() => { Haptics.selectionAsync(); setActiveTab('confirm'); }}
        >
          <Text style={[styles.segmentText, activeTab === 'confirm' && styles.segmentTextActive]}>
            Оценить
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.hintContainer, { height: 110, alignItems: 'flex-start' }]}>
        <View style={styles.hintTextContent}>
          <Text style={styles.hintTitle}>{content.title}</Text>
          <Text style={styles.hintDesc}>{content.desc}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Данные для 7 разделов помощи ──────────────────────────────────────────

const HELP_TOPICS = [
  {
    id: 'basics',
    title: 'Основы & Дом',
    subtitle: 'Синхронизация',
    icon: 'home-heart',
    color: '#FF3B30',
    bg: '#FFF0EF',
    size: 'full',
    renderContent: () => (
      <View style={styles.sheetContent}>
        <Text style={styles.sheetText}>
          <Text style={{ fontWeight: 'bold', color: '#1A1A1A' }}>HomeApp</Text> — это система управления совместным бытом, построенная по игровым правилам.
        </Text>
        <View style={styles.stepBlock}>
          <Text style={styles.stepTitle}>Синхронизация пространства</Text>
          <Text style={styles.sheetText}>Один участник создает дом и генерирует уникальный код. Второй участник вводит этот код при авторизации, чтобы полностью объединить профили, баланс и общую базу задач.</Text>
        </View>
        <View style={styles.stepBlock}>
          <Text style={styles.stepTitle}>Баланс сил</Text>
          <Text style={styles.sheetText}>Каждое выполненное действие прибавляет очки на ваш личный счет, которые можно потратить на реальные награды внутрисемейной экономики.</Text>
        </View>
      </View>
    ),
  },
  {
    id: 'tasks',
    title: 'Задачи и их виды',
    subtitle: 'Цвета и просрочка',
    icon: 'format-list-bulleted-type',
    color: '#2ECC71',
    bg: '#EAF9EE',
    size: 'half',
    renderContent: () => <TasksHelpContent />,
  },
  {
    id: 'journal',
    title: 'Журнал задач',
    subtitle: 'Процесс выполнения',
    icon: 'format-list-checks',
    color: '#007AFF',
    bg: '#E5F1FF',
    size: 'half',
    renderContent: () => <JournalHelpContent />,
  },
  {
    id: 'shop',
    title: 'Магазин & Вишлист',
    subtitle: 'Обмен очков',
    icon: 'storefront-outline',
    color: '#5C6BC0',
    bg: '#F0F4FF',
    size: 'half',
    renderContent: () => (
      <View style={styles.sheetContent}>
        <View style={styles.stepBlock}>
          <Text style={styles.stepTitle}>Магазин вознаграждений (Общий)</Text>
          <Text style={styles.sheetText}>Общая витрина дома, отображаемая у всех. Сюда добавляются небольшие призы (шоколадки, пицца), которые настраивают сами игроки. Накопил баллы — обменял на заслуженный отдых.</Text>
        </View>
        <View style={styles.stepBlock}>
          <Text style={styles.stepTitle}>Вишлист желаний (Личный)</Text>
          <Text style={styles.sheetText}>Ваши личные крупные цели. Вы сами копите баллы, чтобы порадовать себя мечтой. Также ваш вишлист открыт для других людей, чтобы они могли узнать цену и сделать подарок в реальной жизни.</Text>
        </View>
      </View>
    ),
  },
  {
    id: 'quests',
    title: 'Квесты',
    subtitle: 'Супер-награды',
    icon: 'trophy-outline',
    color: '#FF9500',
    bg: '#FFF5E5',
    size: 'half',
    renderContent: () => (
      <View style={styles.sheetContent}>
        <Text style={styles.sheetText}>Квест — это масштабная цепочка задач с крупной наградой за полное прохождение.</Text>
        
        <MockQuestCard />

        <View style={styles.stepBlock}>
          <Text style={styles.sheetText}>В отличие от обычных дел, здесь вы видите шкалу прогресса. Выполняйте каждый этап, чтобы заполнить её до конца и забрать супер-приз.</Text>
        </View>
      </View>
    ),
  },
  {
    id: 'creation',
    title: 'Создание контента',
    subtitle: 'Управление домом',
    icon: 'plus-box-multiple-outline',
    color: '#9C27B0',
    bg: '#F5EEF8',
    size: 'full',
    renderContent: () => (
      <View style={styles.sheetContent}>
        <Text style={styles.sheetText}>
          Гибкая кастомизация игрового пространства под ваши правила и привычки. Без добавленного контента приложение не будет работать в полную силу — каждый дом должен сам собрать свое идеальное расписание и желанные награды.
        </Text>

        <View style={styles.stepBlock}>
          <Text style={styles.stepTitle}>Наполнение базы</Text>
          <Text style={styles.sheetText}>Обязательно добавляйте свои товары в Магазин и придумывайте цепочки Квестов. Это главная мотивация зарабатывать баллы и выполнять рутину.</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.stepTitle}>Секретный доступ</Text>
        <View style={styles.stepBlock}>
          <Text style={styles.sheetText}>
            Меню создания скрыто от случайных глаз. Чтобы открыть панель добавления товаров и квестов, зайдите в свой Профиль и <Text style={{ fontWeight: 'bold', color: '#1A1A1A' }}>быстро нажмите 5 раз на строку «Код дома»</Text>.
          </Text>
        </View>
      </View>
    ),
  },
  {
    id: 'bot',
    title: 'Дворецкий (Telegram)',
    subtitle: 'Интеграция бота',
    icon: 'robot-outline',
    color: '#1A1A1A',
    bg: '#EAEAEA',
    size: 'full',
    renderContent: () => (
      <View style={styles.sheetContent}>
        <Text style={styles.sheetText}>
          Инструмент внешних коммуникаций для контроля домашнего расписания без необходимости постоянно заходить в приложение.
        </Text>
        <View style={styles.stepBlock}>
          <Text style={styles.sheetText}>
            Бот подключается в настройках. Он будет присылать план задач в установленное вами время, уведомлять о покупках партнера в Магазине, просить проверить выполненные дела и по факту сообщать о начисленных штрафах за просрочку.
          </Text>
        </View>
      </View>
    ),
  },
];

// ─── Основной компонент ──────────────────────────────────────────────────

export default function HelpScreen() {
  const router = useRouter();
  const [activeTopic, setActiveTopic] = useState<typeof HELP_TOPICS[0] | null>(null);
  
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const openSheet = (topic: typeof HELP_TOPICS[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTopic(topic);
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 65,
      friction: 11,
      useNativeDriver: false, 
    }).start();
  };

  const closeSheet = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: false,
    }).start(() => setActiveTopic(null));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 1.2) {
          closeSheet();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 65,
            friction: 11,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  // 🪄 Скролл отключен везде, КРОМЕ раздела 'tasks'
  const noScrollSections = ['basics', 'journal', 'shop', 'quests', 'creation', 'bot'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={32} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Справочник</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 🪄 Глупая надпись полностью удалена отсюда */}
        <View style={styles.bentoGrid}>
          {HELP_TOPICS.map((topic) => {
            const isHalf = topic.size === 'half';
            return (
              <TouchableOpacity
                key={topic.id}
                style={[
                  styles.bentoCard,
                  isHalf ? { width: HALF_WIDTH } : { width: '100%' }
                ]}
                activeOpacity={0.7}
                onPress={() => openSheet(topic)}
              >
                <View style={[styles.iconBox, { backgroundColor: topic.bg }]}>
                  <MaterialCommunityIcons name={topic.icon as any} size={28} color={topic.color} />
                </View>
                <View style={styles.bentoTextWrap}>
                  <Text style={styles.bentoTitle}>{topic.title}</Text>
                  <Text style={styles.bentoSub}>{topic.subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={!!activeTopic} transparent animationType="none" onRequestClose={closeSheet}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={closeSheet}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          
          <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}>
            <View {...panResponder.panHandlers} style={styles.draggableHeader}>
              <View style={styles.sheetHandleWrap}>
                <View style={styles.sheetHandle} />
              </View>

              {activeTopic && (
                <View style={styles.sheetHeader}>
                  <View style={[styles.iconBox, { backgroundColor: activeTopic.bg, marginBottom: 0 }]}>
                    <MaterialCommunityIcons name={activeTopic.icon as any} size={28} color={activeTopic.color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.sheetTitle}>{activeTopic.title}</Text>
                    <Text style={styles.sheetSub}>{activeTopic.subtitle}</Text>
                  </View>
                  <TouchableOpacity onPress={closeSheet} style={styles.closeBtn}>
                    <MaterialCommunityIcons name="close" size={24} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {activeTopic && (
              <ScrollView 
                showsVerticalScrollIndicator={false} 
                contentContainerStyle={{ paddingBottom: 40, paddingTop: 20 }}
                scrollEnabled={!noScrollSections.includes(activeTopic.id)}
              >
                {activeTopic.renderContent()}
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10,
    backgroundColor: '#F2F2F7',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', marginLeft: -8 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A' },
  
  scrollContent: { paddingHorizontal: GRID_PADDING, paddingTop: 10, paddingBottom: 40 },

  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  bentoCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  iconBox: {
    width: 52, height: 52, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  bentoTextWrap: { flex: 1, justifyContent: 'flex-end' },
  bentoTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 },
  bentoSub: { fontSize: 13, color: '#8E8E93', fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: SCREEN_HEIGHT * 0.85,
    minHeight: SCREEN_HEIGHT * 0.5,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 10,
  },
  draggableHeader: { width: '100%', backgroundColor: 'transparent' },
  sheetHandleWrap: { width: '100%', alignItems: 'center', paddingTop: 12, paddingBottom: 20 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#E5E5EA' },
  
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10 },
  sheetTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A' },
  sheetSub: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  closeBtn: { width: 36, height: 36, backgroundColor: '#F2F2F7', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

  sheetContent: { gap: 16 },
  sheetText: { fontSize: 15, color: '#3A3A3C', lineHeight: 22 },
  stepBlock: { backgroundColor: '#F8F9FA', padding: 16, borderRadius: 16 },
  stepTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 },
  divider: { width: '100%', height: 1, backgroundColor: '#F0F0F0', marginVertical: 10 },

  typeSelector: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: 12, 
    flexWrap: 'wrap',
    paddingVertical: 10,
    width: '100%' 
  },
  colorBlock: { width: 50, height: 40, borderRadius: 12, opacity: 0.3 }, 
  activeColorBlock: { opacity: 1, borderWidth: 3, borderColor: '#555555', transform: [{ scale: 1.1 }] }, 
  
  hintContainer: { flexDirection: 'row', width: '100%', backgroundColor: '#FFF', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F0F0F0', minHeight: 70 },
  hintIndicator: { width: 6, height: '100%', borderRadius: 3, marginRight: 12 },
  hintTextContent: { flex: 1, justifyContent: 'center' },
  hintTitle: { fontSize: 14, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 4 },
  hintDesc: { fontSize: 13, color: '#666', lineHeight: 18 },

  routineCard: { 
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 16, 
    width: '100%', aspectRatio: 1100 / 520, marginBottom: 5, shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, 
    elevation: 2, borderLeftWidth: 6,
  },
  routineLeftColumn: { width: '60%', height: '100%', justifyContent: 'flex-start', alignItems: 'flex-start' },
  routineRightColumn: { flex: 1, height: '100%', alignItems: 'flex-end', justifyContent: 'center' },
  routineBadgesRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  routineBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, marginRight: 6 },
  routineBadgeText: { fontWeight: 'bold', fontSize: 16, marginLeft: 4, color: '#FFF' },
  routinePenaltyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF3B30', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  routinePenaltyText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12, marginLeft: 4 },
  routineTitle: { fontSize: 22, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  routineDivider: { width: '100%', height: 1, backgroundColor: '#000', marginBottom: 8 },
  routineDescContainer: { flex: 1, width: '100%' },
  routineDescriptionLine: { fontSize: 11, color: '#333', marginBottom: 2, fontWeight: '500' },
  routineImage: { width: '95%', height: '95%', resizeMode: 'contain' },

  segmentedControl: { flexDirection: 'row', backgroundColor: '#EFEFEF', borderRadius: 12, padding: 4, marginVertical: 10 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#888' },
  segmentTextActive: { color: '#1A1A1A' },

  questCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginVertical: 10,
    borderLeftWidth: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  questCardHeader: { flexDirection: 'row', alignItems: 'center' },
  questMainIconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  questHeaderTextInfo: { flex: 1, justifyContent: 'center' },
  questTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 6 },
  questProgressBarBg: { width: '90%', height: 6, backgroundColor: '#EAEAEA', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  questProgressBarFill: { height: '100%', borderRadius: 3 },
  questProgressText: { fontSize: 12, color: '#888', fontWeight: '600' },
  questRightCol: { justifyContent: 'flex-start', alignItems: 'flex-end', marginLeft: 10 },
  questBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10 },
  questBadgeText: { fontWeight: 'bold', fontSize: 13, marginLeft: 4 },
  questDivider: { width: '100%', height: 1, backgroundColor: '#F0F0F0', marginTop: 14, marginBottom: 12 },
  questTasksList: { width: '100%' },
  questTaskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  questTaskNameContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  questTaskName: { fontSize: 13, color: '#555', fontWeight: '500', flexShrink: 1 },
  questTaskProgressText: { fontSize: 13, color: '#888', fontWeight: '600' },
});