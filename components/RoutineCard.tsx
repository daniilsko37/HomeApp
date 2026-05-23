import { FontAwesome } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface RoutineCardProps {
  title: string;
  badgePoints: number;
  descriptionLines: string[];
  imageSource: any;
  onPress: () => void;
  badgeColor?: string; 
  isOverdue?: boolean; // 🪄 Добавили флаг просрочки
}

export const RoutineCard: React.FC<RoutineCardProps> = ({
  title,
  badgePoints,
  descriptionLines,
  imageSource,
  onPress,
  badgeColor = '#2ECC71',
  isOverdue = false, // По умолчанию задача не просрочена
}) => {
  
  // Если задача просрочена, принудительно делаем цвет красным
  const finalBadgeColor = isOverdue ? '#FF3B30' : badgeColor;
  
  const isLightBadge = finalBadgeColor === '#FFD166';
  const iconAndTextColor = isLightBadge ? '#333333' : '#FFFFFF';

  return (
    <TouchableOpacity style={[styles.card, { borderLeftColor: finalBadgeColor }]} onPress={onPress}>
      <View style={styles.leftColumn}>
        
        {/* Контейнер для плашек, чтобы они стояли в ряд */}
        <View style={styles.badgesRow}>
          <View style={[styles.badge, { backgroundColor: finalBadgeColor }]}>
            <FontAwesome name="star" size={14} color={iconAndTextColor} />
            <Text style={[styles.badgeText, { color: iconAndTextColor }]}>{badgePoints}</Text>
          </View>

          {/* Дополнительная плашка "ШТРАФ", появляется только если isOverdue === true */}
          {isOverdue && (
            <View style={styles.penaltyBadge}>
              <FontAwesome name="warning" size={12} color="#FFFFFF" />
              <Text style={styles.penaltyText}>ШТРАФ</Text>
            </View>
          )}
        </View>

        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <View style={styles.divider} />
        <View style={styles.descContainer}>
          {descriptionLines.map((line, index) => (
            <Text key={index} style={styles.descriptionLine} numberOfLines={2}>
              {line}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.rightColumn}>
        {imageSource ? <Image source={imageSource} style={styles.image} /> : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    padding: 16, 
    width: '100%', 
    aspectRatio: 1100 / 520, 
    marginBottom: 15, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 4, 
    elevation: 2,
    borderLeftWidth: 6,
  },
  leftColumn: { width: '60%', height: '100%', justifyContent: 'flex-start', alignItems: 'flex-start' },
  rightColumn: { flex: 1, height: '100%', alignItems: 'flex-end', justifyContent: 'center' },
  
  // Обновленные стили для ряда плашек
  badgesRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, marginRight: 6 },
  badgeText: { fontWeight: 'bold', fontSize: 16, marginLeft: 4 },
  
  // Стили для плашки ШТРАФ
  penaltyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF3B30', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  penaltyText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12, marginLeft: 4 },

  title: { fontSize: 22, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  divider: { width: '100%', height: 1, backgroundColor: '#000', marginBottom: 8 },
  descContainer: { flex: 1, width: '100%' },
  descriptionLine: { fontSize: 10, color: '#333', marginBottom: 2 },
  image: { width: '95%', height: '95%', resizeMode: 'contain' } 
});