import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

interface SubPageHeaderProps {
  title: string | React.ReactNode;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  numberOfLines?: number;
}

export function SubPageHeader({
  title,
  subtitle,
  right,
  onBack,
  numberOfLines,
}: SubPageHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 8,
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        },
      ]}
    >
      <Pressable
        onPress={onBack ?? (() => router.back())}
        hitSlop={8}
        style={styles.backBtn}
      >
        <MaterialCommunityIcons name="chevron-left" size={24} color={colors.foreground} />
      </Pressable>

      <View style={styles.titleWrap}>
        <Text
          style={[styles.title, { color: colors.foreground }]}
          numberOfLines={numberOfLines}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? (
        <View style={styles.rightSlot}>{right}</View>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spacer: {
    width: 36,
  },
});
