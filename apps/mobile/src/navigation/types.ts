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

/** Inbox / Entry compose: new note, optional share prefill, or edit existing via `noteUri`. */
export type AddNoteScreenRouteParams = {
  initialComposeText?: string;
  noteTitle?: string;
  noteUri?: string;
};

export type AddNoteStackParamList = {
  AddNote: AddNoteScreenRouteParams | undefined;
};

export type PodcastsStackParamList = {
  Podcasts: undefined;
};

export type RecordStackParamList = {
  Record: undefined;
};

/** Inbox markdown list (formerly Log tab). */
export type InboxStackParamList = {
  AddNote: AddNoteScreenRouteParams | undefined;
  Inbox: undefined;
  NoteDetail: {noteFileName?: string; noteTitle: string; noteUri: string};
};

/** Full-vault search tab. */
export type VaultStackParamList = {
  Vault: undefined;
  VaultNoteRead: {noteTitle: string; noteUri: string};
  VaultSearch: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
};
