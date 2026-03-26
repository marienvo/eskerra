import {StackScreenProps} from '@react-navigation/stack';
import {useEffect, useState} from 'react';
import {Box, Pressable, Text, useColorMode} from '@gluestack-ui/themed';
import {Keyboard, StyleSheet, TextInput} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {buildInboxMarkdownFromCompose, parseComposeInput} from '../../../core/vault/vaultComposeNote';
import {VaultStackParamList} from '../../../navigation/types';
import {useSaveInboxMarkdownNote} from '../../inbox/hooks/useSaveInboxMarkdownNote';

type AddNoteScreenProps = StackScreenProps<VaultStackParamList, 'AddNote'>;

export function AddNoteScreen({navigation}: AddNoteScreenProps) {
  const [composeInput, setComposeInput] = useState('');
  const {isSaving, save, setStatusText, statusText} = useSaveInboxMarkdownNote();
  const colorMode = useColorMode();
  const insets = useSafeAreaInsets();
  const dividerColor = colorMode === 'dark' ? '#4f4f4f' : '#d6d6d6';
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
        headerTitle: 'Vault',
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

  return (
    <Box style={styles.container}>
      <TextInput
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
            borderTopColor: dividerColor,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}>
        <Pressable
          disabled={isSaving}
          onPress={() => {
            handleSave().catch(() => undefined);
          }}
          style={styles.saveButton}>
          <MaterialIcons color="#ffffff" name="save-alt" size={24} />
        </Pressable>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  container: {
    flex: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 40,
  },
  status: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    textAlign: 'left',
  },
});
