import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function ShopScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userPoints, setUserPoints] = useState(0);
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  
  const [shopItems, setShopItems] = useState<any[]>([]);
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);

  const [selectedItemForPurchase, setSelectedItemForPurchase] = useState<any | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastFade = useRef(new Animated.Value(0)).current;
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    Animated.timing(toastFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => {
      Animated.timing(toastFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setToastMessage(null);
      });
    }, 2000);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const name = await AsyncStorage.getItem('user_name');
      const room = await AsyncStorage.getItem('room_id');
      if (!name || !room) return;
      
      setUserName(name);
      setRoomId(room);

      const { data: profileData } = await supabase.from('profiles').select('points').eq('name', name).eq('room_id', room).single();
      if (profileData) setUserPoints(profileData.points || 0);

      const { data: itemsData } = await supabase.from('shop_items').select('*').eq('room_id', room).order('price', { ascending: true });
      if (itemsData) setShopItems(itemsData);

      const { data: wishData } = await supabase.from('wishlist_items')
        .select('*')
        .eq('room_id', room)
        .eq('user_name', name)
        .eq('is_purchased', false)
        .order('price', { ascending: true });
      if (wishData) setWishlistItems(wishData);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchData(); 
  }, [fetchData]);

  const handleItemPress = (item: any, type: 'shop' | 'wishlist') => {
    if (userPoints < item.price) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return showToast('Не хватает баллов');
    }
    Haptics.selectionAsync();
    setSelectedItemForPurchase({ ...item, type });
  };

  const confirmPurchase = async () => {
    const item = selectedItemForPurchase;
    if (!item) return;

    try {
      setSelectedItemForPurchase(null);
      setLoading(true);
      const newPoints = userPoints - item.price;

      await supabase.from('profiles').update({ points: newPoints }).eq('name', userName).eq('room_id', roomId);
      
      await supabase.from('shop_purchases').insert([{ room_id: roomId, user_name: userName, item_title: item.title, price: item.price }]);
      await supabase.from('task_history').insert([{ 
        user_name: userName, 
        room_id: roomId, 
        task_title: `Куплено: ${item.title}`, 
        points: 0, 
        penalty: item.price, 
        image_url: 'shop' 
      }]);

      if (item.type === 'wishlist') {
        await supabase.from('wishlist_items').update({ is_purchased: true }).eq('id', item.id);
      }

      await fetch('https://pqkszqabvtxxwnsdznjm.supabase.co/functions/v1/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'prize',
          room_id: roomId,
          buyer_name: userName,
          item_title: item.title,
        }),
      });

      setUserPoints(newPoints);
      fetchData(); 
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Успешно куплено!');
    } catch (e) {
      console.error(e);
      showToast('Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const renderRow = (item: any, type: 'shop' | 'wishlist') => {
    const canAfford = userPoints >= item.price;
    const defaultIcon = type === 'wishlist' ? 'heart' : 'star';
    const defaultColor = type === 'wishlist' ? '#D0021B' : '#1A1A1A';
    
    return (
      <TouchableOpacity 
        key={item.id} 
        style={[styles.rewardRow, !canAfford && styles.rewardRowDisabled]}
        onPress={() => handleItemPress(item, type)}
        activeOpacity={0.8}
      >
        <View style={[styles.iconWrapper, { backgroundColor: (item.color || defaultColor) + '1A' }]}>
          <MaterialCommunityIcons name={item.icon || defaultIcon} size={26} color={item.color || defaultColor} />
        </View>

        <View style={styles.rewardTextContainer}>
          <Text style={styles.rewardTitle} numberOfLines={2}>{item.title}</Text>
        </View>

        <View style={[styles.priceBadge, canAfford ? styles.priceBadgeActive : styles.priceBadgeLocked]}>
          <Text style={[styles.priceText, canAfford ? styles.priceTextActive : styles.priceTextLocked]}>
            {item.price}
          </Text>
          <MaterialCommunityIcons name="star" size={12} color={canAfford ? "#1A1A1A" : "#999"} style={{ marginLeft: 4 }} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={32} color="#1A1A1A" />
        </TouchableOpacity>
        
        <View style={styles.balancePill}>
          <Text style={styles.balancePillText}>{userPoints}</Text>
          <MaterialCommunityIcons name="star" size={16} color="#FFD166" style={{ marginLeft: 6 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Магазин</Text>
        <View style={styles.listContainer}>
          {shopItems.length === 0 && !loading ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="package-variant" size={48} color="#EFEFEF" style={{ marginBottom: 15 }} />
              <Text style={styles.emptyStateTitle}>Здесь пока пусто</Text>
            </View>
          ) : (
            shopItems.map((item) => renderRow(item, 'shop'))
          )}
        </View>

        {wishlistItems.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Мои мечты</Text>
            <View style={styles.listContainer}>
              {wishlistItems.map((item) => renderRow(item, 'wishlist'))}
            </View>
          </>
        )}
      </ScrollView>

      {toastMessage && (
        <Animated.View style={[styles.toastContainer, { opacity: toastFade }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      <Modal visible={!!selectedItemForPurchase} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSelectedItemForPurchase(null)} />
          <View style={styles.purchaseCard}>
            <View style={[styles.purchaseIconCircle, { backgroundColor: (selectedItemForPurchase?.color || '#FFD166') + '2A' }]}>
              <MaterialCommunityIcons name={selectedItemForPurchase?.icon || 'star-four-points'} size={42} color={selectedItemForPurchase?.color || '#FFD166'} />
            </View>
            <Text style={styles.purchaseTitle}>Покупка</Text>
            <Text style={styles.purchaseDesc}>Потратить баллы на{'\n'}<Text style={{ fontWeight: 'bold', color: '#1A1A1A' }}>{selectedItemForPurchase?.title}</Text>?</Text>
            <View style={styles.purchasePricePill}>
              <Text style={styles.purchasePriceText}>{selectedItemForPurchase?.price}</Text>
              <MaterialCommunityIcons name="star" size={16} color="#1A1A1A" style={{ marginLeft: 4 }} />
            </View>
            <View style={styles.purchaseActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectedItemForPurchase(null)}>
                <Text style={styles.cancelBtnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.buyBtn} onPress={confirmPurchase}>
                <Text style={styles.buyBtnText}>Купить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading && !selectedItemForPurchase && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color="#1A1A1A" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', marginLeft: -8 },
  balancePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#EFEFEF' },
  balancePillText: { fontSize: 16, fontWeight: '900', color: '#1A1A1A' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 26, fontWeight: '900', color: '#1A1A1A', marginBottom: 15 },
  listContainer: { marginBottom: 15 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 24, marginBottom: 12, borderWidth: 1, borderColor: '#F4F4F4', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 5, elevation: 1 },
  rewardRowDisabled: { opacity: 0.5 },
  iconWrapper: { width: 54, height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  rewardTextContainer: { flex: 1, paddingRight: 10, justifyContent: 'center' },
  rewardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A' },
  priceBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  priceBadgeActive: { backgroundColor: '#FFD166' },
  priceBadgeLocked: { backgroundColor: '#F0F0F0' },
  priceText: { fontWeight: '900', fontSize: 14 },
  priceTextActive: { color: '#1A1A1A' },
  priceTextLocked: { color: '#999' },
  emptyState: { backgroundColor: '#FFF', borderRadius: 24, padding: 30, alignItems: 'center', marginTop: 10 },
  emptyStateTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 10 },
  toastContainer: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#3A3A3C', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 24, zIndex: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 10 },
  toastText: { color: '#FFF', fontSize: 15, fontWeight: 'bold', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  purchaseCard: { backgroundColor: '#FFF', width: '100%', borderRadius: 32, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  purchaseIconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  purchaseTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A', marginBottom: 10 },
  purchaseDesc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  purchasePricePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFD166', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, marginBottom: 25 },
  purchasePriceText: { fontSize: 18, fontWeight: '900', color: '#1A1A1A' },
  purchaseActionRow: { flexDirection: 'row', width: '100%', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#F0F0F0', alignItems: 'center' },
  cancelBtnText: { fontSize: 16, fontWeight: 'bold', color: '#888' },
  buyBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#1A1A1A', alignItems: 'center' },
  buyBtnText: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
  loaderOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
});
