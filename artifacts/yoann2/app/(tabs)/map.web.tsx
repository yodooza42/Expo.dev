import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function MapScreenWeb() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🗺️</Text>
      <Text style={styles.title}>Carte GPS</Text>
      <Text style={styles.sub}>Disponible uniquement dans l'app Android installée</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  icon: { fontSize: 48 },
  title: { color: '#FFFFFF', fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  sub: { color: '#616161', fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 32 },
});
