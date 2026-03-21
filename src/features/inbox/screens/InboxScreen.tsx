import {useState} from 'react';
import {
  Box,
  Button,
  ButtonText,
  Input,
  InputField,
  Text,
} from '@gluestack-ui/themed';
import {StyleSheet} from 'react-native';

import {useNotes} from '../../vault/hooks/useNotes';

export function InboxScreen() {
  const {create} = useNotes();
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle) {
      setStatusText('Title is required.');
      return;
    }

    if (!trimmedContent) {
      setStatusText('Note content is required.');
      return;
    }

    setStatusText(null);
    setIsSaving(true);
    try {
      await create(trimmedTitle, trimmedContent);
      setTitle('');
      setContent('');
      setStatusText('Saved to Vault.');
    } catch (error) {
      const fallbackMessage = 'Could not save this note.';
      setStatusText(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box style={styles.container}>
      <Text style={styles.title}>Inbox</Text>
      <Text style={styles.description}>Capture an idea and store it as markdown.</Text>
      <Input style={styles.input}>
        <InputField
          onChangeText={setTitle}
          placeholder="Title"
          value={title}
        />
      </Input>
      <Input style={[styles.input, styles.textArea]}>
        <InputField
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
  title: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
});
