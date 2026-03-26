import {NavigatorScreenParams} from '@react-navigation/native';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Setup: undefined;
};

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  InboxTab: NavigatorScreenParams<InboxStackParamList> | undefined;
  PodcastsTab: NavigatorScreenParams<PodcastsStackParamList> | undefined;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList> | undefined;
  VaultTab: NavigatorScreenParams<VaultStackParamList> | undefined;
};

export type InboxStackParamList = {
  Inbox: undefined;
};

export type PodcastsStackParamList = {
  Podcasts: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
};

export type VaultStackParamList = {
  AddNote: undefined;
  NoteDetail: {noteTitle: string; noteUri: string};
  Vault: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
};
