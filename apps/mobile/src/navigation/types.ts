import {NavigatorScreenParams} from '@react-navigation/native';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Setup: undefined;
};

export type MainTabParamList = {
  AddNoteTab: NavigatorScreenParams<AddNoteStackParamList> | undefined;
  InboxTab: NavigatorScreenParams<InboxStackParamList> | undefined;
  PodcastsTab: NavigatorScreenParams<PodcastsStackParamList> | undefined;
  RecordTab: NavigatorScreenParams<RecordStackParamList> | undefined;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList> | undefined;
  VaultTab: NavigatorScreenParams<VaultStackParamList> | undefined;
};

export type AddNoteStackParamList = {
  AddNote: {noteTitle: string; noteUri: string} | undefined;
};

export type PodcastsStackParamList = {
  Podcasts: undefined;
};

export type RecordStackParamList = {
  Record: undefined;
};

/** Inbox markdown list (formerly Log tab). */
export type InboxStackParamList = {
  AddNote: {noteTitle: string; noteUri: string} | undefined;
  Inbox: undefined;
  NoteDetail: {noteFileName?: string; noteTitle: string; noteUri: string};
};

/** Full-vault search tab. */
export type VaultStackParamList = {
  Vault: {noteTitle?: string; noteUri?: string} | undefined;
  VaultSearch: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
};
