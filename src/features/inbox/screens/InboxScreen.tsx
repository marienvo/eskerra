import {useState} from 'react';
import {
  Box,
  Button,
  ButtonText,
  Input,
  InputField,
  Text,
} from '@gluestack-ui/themed';
import {Keyboard, StyleSheet} from 'react-native';

import {useSaveInboxMarkdownNote} from '../hooks/useSaveInboxMarkdownNote';

export function InboxScreen() {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const {isSaving, save, statusText} = useSaveInboxMarkdownNote();

  const handleSave = async () => {
    Keyboard.dismiss();
    const didSave = await save(title, content, {
      onSaved: () => {
        setTitle('');
        setContent('');
      },
    });
    if (!didSave) {
      return;
    }
  };

  return (
    <Box style={styles.container}>
      <Text style={styles.description}>Capture an idea and store it as markdown.</Text>
      <Input style={styles.input}>
        <InputField
          editable={!isSaving}
          onChangeText={setTitle}
          placeholder="Title"
          value={title}
        />
      </Input>
      <Input style={[styles.input, styles.textArea]}>
        <InputField
          editable={!isSaving}
          multiline
          onChangeText={setContent}
          placeholder="Write your idea..."
          textAlignVertical="top"
          value={content}
        />
      </Input>
      <Box style={styles.buttonRow}>
        <Button
          action="primary"
          borderRadius="$full"
          isDisabled={isSaving}
          onPress={handleSave}
          size="md"
          variant="solid">
          <ButtonText>{isSaving ? 'Saving...' : 'Save to Vault'}</ButtonText>
        </Button>
      </Box>
      {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
    </Box>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    marginTop: 16,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  description: {
    marginTop: 8,
  },
  input: {
    borderRadius: 12,
    marginTop: 12,
    paddingHorizontal: 2,
  },
  status: {
    marginTop: 16,
    textAlign: 'center',
  },
  textArea: {
    minHeight: 140,
  },
});
