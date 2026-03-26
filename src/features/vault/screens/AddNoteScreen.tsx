import {useFocusEffect} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';
import {StackScreenProps} from '@react-navigation/stack';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Box, Pressable, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {
  ActivityIndicator,
  InteractionManager,
  Keyboard,
  Platform,
  StyleSheet,
  TextInput,
} from 'react-native';
import {KeyboardStickyView} from 'react-native-keyboard-controller';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {
  buildInboxMarkdownFromCompose,
  inboxMarkdownFileToComposeInput,
  parseComposeInput,
} from '../../../core/vault/vaultComposeNote';
import {VaultStackParamList} from '../../../navigation/types';
import {useSaveInboxMarkdownNote} from '../../inbox/hooks/useSaveInboxMarkdownNote';
import {useNotes} from '../hooks/useNotes';

type AddNoteScreenProps = StackScreenProps<VaultStackParamList, 'AddNote'>;

/** True when the screen under AddNote in the stack is Vault (back goes to the inbox list). */
function isPoppingFromAddNoteToVault(
  stackNavigation: StackNavigationProp<VaultStackParamList, 'AddNote'>,
): boolean {
  const state = stackNavigation.getState();
  const idx = state.index;
  if (idx < 1) {
    return false;
  }
  return state.routes[idx - 1]?.name === 'Vault';
}

/** After AddNote unmounts, the stack focus is already the screen we popped to. */
function isVaultStackFocusedOnVaultList(
  stackNavigation: StackNavigationProp<VaultStackParamList, 'AddNote'>,
): boolean {
  const state = stackNavigation.getState();
  return state.routes[state.index]?.name === 'Vault';
}

