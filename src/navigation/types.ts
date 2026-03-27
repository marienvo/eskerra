import {NavigatorScreenParams} from '@react-navigation/native';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Setup: undefined;
};

export type MainTabParamList = {
  AddNoteTab: NavigatorScreenParams<AddNoteStackParamList> | undefined;
  PlaylistTab: NavigatorScreenParams<PlaylistStackParamList> | undefined;
  PodcastsTab: NavigatorScreenParams<PodcastsStackParamList> | undefined;
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

export type VaultStackParamList = {
  AddNote: {noteTitle: string; noteUri: string} | undefined;
  NoteDetail: {noteTitle: string; noteUri: string};
  Vault: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
};
