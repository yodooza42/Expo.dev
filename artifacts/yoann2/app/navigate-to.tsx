import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SubPageHeader } from '@/components/SubPageHeader';

import type { KnownPlace } from '@/types/places';
import { getKnownPlaces } from '@/utils/placesStorage';
import { openNavigation } from '@/utils/navigationShortcuts';

const BG = '#121212';
const CARD = '#202020';
const TEXT = '#FFFFFF';
const MUTED = '#9E9E9E';
const GREEN = '#4CAF50';

interface PlaceItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export default function NavigateToPage() {
  const router = useRouter();
  const [items, setItems] = useState<PlaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const places = await getKnownPlaces();

      const placeItems: PlaceItem[] = places.map((p: KnownPlace) => ({
        id: p.id,
        name: p.name,
        address: p.address ?? `${p.lat}, ${p.lng}`,
        lat: p.lat,
        lng: p.lng,
      }));

      setItems(placeItems);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleWaze = useCallback(async (item: PlaceItem) => {
    await openNavigation(item.lat, item.lng);
  }, []);

  return (
    <View style={styles.container}>
      <SubPageHeader title="🧭 Naviguer vers" />

      {loading ? (
        <Text style={styles.empty}>Chargement...</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>Aucune adresse enregistrée</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons
                  name="map-marker"
                  size={18}
                  color="#F44336"
                />
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.address} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
              <Pressable
                style={styles.wazeBtn}
                onPress={() => handleWaze(item)}
                android_ripple={{ color: '#4CAF5044', borderless: true }}
              >
                <MaterialCommunityIcons
                  name="navigation"
                  size={18}
                  color={GREEN}
                />
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
    backgroundColor: BG,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT,
  },
  list: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F443361A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT,
  },
  address: {
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  wazeBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1A2A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    color: MUTED,
    marginTop: 40,
    fontSize: 14,
  },
});
