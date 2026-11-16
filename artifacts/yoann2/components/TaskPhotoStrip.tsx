import { Image } from 'expo-image';
import React, { memo } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { resolvePhotoRef } from '@/utils/library/catalogue';

type Props = {
  uris: string[];
  size: number;
  onOpen: (uris: string[], index: number) => void;
};

/** Mount only the visible thumbnails; opening one still uses the original URI. */
export const TaskPhotoStrip = memo(function TaskPhotoStrip({ uris, size, onOpen }: Props) {
  return (
    <FlatList
      testID="task-photo-strip"
      horizontal
      data={uris}
      scrollEnabled={uris.length > 0}
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={3}
      updateCellsBatchingPeriod={32}
      keyExtractor={(uri, index) => `${uri}:${index}`}
      getItemLayout={(_, index) => ({ length: size + 6, offset: (size + 6) * index, index })}
      renderItem={({ item: uri, index }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir la photo ${index + 1} sur ${uris.length}`}
          onPress={event => { event.stopPropagation(); onOpen(uris, index); }}
        >
          <Image
            source={{ uri: resolvePhotoRef(uri) }}
            style={{ width: size, height: size, borderRadius: 8, marginRight: 6 }}
            contentFit="cover"
            allowDownscaling
            enforceEarlyResizing
            cachePolicy="memory-disk"
            recyclingKey={uri}
            transition={0}
          />
        </Pressable>
      )}
    />
  );
});

const styles = StyleSheet.create({ strip: { marginTop: 8 } });
