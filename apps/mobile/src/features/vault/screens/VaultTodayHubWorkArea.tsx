import {
  todayHubRowUriFromTodayNoteUri,
  todayHubWeekProgress,
} from '@eskerra/core';
import {Box, ScrollView, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {StyleSheet, View} from 'react-native';

import {LIST_HORIZONTAL_INSET} from '../../../core/ui/listMetrics';
import {TodayHubPickerModal} from '../components/TodayHubPickerModal';
import {TodayWeekProgressStrip} from '../components/TodayWeekProgressStrip';
import {VaultReadonlyMarkdownBlock} from '../components/VaultReadonlyMarkdownBlock';
import type {HubIntroState} from './vaultScreenTodayHubLoaders';

export type VaultTodayHubWorkAreaProps = {
  activeHubUri: string | null;
  columnHeaders: string[];
  columnSections: string[];
  hubIntro: HubIntroState;
  hubPickerOpen: boolean;
  hubs: string[];
  isNavLoading: boolean;
  isVaultMarkdownRefsLoading: boolean;
  muted: string;
  onNavigateToVaultNote: (noteUri: string, noteTitle: string) => void;
  renderedWeekStart: Date | null;
  selectHub: (uri: string) => void;
  setHubPickerOpen: (open: boolean) => void;
  showHubIntroSpinner: boolean;
  vaultMarkdownRefsError: string | null;
  weekProgressComparisonNow: Date;
  wikiIndexLoading: boolean;
};

const workAreaStyles = StyleSheet.create({
  columnsWrap: {
    marginTop: 8,
  },
  indexHint: {
    fontSize: 12,
    marginBottom: 8,
  },
  indexWarning: {
    fontSize: 12,
    marginBottom: 8,
  },
  scrollContent: {
    paddingBottom: 24,
    paddingHorizontal: LIST_HORIZONTAL_INSET,
  },
  spinner: {
    marginVertical: 16,
  },
});

export function VaultTodayHubWorkArea({
  activeHubUri,
  columnHeaders,
  columnSections,
  hubIntro,
  hubPickerOpen,
  hubs,
  isNavLoading,
  isVaultMarkdownRefsLoading,
  muted,
  onNavigateToVaultNote,
  renderedWeekStart,
  selectHub,
  setHubPickerOpen,
  showHubIntroSpinner,
  vaultMarkdownRefsError,
  weekProgressComparisonNow,
  wikiIndexLoading,
}: VaultTodayHubWorkAreaProps) {
  const colorMode = useColorMode();

  return (
    <Box style={styles.container}>
      {showHubIntroSpinner ? <Spinner style={workAreaStyles.spinner} /> : null}
      {hubIntro.status === 'error' ? (
        <Text style={[styles.empty, {color: muted, paddingHorizontal: LIST_HORIZONTAL_INSET}]}>
          {hubIntro.message}
        </Text>
      ) : null}
      {hubIntro.status === 'ready' && activeHubUri ? (
        <ScrollView contentContainerStyle={workAreaStyles.scrollContent} nestedScrollEnabled>
          {vaultMarkdownRefsError ? (
            <Text style={[workAreaStyles.indexWarning, {color: muted}]}>
              Link name index unavailable ({vaultMarkdownRefsError}). Wiki links may not resolve until
              the vault is reachable again.
            </Text>
          ) : null}
          {isVaultMarkdownRefsLoading && wikiIndexLoading ? (
            <Text style={[workAreaStyles.indexHint, {color: muted}]}>Indexing vault notes for links…</Text>
          ) : null}
          <VaultReadonlyMarkdownBlock
            markdownFullText={hubIntro.intro}
            noteUri={activeHubUri}
            omitWikiIndexWarning
            onNavigateToVaultNote={onNavigateToVaultNote}
          />
          <View style={workAreaStyles.columnsWrap}>
            {isNavLoading ? <Spinner style={workAreaStyles.spinner} /> : null}
            {renderedWeekStart != null
              ? columnSections.map((colBody, ci) => (
                  <VaultReadonlyMarkdownBlock
                    key={`col-${ci}`}
                    markdownFullText={colBody}
                    noteUri={todayHubRowUriFromTodayNoteUri(activeHubUri, renderedWeekStart)}
                    omitWikiIndexWarning
                    sectionTitle={columnHeaders[ci] ?? ''}
                    titleTrailing={
                      ci === 0 ? (
                        <TodayWeekProgressStrip
                          comparisonNow={weekProgressComparisonNow}
                          progress={todayHubWeekProgress(
                            renderedWeekStart,
                            weekProgressComparisonNow,
                          )}
                          weekStart={renderedWeekStart}
                        />
                      ) : undefined
                    }
                    onNavigateToVaultNote={onNavigateToVaultNote}
                  />
                ))
              : null}
          </View>
        </ScrollView>
      ) : null}
      <TodayHubPickerModal
        activeUri={activeHubUri}
        colorMode={colorMode === 'dark' ? 'dark' : 'light'}
        hubs={hubs}
        visible={hubPickerOpen}
        onClose={() => setHubPickerOpen(false)}
        onPick={selectHub}
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
  },
  empty: {
    fontSize: 15,
    textAlign: 'center',
  },
});
