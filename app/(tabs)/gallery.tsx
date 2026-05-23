import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function GalleryScreen() {
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<any[]>([]);

  const fetchGallery = async () => {
    try {
      setLoading(true);
      const room = await AsyncStorage.getItem('room_id');
      if (!room) return;

      const { data, error } = await supabase
        .from('task_history')
        .select('*')
        .eq('room_id', room)
        .not('proof_image_url', 'is', null)
        .order('completed_at', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (e) {
      console.error('Ошибка галереи:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchGallery(); }, []));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Галерея</Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {loading ? (
          <ActivityIndicator color="#4A4A4A" style={{ marginTop: 20 }} />
        ) : photos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <FontAwesome name="image" size={50} color="#CCC" />
            <Text style={styles.emptyText}>Тут пока пусто...{'\n'}Завершайте задачи с фотоотчетом!</Text>
          </View>
        ) : (
          photos.map((item) => (
            <View key={item.id} style={styles.cardOuter}>
              <View style={styles.card}>
                <Image
                  source={{ uri: item.proof_image_url }}
                  style={styles.image}
                />
                <View style={styles.infoRow}>
                  <View style={styles.iconBox}>
                    <FontAwesome name="camera" size={16} color="#888" />
                  </View>
                  <View style={styles.infoTexts}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {item.task_title}
                    </Text>
                    <Text style={styles.userName} numberOfLines={1}>
                      {item.user_name}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
  },
  cardOuter: {
    width: '50%',
    padding: 5,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#E5E5E5',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#EAEAEA',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    minHeight: 52,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoTexts: {
    flex: 1,
    minWidth: 0,
  },
  taskTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  userName: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
    width: '100%',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 15,
    lineHeight: 20,
  },
});