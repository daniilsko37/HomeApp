import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, UIManager, View } from 'react-native';
import { supabase } from '../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ICONS = [
  'hamburger', 'pizza', 'coffee', 'candy', 'ice-cream',
  'cupcake', 'glass-cocktail', 'popcorn', 'silverware-fork-knife', 'gamepad-variant', 
  'puzzle', 'movie-open', 'music-note', 'ticket', 'bed', 
  'sofa', 'car', 'airplane', 'map-marker', 'shopping', 
  'star', 'heart', 'gift', 'diamond-stone', 'trophy'
];

const COLORS = [
  '#3A3A3C', '#8C6239', '#E07A5F', '#D0021B', '#F5A623', 
  '#FFD166', '#7ED321', '#2ECC71', '#4A90E2', '#9C27B0'
];

export default function WishlistScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'my' | 'house' | 'search'>('my');
  
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');

  const [myItems, setMyItems] = useState<any[]>([]);
  const [housemates, setHousemates] = useState<string[]>([]);
  const [pinnedFriends, setPinnedFriends] = useState<string[]>([]); 
  
  const [selectedHousemate, setSelectedHousemate] = useState<string | null>(null);
  const [housemateItems, setHousemateItems] = useState<any[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedItems, setSearchedItems] = useState<any[]>([]);
  const [foundUsers, setFoundUsers] = useState<string[]>([]); 
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newPriceRub, setNewPriceRub] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLink, setNewLink] = useState('');
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
  const [selectedIcon, setSelectedIcon] = useState('heart');
  const [selectedColor, setSelectedColor] = useState('#D0021B');

  const [itemToView, setItemToView] = useState<any | null>(null);
  const [itemToRestore, setItemToRestore] = useState<any | null>(null); 
  const [itemToDelete, setItemToDelete] = useState<any | null>(null); 
  const [friendToDelete, setFriendToDelete] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastFade = useRef(new Animated.Value(0)).current;
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    Animated.timing(toastFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => {
      Animated.timing(toastFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setToastMessage(null);
      });
    }, 2500);
  };

  const translateY = useRef(new Animated.Value(0)).current;
  const lastCardIndex = useRef(0);
  const allFriends = Array.from(new Set([...housemates, ...pinnedFriends]));

  const handleScroll = (event: any) => {
    const currentOffset = event.nativeEvent.contentOffset.y;
    const CARD_HEIGHT = 430; 
    const currentIndex = Math.floor(currentOffset / CARD_HEIGHT);
    if (currentIndex !== lastCardIndex.current && currentOffset > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      lastCardIndex.current = currentIndex;
    }
  };

  const handleCloseModal = useCallback(() => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(translateY, { toValue: 1000, duration: 250, useNativeDriver: true }).start(() => {
      setIsModalVisible(false);
      setShowIconPicker(false);
    });
  }, [translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => { if (gestureState.dy > 0) translateY.setValue(gestureState.dy); },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) handleCloseModal();
        else Animated.spring(translateY, { toValue: 0, bounciness: 6, useNativeDriver: true }).start();
      },
    })
  ).current;

  const handleOpenModal = () => {
    resetForm(); 
    Keyboard.dismiss();
    translateY.setValue(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsModalVisible(true);
  };

  const handleEditInit = (item: any) => {
    setEditingId(item.id);
    setNewTitle(item.title);
    setNewPriceRub((item.price_rub || item.price * 100).toString());
    setNewDesc(item.description || '');
    setNewLink(item.item_link || '');
    setNewImageUrl(item.image_url);
    setSelectedIcon(item.icon || 'heart');
    setSelectedColor(item.color || '#D0021B');
    Keyboard.dismiss();
    translateY.setValue(0);
    setIsModalVisible(true);
  };

  const initData = useCallback(async () => {
    const name = await AsyncStorage.getItem('user_name');
    const room = await AsyncStorage.getItem('room_id');
    const g = await AsyncStorage.getItem('user_gender');
    
    if (name) setUserName(name);
    if (room) setRoomId(room);
    if (g === 'female') setGender('female');
    
    if (name && room) {
      fetchMyItems(name);
      fetchHousemates(room, name);

      const { data: profile } = await supabase
        .from('profiles')
        .select('pinned_friends')
        .eq('name', name)
        .single();

      if (profile && profile.pinned_friends) {
        setPinnedFriends(profile.pinned_friends);
      } else {
        const savedFriends = await AsyncStorage.getItem('pinned_friends');
        if (savedFriends) setPinnedFriends(JSON.parse(savedFriends));
      }
    }
  }, []);

  useEffect(() => { initData(); }, [initData]);

  useEffect(() => {
    if (!selectedHousemate && allFriends.length > 0) {
      setSelectedHousemate(allFriends[0]);
      fetchHousemateItems(allFriends[0]);
    }
  }, [allFriends, selectedHousemate]);

  const fetchMyItems = async (name: string) => {
    setLoading(true);
    const { data } = await supabase.from('wishlist_items')
      .select('*')
      .eq('user_name', name)
      .order('is_purchased', { ascending: true }) 
      .order('created_at', { ascending: false });
    if (data) setMyItems(data);
    setLoading(false);
  };

  const fetchHousemates = async (room: string, myName: string) => {
    const { data } = await supabase.from('profiles').select('name').eq('room_id', room).neq('name', myName);
    if (data) setHousemates(data.map(d => d.name));
  };

  const fetchHousemateItems = async (name: string) => {
    setLoading(true);
    const { data } = await supabase.from('wishlist_items')
      .select('*')
      .eq('user_name', name)
      .order('is_purchased', { ascending: true })
      .order('created_at', { ascending: false });
    if (data) setHousemateItems(data);
    setLoading(false);
  };

  // Поиск — без вибрации, отдельный searchLoading
  const handleSearchByQuery = async (q: string) => {
    setSearchLoading(true);
    setHasSearched(true);

    const { data: usersData } = await supabase
      .from('profiles')
      .select('name')
      .ilike('name', `%${q}%`);
    const foundNames = usersData
      ? usersData.map((u: any) => u.name).filter((n: string) => n !== userName)
      : [];
    setFoundUsers(foundNames);

    const { data: itemsData } = await supabase
      .from('wishlist_items')
      .select('*')
      .ilike('user_name', `%${q}%`)
      .order('is_purchased', { ascending: true })
      .order('created_at', { ascending: false });
    if (itemsData) setSearchedItems(itemsData);

    setSearchLoading(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    Keyboard.dismiss();
    handleSearchByQuery(searchQuery.trim());
  };

  const addPinnedFriend = async (friendName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Гендерный тост
    const action = gender === 'female' ? 'добавила' : 'добавил';
    showToast(`Ты ${action} ${friendName}`);
    const newPinned = [...pinnedFriends, friendName];
    setPinnedFriends(newPinned);
    
    await AsyncStorage.setItem('pinned_friends', JSON.stringify(newPinned));
    await supabase.from('profiles').update({ pinned_friends: newPinned }).eq('name', userName);
  };

  const removePinnedFriend = async (friendName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPinned = pinnedFriends.filter(f => f !== friendName);
    setPinnedFriends(newPinned);
    
    await AsyncStorage.setItem('pinned_friends', JSON.stringify(newPinned));
    await supabase.from('profiles').update({ pinned_friends: newPinned }).eq('name', userName);

    if (selectedHousemate === friendName) {
      const remainingFriends = Array.from(new Set([...housemates, ...newPinned]));
      if (remainingFriends.length > 0) {
        setSelectedHousemate(remainingFriends[0]);
        fetchHousemateItems(remainingFriends[0]);
      } else {
        setSelectedHousemate(null);
        setHousemateItems([]);
      }
    }
  };

  const handleLongPressMate = (mate: string) => {
    if (housemates.includes(mate)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast('Это твой самый близкий, нельзя удалить');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFriendToDelete(mate);
  };

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3, 
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewImageUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleSaveItem = async () => {
    if (!newTitle.trim() || !newPriceRub.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast('Введи название и цену!');
      return;
    }

    setLoading(true);
    const rateStr = await AsyncStorage.getItem('star_rate');
    const exchangeRate = rateStr ? parseInt(rateStr, 10) : 100;
    const calculatedStars = Math.floor(parseInt(newPriceRub, 10) / exchangeRate);

    const itemData = {
      user_name: userName,
      room_id: roomId,
      title: newTitle.trim(),
      price_rub: parseInt(newPriceRub, 10),
      price: calculatedStars,
      description: newDesc.trim() || null,
      item_link: newLink.trim() || null,
      image_url: newImageUrl,
      icon: selectedIcon,   
      color: selectedColor  
    };

    let error;
    if (editingId) {
      const res = await supabase.from('wishlist_items').update(itemData).eq('id', editingId);
      error = res.error;
    } else {
      const res = await supabase.from('wishlist_items').insert([itemData]);
      error = res.error;
    }

    setLoading(false);
    if (!error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleCloseModal();
      resetForm();
      fetchMyItems(userName);
    } else {
      showToast('Не удалось сохранить');
    }
  };

  const handleRestoreItem = async () => {
    if (!itemToRestore) return;
    try {
      setLoading(true);
      await supabase.from('wishlist_items').update({ is_purchased: false, booked_by: null }).eq('id', itemToRestore.id);
      setItemToRestore(null);
      fetchMyItems(userName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      setLoading(true);
      await supabase.from('wishlist_items').delete().eq('id', itemToDelete.id);
      setItemToDelete(null);
      fetchMyItems(userName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const confirmGift = async () => {
    if (!itemToView) return;
    try {
      setLoading(true);
      await supabase.from('wishlist_items').update({ booked_by: userName }).eq('id', itemToView.id);
      setItemToView(null);
      if (selectedHousemate) fetchHousemateItems(selectedHousemate);
      if (activeTab === 'search') handleSearch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Подарок забронирован!');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const confirmUnbook = async () => {
    if (!itemToView) return;
    try {
      setLoading(true);
      await supabase.from('wishlist_items').update({ booked_by: null }).eq('id', itemToView.id);
      setItemToView(null);
      if (selectedHousemate) fetchHousemateItems(selectedHousemate);
      if (activeTab === 'search') handleSearch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveItem = async () => {
    if (!itemToView) return;
    try {
      setLoading(true);
      const res = await supabase.from('wishlist_items').update({ is_purchased: true }).eq('id', itemToView.id);
      setLoading(false);
      if (res.error) {
        showToast('Ошибка базы данных');
      } else {
        setItemToView(null);
        fetchMyItems(userName);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('Перенесено в архив');
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setNewTitle('');
    setNewPriceRub('');
    setNewDesc('');
    setNewLink('');
    setNewImageUrl(null);
    setSelectedIcon('heart');
    setSelectedColor('#D0021B');
  };

  const openLink = (url: string) => {
    if (url) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Linking.openURL(url);
    }
  };

  const renderInstaCard = (item: any, isMine: boolean) => {
    const safeIcon = ICONS.includes(item.icon) ? item.icon : 'heart';
    const safeColor = item.color || '#D0021B';
    const isPurchased = item.is_purchased; 
    const isBooked = !!item.booked_by;
    const showAsBooked = !isMine && isBooked && !isPurchased;
    const isBookedByMe = item.booked_by === userName;

    return (
      <TouchableOpacity 
        key={item.id} 
        style={[styles.instaCard, (isPurchased || showAsBooked) && styles.instaCardInactive]} 
        activeOpacity={0.9}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (isPurchased) {
            if (isMine) setItemToRestore(item);
            else setItemToView(item);
          } else {
            if (!isMine && isBooked && !isBookedByMe) {
              showToast('Эту мечту уже кто-то исполняет');
              return;
            }
            setItemToView(item); 
          }
        }}
        onLongPress={() => {
          if (isMine && !isPurchased) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            handleEditInit(item); 
          }
        }}
      >
        <View style={styles.instaImageWrapper}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.instaImage} />
          ) : (
            <View style={styles.instaPlaceholderGift}>
              <MaterialCommunityIcons name="gift" size={80} color={(isPurchased || showAsBooked) ? '#CCC' : '#E07A5F'} />
            </View>
          )}

          {isPurchased && (
            <View style={styles.purchasedOverlay}>
              <MaterialCommunityIcons name="check-circle" size={64} color="#FFF" />
              <Text style={styles.purchasedText}>Исполнено</Text>
            </View>
          )}

          {showAsBooked && (
            <View style={styles.purchasedOverlay}>
              <MaterialCommunityIcons name={isBookedByMe ? "lock-open" : "lock"} size={64} color="#FFF" />
              <Text style={styles.purchasedText}>{isBookedByMe ? "Твоя бронь" : "Забронировано"}</Text>
            </View>
          )}

          {isMine && !isPurchased && (
            <TouchableOpacity 
              style={styles.deleteCrossBtn} 
              onPress={() => { 
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
                setItemToDelete(item); 
              }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="close" size={20} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.instaFooter}>
          <View style={styles.titleRow}>
            <MaterialCommunityIcons name={safeIcon as any} size={18} color={(isPurchased || showAsBooked) ? '#AAA' : safeColor} style={{ marginRight: 6 }} />
            <Text style={[styles.instaTitle, (isPurchased || showAsBooked) && { color: '#AAA' }]} numberOfLines={1}>{item.title}</Text>
          </View>
          <View style={[styles.priceBadgeActive, (isPurchased || showAsBooked) && { backgroundColor: '#F0F0F0' }]}>
            <Text style={[styles.inputPrice, (isPurchased || showAsBooked) && { color: '#888' }]}>{item.price}</Text>
            <MaterialCommunityIcons name="star" size={14} color={(isPurchased || showAsBooked) ? "#888" : "#1A1A1A"} style={{ marginLeft: 4 }} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isMineView = itemToView?.user_name === userName;
  const isBookedView = !!itemToView?.booked_by;
  const isBookedByMeView = itemToView?.booked_by === userName;
  const isPurchasedView = itemToView?.is_purchased;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={32} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Вишлист</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ paddingHorizontal: 20, marginBottom: 15 }}>
        <View style={styles.segmentedControl}>
          <TouchableOpacity style={[styles.segmentBtn, activeTab === 'my' && styles.segmentBtnActive]} onPress={() => { Haptics.selectionAsync(); setActiveTab('my'); }}>
            <Text style={[styles.segmentText, activeTab === 'my' && styles.segmentTextActive]}>Мой</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentBtn, activeTab === 'house' && styles.segmentBtnActive]} onPress={() => { Haptics.selectionAsync(); setActiveTab('house'); }}>
            <Text style={[styles.segmentText, activeTab === 'house' && styles.segmentTextActive]}>Близкие</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentBtn, activeTab === 'search' && styles.segmentBtnActive]} onPress={() => { Haptics.selectionAsync(); setActiveTab('search'); }}>
            <Text style={[styles.segmentText, activeTab === 'search' && styles.segmentTextActive]}>Поиск</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onScroll={handleScroll} scrollEventThrottle={16}>
        
        {activeTab === 'my' && (
          <View>
            {/* Показываем лоадер пока идёт загрузка, не пустое состояние */}
            {loading ? (
              <ActivityIndicator color="#E07A5F" style={{ marginTop: 40 }} />
            ) : myItems.length === 0 ? (
              <View style={styles.emptyStateCenter}>
                <MaterialCommunityIcons name="heart-broken" size={64} color="#EFEFEF" style={{ marginBottom: 15 }} />
                <Text style={styles.emptyStateTitle}>Тут пока пусто</Text>
                <Text style={styles.emptyStateDesc}>Самое время добавить первую мечту!</Text>
              </View>
            ) : (
              myItems.map(item => renderInstaCard(item, true))
            )}
          </View>
        )}

        {activeTab === 'house' && (
          <View>
            {loading ? (
              <ActivityIndicator color="#E07A5F" style={{ marginTop: 40 }} />
            ) : allFriends.length === 0 ? (
              <View style={styles.emptyStateCenter}>
                <MaterialCommunityIcons name="account-group" size={64} color="#EFEFEF" style={{ marginBottom: 15 }} />
                <Text style={styles.emptyStateTitle}>Тут пока никого нет</Text>
                <Text style={styles.emptyStateDesc}>Добавь близких людей через поиск, чтобы всегда видеть их мечты и делать сюрпризы!</Text>
              </View>
            ) : (
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  {allFriends.map(mate => (
                    <TouchableOpacity 
                      key={mate} 
                      style={[styles.matePill, selectedHousemate === mate && styles.matePillActive]}
                      onPress={() => { Haptics.selectionAsync(); setSelectedHousemate(mate); fetchHousemateItems(mate); }}
                      onLongPress={() => handleLongPressMate(mate)}
                    >
                      <Text style={[styles.matePillText, selectedHousemate === mate && styles.matePillTextActive]}>{mate}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {loading ? (
                  <ActivityIndicator color="#E07A5F" style={{ marginTop: 20 }} />
                ) : housemateItems.length === 0 ? (
                  <Text style={[styles.emptyStateDesc, { textAlign: 'center', marginTop: 40 }]}>У пользователя пока нет желаний.</Text>
                ) : (
                  housemateItems.map(item => renderInstaCard(item, false))
                )}
              </View>
            )}
          </View>
        )}

        {activeTab === 'search' && (
          <View>
            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="magnify" size={24} color="#888" style={{ marginRight: 10 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Введи никнейм..."
                placeholderTextColor="#AAA"
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  if (searchDebounce.current) clearTimeout(searchDebounce.current);
                  if (text.trim().length < 2) {
                    setFoundUsers([]);
                    setSearchedItems([]);
                    setHasSearched(false);
                    return;
                  }
                  searchDebounce.current = setTimeout(() => {
                    handleSearchByQuery(text.trim());
                  }, 400);
                }}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              {searchLoading && <ActivityIndicator color="#E07A5F" size="small" style={{ marginLeft: 8 }} />}
            </View>

            {foundUsers.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <Text style={styles.sectionHeadingSmall}>Найденные профили</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                  {foundUsers.map(u => {
                    const isHousemate = housemates.includes(u);
                    const isPinned = pinnedFriends.includes(u);
                    const isAdded = isHousemate || isPinned;
                    return (
                      <View key={u} style={styles.userPill}>
                        <Text style={styles.userPillText}>{u}</Text>
                        {!isAdded ? (
                          <TouchableOpacity onPress={() => addPinnedFriend(u)} style={styles.addUserBtn} activeOpacity={0.7}>
                            <MaterialCommunityIcons name="plus" size={16} color="#FFF" />
                          </TouchableOpacity>
                        ) : isHousemate ? (
                          <View style={styles.addedUserBtn}>
                            <MaterialCommunityIcons name="home-heart" size={18} color="#E07A5F" />
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => removePinnedFriend(u)} style={styles.addedUserBtn} activeOpacity={0.7}>
                            <MaterialCommunityIcons name="check" size={16} color="#2ECC71" />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {hasSearched && searchedItems.length === 0 && foundUsers.length === 0 && !searchLoading ? (
              <Text style={[styles.emptyStateDesc, { marginTop: 40, textAlign: 'center' }]}>Ничего не найдено.</Text>
            ) : (
              <View style={{ marginTop: 20 }}>
                {searchedItems.map(item => renderInstaCard(item, false))}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {activeTab === 'my' && (
        <View style={styles.floatingWideBtnWrapper}>
          <TouchableOpacity style={styles.floatingWideBtn} onPress={handleOpenModal} activeOpacity={0.9}>
            <MaterialCommunityIcons name="plus" size={24} color="#FFF" />
            <Text style={styles.floatingWideBtnText}>Добавить желание</Text>
          </TouchableOpacity>
        </View>
      )}

      {toastMessage && (
        <Animated.View style={[styles.toastContainer, { opacity: toastFade }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      <Modal visible={!!itemToView} animationType="fade" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setItemToView(null); }} />
          <View style={styles.actionCard}>
            <View style={[styles.actionIconCircle, { backgroundColor: (itemToView?.color || '#D0021B') + '2A' }]}>
              <MaterialCommunityIcons name={itemToView?.icon || 'heart'} size={48} color={itemToView?.color || '#D0021B'} />
            </View>
            <Text style={styles.actionTitle} numberOfLines={2}>{itemToView?.title}</Text>
            <Text style={[styles.actionDesc, !itemToView?.description && { fontStyle: 'italic', color: '#AAA' }]}>
              {itemToView?.description || 'Нет описания'}
            </Text>
            {!isMineView && isPurchasedView && (
              <Text style={[styles.lockedText, { color: itemToView?.color || '#1A1A1A' }]}>Эта мечта уже исполнена</Text>
            )}
            {!isMineView && isBookedView && !isBookedByMeView && !isPurchasedView && (
              <Text style={styles.lockedText}>Эту мечту уже кто-то исполняет</Text>
            )}
            <View style={{ width: '100%', gap: 10 }}>
              <View style={styles.actionRow}>
                {itemToView?.item_link && (
                  <TouchableOpacity style={[styles.confirmActionBtn, { backgroundColor: (itemToView?.color || '#D0021B') + '2A', flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }]} onPress={() => openLink(itemToView.item_link)}>
                    <MaterialCommunityIcons name="link-variant" size={18} color={itemToView?.color || '#D0021B'} style={{ marginRight: 6 }} />
                    <Text style={[styles.confirmActionBtnText, { color: itemToView?.color || '#D0021B' }]}>Перейти</Text>
                  </TouchableOpacity>
                )}
                {isMineView && (
                  <TouchableOpacity style={[styles.confirmActionBtn, { backgroundColor: '#555555', flex: 1 }]} onPress={handleArchiveItem} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmActionBtnText}>В архив</Text>}
                  </TouchableOpacity>
                )}
                {!isMineView && !isBookedView && !isPurchasedView && (
                  <TouchableOpacity style={[styles.confirmActionBtn, { backgroundColor: itemToView?.color || '#1A1A1A', flex: 1 }]} onPress={confirmGift} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmActionBtnText}>Подарить</Text>}
                  </TouchableOpacity>
                )}
                {!isMineView && isBookedByMeView && !isPurchasedView && (
                  <TouchableOpacity style={[styles.confirmActionBtn, { backgroundColor: '#555555', flex: 1 }]} onPress={confirmUnbook} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmActionBtnText}>Снять бронь</Text>}
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={[styles.cancelActionBtn, { width: '100%' }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setItemToView(null); }}>
                <Text style={styles.cancelActionBtnText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!itemToRestore} animationType="fade" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setItemToRestore(null); }} />
          <View style={styles.actionCard}>
            <View style={[styles.actionIconCircle, { backgroundColor: '#FFF9E6' }]}><MaterialCommunityIcons name="refresh" size={48} color="#F5A623" /></View>
            <Text style={styles.actionTitle}>Повторить?</Text>
            <Text style={styles.actionDesc}>Хочешь вернуть{'\n'}<Text style={{ fontWeight: 'bold', color: '#1A1A1A' }}>{itemToRestore?.title}</Text> обратно в активные?</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.cancelActionBtn, { flex: 1 }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setItemToRestore(null); }}>
                <Text style={styles.cancelActionBtnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmActionBtn, { backgroundColor: '#F5A623', flex: 1 }]} onPress={handleRestoreItem} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmActionBtnText}>Вернуть</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!itemToDelete} animationType="fade" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setItemToDelete(null); }} />
          <View style={styles.actionCard}>
            <View style={[styles.actionIconCircle, { backgroundColor: '#FFF0F0' }]}><MaterialCommunityIcons name="heart-broken" size={48} color="#FF3B30" /></View>
            <Text style={styles.actionTitle}>Удалить мечту?</Text>
            <Text style={styles.actionDesc}>Ты точно хочешь удалить{'\n'}<Text style={{ fontWeight: 'bold', color: '#1A1A1A' }}>{itemToDelete?.title}</Text>?</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.cancelActionBtn, { flex: 1 }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setItemToDelete(null); }}>
                <Text style={styles.cancelActionBtnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmActionBtn, { backgroundColor: '#FF3B30', flex: 1 }]} onPress={confirmDelete} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmActionBtnText}>Удалить</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!friendToDelete} animationType="fade" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFriendToDelete(null); }} />
          <View style={styles.actionCard}>
            <View style={[styles.actionIconCircle, { backgroundColor: '#FFF0F0' }]}>
              <MaterialCommunityIcons name="heart-broken" size={48} color="#FF3B30" />
            </View>
            <Text style={styles.actionTitle}>Удалить из близких?</Text>
            <Text style={styles.actionDesc}>Больше не следить за мечтами{'\n'}<Text style={{ fontWeight: 'bold', color: '#1A1A1A' }}>{friendToDelete}</Text>?</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.cancelActionBtn, { flex: 1 }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFriendToDelete(null); }}>
                <Text style={styles.cancelActionBtnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmActionBtn, { backgroundColor: '#FF3B30', flex: 1 }]} onPress={() => { removePinnedFriend(friendToDelete!); setFriendToDelete(null); }}>
                <Text style={styles.confirmActionBtnText}>Удалить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isModalVisible} animationType="fade" transparent={true} onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleCloseModal} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
            <Animated.View style={[styles.modalContent, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
              <View style={styles.dragHandleArea}><View style={styles.dragHandle} /></View>
              {showIconPicker ? (
                <View>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Иконка мечты</Text>
                  </View>
                  <Text style={styles.modalLabel}>Цвет</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorScroll}>
                    {COLORS.map((color) => (
                      <TouchableOpacity key={color} style={[styles.colorCircle, { backgroundColor: color }, selectedColor === color && styles.selectedColorCircle]} onPress={() => { Haptics.selectionAsync(); setSelectedColor(color); }}>
                        {selectedColor === color && <MaterialCommunityIcons name="check" size={16} color="#FFF" />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.modalLabel}>Иконка</Text>
                  <View style={styles.iconGrid}>
                    {ICONS.map((icon) => (
                      <TouchableOpacity key={icon} style={[styles.optionCircle, selectedIcon === icon && { borderColor: selectedColor, backgroundColor: selectedColor + '1A' }]} onPress={() => { Haptics.selectionAsync(); setSelectedIcon(icon); }}>
                        <MaterialCommunityIcons name={icon as any} size={26} color={selectedIcon === icon ? selectedColor : '#888'} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity style={styles.saveBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowIconPicker(false); }}>
                    <Text style={styles.saveBtnText}>Готово</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{editingId ? 'Редактирование' : 'Новое желание'}</Text>
                  </View>
                  <View style={styles.compactRow}>
                    <TouchableOpacity style={styles.imagePickerBox} onPress={pickImage} activeOpacity={0.8}>
                      {newImageUrl ? <Image source={{ uri: newImageUrl }} style={styles.pickedImage} /> : <MaterialCommunityIcons name="camera-plus-outline" size={32} color="#A0A0A0" />}
                    </TouchableOpacity>
                    <View style={styles.inputsColumn}>
                      <View style={styles.inputWrapper}>
                        <TextInput style={[styles.inputMinimal, { marginBottom: 8 }]} placeholder="Название" placeholderTextColor="#AAA" value={newTitle} onChangeText={setNewTitle} />
                        {!newTitle && <Text style={styles.requiredAsterisk}>*</Text>}
                      </View>
                      <View style={styles.inputWrapper}>
                        <TextInput style={styles.inputMinimal} placeholder="Цена (₽)" placeholderTextColor="#AAA" keyboardType="numeric" value={newPriceRub} onChangeText={setNewPriceRub} />
                        {!newPriceRub && <Text style={styles.requiredAsterisk}>*</Text>}
                      </View>
                    </View>
                  </View>
                  <View style={styles.compactRow}>
                    <View style={[styles.inputsColumn, { marginRight: 12 }]}>
                      <TextInput style={[styles.inputMinimal, { marginBottom: 8 }]} placeholder="Ссылка (URL)" placeholderTextColor="#AAA" value={newLink} onChangeText={setNewLink} />
                      <TextInput style={styles.inputMinimal} placeholder="Описание" placeholderTextColor="#AAA" value={newDesc} onChangeText={setNewDesc} />
                    </View>
                    <TouchableOpacity style={[styles.imagePickerBox, { marginRight: 0 }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowIconPicker(true); }} activeOpacity={0.8}>
                      <View style={[styles.smallIconWrapper, { backgroundColor: selectedColor }]}>
                        <MaterialCommunityIcons name={selectedIcon as any} size={28} color="#FFF" />
                      </View>
                      <Text style={styles.iconSelectorTextSub}>Изменить</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveItem} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Сохранить</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', marginLeft: -8 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A' },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#EFEFEF', borderRadius: 12, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#888' },
  segmentTextActive: { color: '#1A1A1A' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
  instaCard: { width: '100%', marginBottom: 30 },
  instaCardInactive: { opacity: 0.6 },
  instaImageWrapper: { width: '100%', aspectRatio: 1, borderRadius: 24, backgroundColor: '#EFEFEF', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  instaImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  instaPlaceholderGift: { width: '100%', height: '100%', backgroundColor: '#FFF5F0', justifyContent: 'center', alignItems: 'center' },
  purchasedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  purchasedText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 10 },
  deleteCrossBtn: { position: 'absolute', top: 15, right: 15, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  instaFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingHorizontal: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  instaTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A', flexShrink: 1 },
  priceBadgeActive: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFD166', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12 },
  inputPrice: { fontWeight: '900', fontSize: 15, color: '#1A1A1A' },
  emptyStateCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyStateTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 5, textAlign: 'center' },
  emptyStateDesc: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 20 },
  sectionHeadingSmall: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 5, marginLeft: 5 },
  userPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingLeft: 15, paddingRight: 5, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#EFEFEF', marginRight: 10 },
  userPillText: { fontWeight: 'bold', marginRight: 10, color: '#1A1A1A' },
  addUserBtn: { backgroundColor: '#E07A5F', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  addedUserBtn: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  floatingWideBtnWrapper: { position: 'absolute', bottom: 30, left: 20, right: 20, zIndex: 10 },
  floatingWideBtn: { flexDirection: 'row', width: '100%', backgroundColor: '#E07A5F', borderRadius: 20, paddingVertical: 18, justifyContent: 'center', alignItems: 'center', shadowColor: '#E07A5F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  floatingWideBtnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  matePill: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#EFEFEF', borderRadius: 20, marginRight: 10 },
  matePillActive: { backgroundColor: '#1A1A1A' },
  matePillText: { fontSize: 15, fontWeight: '600', color: '#888' },
  matePillTextActive: { color: '#FFF' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 12, borderWidth: 1, borderColor: '#EFEFEF' },
  searchInput: { flex: 1, fontSize: 16, color: '#1A1A1A' },
  toastContainer: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#3A3A3C', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 24, zIndex: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 10 },
  toastText: { color: '#FFF', fontSize: 15, fontWeight: 'bold', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
  modalContent: { backgroundColor: '#FFF', width: '100%', borderRadius: 32, padding: 25, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  dragHandleArea: { width: '100%', alignItems: 'center', paddingBottom: 15 },
  dragHandle: { width: 50, height: 5, borderRadius: 3, backgroundColor: '#CCC' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A' },
  compactRow: { flexDirection: 'row', marginBottom: 12 },
  imagePickerBox: { width: 100, height: 100, borderRadius: 20, backgroundColor: '#F4F5F7', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginRight: 12, borderWidth: 1, borderColor: '#EFEFEF' },
  pickedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  inputsColumn: { flex: 1, justifyContent: 'space-between' },
  smallIconWrapper: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  iconSelectorTextSub: { fontSize: 12, fontWeight: '600', color: '#888' },
  inputWrapper: { position: 'relative' },
  inputMinimal: { backgroundColor: '#F8F9FA', borderRadius: 16, paddingHorizontal: 16, height: 46, fontSize: 15, color: '#1A1A1A', borderWidth: 1, borderColor: '#F0F0F0' },
  requiredAsterisk: { position: 'absolute', top: 12, right: 15, color: '#FF3B30', fontSize: 18, fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#3A3A3C', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  colorScroll: { paddingBottom: 20 },
  colorCircle: { width: 48, height: 48, borderRadius: 16, marginRight: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'transparent' },
  selectedColorCircle: { borderColor: '#CCC' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  optionCircle: { width: '18%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#F8F9FA', borderWidth: 2, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center', marginBottom: '2%' },
  modalLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 10 },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  actionCard: { backgroundColor: '#FFF', width: '100%', borderRadius: 32, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  actionIconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  actionTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A', marginBottom: 10, textAlign: 'center' },
  actionDesc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 25 },
  lockedText: { color: '#FF3B30', fontSize: 14, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  actionRow: { flexDirection: 'row', width: '100%', gap: 10 },
  cancelActionBtn: { paddingVertical: 16, borderRadius: 16, backgroundColor: '#F0F0F0', alignItems: 'center' },
  cancelActionBtnText: { fontSize: 16, fontWeight: 'bold', color: '#888' },
  confirmActionBtn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmActionBtnText: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
});