export function AddNoteScreen({navigation, route}: AddNoteScreenProps) {
  const editParams = route.params;
  const isEdit = Boolean(editParams?.noteUri);
  const [composeInput, setComposeInput] = useState('');
  const [isLoadingEdit, setIsLoadingEdit] = useState(isEdit);
  const inputRef = useRef<TextInput>(null);
  const {isSaving, save, setStatusText, statusText} = useSaveInboxMarkdownNote();
  const {read} = useNotes();
  const colorMode = useColorMode();
  const insets = useSafeAreaInsets();
  const inputTextColor = colorMode === 'dark' ? '#f5f5f5' : '#212121';
  const placeholderColor = colorMode === 'dark' ? '#8a8a8a' : '#888888';

  useEffect(() => {
    if (!editParams?.noteUri) {
      return;
    }

    let isActive = true;
    setIsLoadingEdit(true);

    read(editParams.noteUri)
      .then(note => {
        if (!isActive) {
          return;
        }
        setComposeInput(inboxMarkdownFileToComposeInput(note.content));
        setIsLoadingEdit(false);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setStatusText('Could not load this note.');
        setIsLoadingEdit(false);
      });

    return () => {
      isActive = false;
    };
  }, [editParams?.noteUri, read, setStatusText]);

  useEffect(() => {
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    const showVaultTabHeader = () => {
      tabNavigation.setOptions({
        headerShown: true,
        headerTitle: 'Inbox',
      });
    };

    const hideVaultTabHeader = () => {
      tabNavigation.setOptions({
        headerShown: false,
      });
    };

    const showComposeStackHeader = () => {
      navigation.setOptions({
        headerShown: true,
        title: isEdit ? 'Edit note' : 'New note',
      });
    };

    const hideComposeStackHeader = () => {
      navigation.setOptions({
        headerShown: false,
      });
    };

    const unsubscribeTransitionEnd = navigation.addListener('transitionEnd', event => {
      if (event.data.closing) {
        return;
      }
      hideVaultTabHeader();
      showComposeStackHeader();
    });

    const unsubscribeTransitionStart = navigation.addListener('transitionStart', event => {
      if (!event.data.closing) {
        return;
      }
      hideComposeStackHeader();
      if (isPoppingFromAddNoteToVault(navigation)) {
        showVaultTabHeader();
      } else {
        hideVaultTabHeader();
      }
    });

    const unsubscribeBeforeRemove = navigation.addListener('beforeRemove', () => {
      hideComposeStackHeader();
      if (isPoppingFromAddNoteToVault(navigation)) {
        showVaultTabHeader();
      } else {
        hideVaultTabHeader();
      }
    });

    return () => {
      unsubscribeTransitionEnd();
      unsubscribeTransitionStart();
      unsubscribeBeforeRemove();
      hideComposeStackHeader();
      if (isVaultStackFocusedOnVaultList(navigation)) {
        showVaultTabHeader();
      }
    };
  }, [isEdit, navigation]);

  useFocusEffect(
    useCallback(() => {
      if (isLoadingEdit) {
        return undefined;
      }

      let cancelled = false;
      const focusInput = () => {
        if (!cancelled) {
          inputRef.current?.focus();
        }
      };

      if (Platform.OS === 'android') {
        let delayedFocusId: ReturnType<typeof setTimeout> | undefined;
        const task = InteractionManager.runAfterInteractions(() => {
          delayedFocusId = setTimeout(focusInput, 250);
        });
        return () => {
          cancelled = true;
          task.cancel();
          if (delayedFocusId !== undefined) {
            clearTimeout(delayedFocusId);
          }
        };
      }

      const task = InteractionManager.runAfterInteractions(focusInput);
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [isLoadingEdit]),
  );

  const handleSave = async () => {
    Keyboard.dismiss();
    const {bodyAfterBlank, titleLine} = parseComposeInput(composeInput);
    if (!titleLine) {
      setStatusText('Title is required.');
      return;
    }

    const markdownBody = buildInboxMarkdownFromCompose(titleLine, bodyAfterBlank);
    const didSave = await save(titleLine, markdownBody, {
      noteUri: editParams?.noteUri,
      onSaved: () => {
        navigation.goBack();
      },
    });
    if (!didSave) {
      return;
    }
  };

  const onPressSave = () => {
    handleSave().catch(() => undefined);
  };

  const onPressCancel = () => {
    Keyboard.dismiss();
    navigation.goBack();
  };

  return (
    <Box style={styles.screenRoot}>
      {isLoadingEdit ? (
        <Box alignItems="center" flex={1} justifyContent="center">
          <Spinner style={styles.editLoadSpinner} />
        </Box>
      ) : (
        <>
          <TextInput
            ref={inputRef}
            autoCapitalize="sentences"
            autoCorrect
            editable={!isSaving}
            multiline
            showSoftInputOnFocus
            onChangeText={nextValue => {
              setComposeInput(nextValue);
              if (statusText) {
                setStatusText(null);
              }
            }}
            placeholder="First line is title (H1)..."
            placeholderTextColor={placeholderColor}
            style={[styles.input, {color: inputTextColor}]}
            textAlignVertical="top"
            value={composeInput}
          />
          {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
          {/* Pins the action row to the keyboard; optional offset={{ closed, opened }} if a device needs a px tweak. */}
          <KeyboardStickyView style={styles.stickyFooter}>
            <Box
              style={[
                styles.actionBar,
                {
                  paddingBottom: Math.max(insets.bottom, 8),
                },
              ]}>
              <Pressable
                accessibilityLabel="Cancel"
                accessibilityRole="button"
                disabled={isSaving}
                onPress={onPressCancel}
                style={styles.cancelButton}>
                <MaterialIcons color={inputTextColor} name="cancel" size={22} />
                <Text style={[styles.actionLabel, {color: inputTextColor}]}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={isSaving ? 'Saving note' : 'Save note'}
                accessibilityRole="button"
                disabled={isSaving}
                onPress={onPressSave}
                style={styles.saveButton}>
                {isSaving ? (
                  <>
                    <ActivityIndicator color={inputTextColor} size="small" />
                    <Text style={[styles.actionLabel, {color: inputTextColor}]}>Saving...</Text>
                  </>
                ) : (
                  <>
                    <MaterialIcons color={inputTextColor} name="save-alt" size={22} />
                    <Text style={[styles.actionLabel, {color: inputTextColor}]}>Save</Text>
                  </>
                )}
              </Pressable>
            </Box>
          </KeyboardStickyView>
        </>
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  screenRoot: {
    flex: 1,
  },
  stickyFooter: {
    alignSelf: 'stretch',
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 4,
  },
  saveButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 40,
    paddingHorizontal: 4,
  },
  status: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    textAlign: 'left',
  },
  editLoadSpinner: {
    marginVertical: 24,
  },
});
