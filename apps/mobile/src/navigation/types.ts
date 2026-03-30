import {NavigatorScreenParams} from '@react-navigation/native';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Setup: undefined;
};

export type MainTabParamList = {
  AddNoteTab: NavigatorScreenParams<AddNoteStackParamList> | undefined;
  PlaylistTab: NavigatorScreenParams<PlaylistStackParamList> | undefined;
  PodcastsTab: NavigatorScreenParams<PodcastsStackParamList> | undefined;
  RecordTab: NavigatorScreenParams<RecordStackParamList> | undefined;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList> | undefined;
  VaultTab: NavigatorScreenParams<VaultStackParamList> | undefined;
};

export type AddNoteStackParamList = {
  AddNote: {noteTitle: string; noteUri: string} | undefined;
};

export type PlaylistStackParamList = {
  Playlist: undefined;
};

export type PodcastsStackParamList = {
  Podcasts: undefined;
};

export type RecordStackParamList = {
  Record: undefined;
};

export type VaultStackParamList = {
  AddNote: {noteTitle: string; noteUri: string} | undefined;
  NoteDetail: {noteFileName?: string; noteTitle: string; noteUri: string};
  Vault: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
};
