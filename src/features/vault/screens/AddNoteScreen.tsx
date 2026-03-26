import {useHeaderHeight} from '@react-navigation/elements';
import {useFocusEffect} from '@react-navigation/native';
import {StackScreenProps} from '@react-navigation/stack';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Box, Pressable, Text, useColorMode} from '@gluestack-ui/themed';
import {
  ActivityIndicator,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {buildInboxMarkdownFromCompose, parseComposeInput} from '../../../core/vault/vaultComposeNote';
import {VaultStackParamList} from '../../../navigation/types';
import {useSaveInboxMarkdownNote} from '../../inbox/hooks/useSaveInboxMarkdownNote';

type AddNoteScreenProps = StackScreenProps<VaultStackParamList, 'AddNote'>;

export function AddNoteScreen({navigation}: AddNoteScreenProps) {
  const [composeInput, setComposeInput] = useState('');
  const inputRef = useRef<TextInput>(null);
  const {isSaving, save, setStatusText, statusText} = useSaveInboxMarkdownNote();
  const headerHeight = useHeaderHeight();
  const colorMode = useColorMode();
  const insets = useSafeAreaInsets();
  const inputTextColor = colorMode === 'dark' ? '#f5f5f5' : '#212121';
  const placeholderColor = colorMode === 'dark' ? '#8a8a8a' : '#888888';

  useEffect(() => {
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    const showVaultTabHeader = () => {
      tabNavigation.setOptions({
        headerShown: true,
        headerLeft: undefined,
        headerRight: undefined,
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
        title: 'New note',
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
      showVaultTabHeader();
    });

    const unsubscribeBeforeRemove = navigation.addListener('beforeRemove', () => {
      hideComposeStackHeader();
      showVaultTabHeader();
    });

    return () => {
      unsubscribeTransitionEnd();
      unsubscribeTransitionStart();
      unsubscribeBeforeRemove();
      hideComposeStackHeader();
      showVaultTabHeader();
    };
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        inputRef.current?.focus();
      });
      return () => task.cancel();
    }, []),
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
      style={styles.keyboardAvoiding}>
      <Box style={styles.container}>
        <TextInput
          ref={inputRef}
          autoCapitalize="sentences"
          autoCorrect
          editable={!isSaving}
          multiline
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
      </Box>
    </KeyboardAvoidingView>
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
  container: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
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
});
