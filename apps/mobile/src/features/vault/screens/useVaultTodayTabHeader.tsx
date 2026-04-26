import {useFocusEffect, useIsFocused} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';
import {Text} from '@gluestack-ui/themed';
import {useCallback, useLayoutEffect} from 'react';
import {TouchableOpacity} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {safeNavigationState} from '../../../navigation/safeNavigationState';
import type {VaultStackParamList} from '../../../navigation/types';

type VaultTodayNavigation = StackNavigationProp<VaultStackParamList, 'Vault'>;

type UseVaultTodayTabHeaderParams = {
  headerTitle: string;
  hubsLength: number;
  navigation: VaultTodayNavigation;
  openHubPicker: () => void;
  styles: {
    headerIconButton: object;
    headerTitleButton: object;
    headerTitlePlain: object;
    headerTitleText: object;
  };
};

/** Keeps the Today tab stack header in sync with hub title + search affordance. */
export function useVaultTodayTabHeader({
  headerTitle,
  hubsLength,
  navigation,
  openHubPicker,
  styles,
}: UseVaultTodayTabHeaderParams): void {
  const isScreenFocused = useIsFocused();

  const isVaultHubTopRoute = useCallback((): boolean => {
    const state = safeNavigationState(navigation);
    if (!state?.routes?.length) {
      return false;
    }
    const activeRoute = state.routes[state.index ?? 0];
    return activeRoute?.name === 'Vault';
  }, [navigation]);

  const shouldShowTodayTabHeader = isVaultHubTopRoute() && isScreenFocused;

  const renderSearchHeaderRight = useCallback(
    () => (
      <TouchableOpacity
        accessibilityLabel="Search vault"
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => navigation.navigate('VaultSearch')}
        style={styles.headerIconButton}>
        <MaterialIcons color="#ffffff" name="search" size={24} />
      </TouchableOpacity>
    ),
    [navigation, styles.headerIconButton],
  );

  const applyTodayTabHeader = useCallback(() => {
    if (!shouldShowTodayTabHeader) {
      return;
    }
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }
    const titleEl =
      hubsLength > 1 ? (
        <TouchableOpacity
          accessibilityLabel="Choose Today hub"
          hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
          onPress={openHubPicker}
          style={styles.headerTitleButton}>
          <Text style={styles.headerTitleText}>{headerTitle}</Text>
          <MaterialIcons color="#ffffff" name="arrow-drop-down" size={22} />
        </TouchableOpacity>
      ) : (
        <Text style={styles.headerTitlePlain}>{headerTitle}</Text>
      );
    tabNavigation.setOptions({
      headerShown: true,
      headerLeft: undefined,
      headerRight: renderSearchHeaderRight,
      headerTitle: () => titleEl,
    });
  }, [
    shouldShowTodayTabHeader,
    headerTitle,
    hubsLength,
    navigation,
    openHubPicker,
    renderSearchHeaderRight,
    styles.headerTitleButton,
    styles.headerTitlePlain,
    styles.headerTitleText,
  ]);

  useLayoutEffect(() => {
    applyTodayTabHeader();
  }, [applyTodayTabHeader]);

  useFocusEffect(
    useCallback(() => {
      applyTodayTabHeader();
      const frameId = requestAnimationFrame(() => {
        applyTodayTabHeader();
      });
      const timeoutId = setTimeout(() => {
        applyTodayTabHeader();
      }, 0);
      return () => {
        cancelAnimationFrame(frameId);
        clearTimeout(timeoutId);
      };
    }, [applyTodayTabHeader]),
  );
}
