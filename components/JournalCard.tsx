import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface JournalCardProps {
  title: string;
  userName: string;
  imageSource?: any; 
  onPress?: () => void;
  onCancel?: () => void;
  type?: 'my' | 'waiting' | 'confirm'; 
  isOverdue?: boolean; 
}

export function JournalCard({ title, userName, imageSource, onPress, onCancel, type, isOverdue }: JournalCardProps) {
  const showPenalty = isOverdue && type === 'my';

  return (
    <View style={[styles.card, showPenalty && styles.cardOverdue]}>
      <TouchableOpacity 
        style={styles.mainContent} 
        onPress={onPress}
        disabled={type === 'waiting'} 
        activeOpacity={0.7}
      >
        <View style={styles.iconContainer}>
          {imageSource ? (
            <Image source={imageSource} style={styles.icon} />
          ) : null}
        </View>
        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, showPenalty && { color: '#FF3B30' }]} numberOfLines={1}>{title}</Text>
            {showPenalty && (
              <View style={styles.penaltyBadge}>
                <Text style={styles.penaltyText}>ШТРАФ</Text>
              </View>
            )}
          </View>
          <Text style={styles.userName}>
            {type === 'confirm' ? `Ждет твоей оценки` : type === 'waiting' ? 'Ждет проверки...' : userName}
          </Text>
        </View>
      </TouchableOpacity>

      {type === 'my' && (
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.6}>
          <View style={styles.cancelIconWrapper}>
            <FontAwesome name="times" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>
      )}

      {type === 'confirm' && (
        <View style={styles.unreadDot} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    borderRadius: 16, // Сделали более круглыми
    padding: 12, 
    alignItems: 'center', 
    marginBottom: 12, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.04, 
    shadowRadius: 4, 
    elevation: 1,
    borderWidth: 1,
    borderColor: '#F0F0F0' // Тонкая граница для чистоты
  },
  cardOverdue: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FFD1D1',
  },
  mainContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  iconContainer: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#F5F5F5', overflow: 'hidden' },
  icon: { width: '100%', height: '100%', resizeMode: 'cover' },
  textContainer: { marginLeft: 14, justifyContent: 'center', flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', flexShrink: 1 },
  penaltyBadge: { backgroundColor: '#FF3B30', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, marginLeft: 8 },
  penaltyText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  userName: { fontSize: 13, color: '#888' },
  cancelButton: { padding: 5, marginLeft: 10, justifyContent: 'center', alignItems: 'center' },
  cancelIconWrapper: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30', marginLeft: 10, marginRight: 5 }
});