import {
  BottomTabBar,
  BottomTabBarButtonProps,
  BottomTabHeaderProps,
  BottomTabNavigationOptions,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import {createStackNavigator} from '@react-navigation/stack';
import {Pressable, StyleSheet, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {PlaylistScreen} from '../features/inbox/screens/PlaylistScreen';
import {MiniPlayer} from '../features/podcasts/components/MiniPlayer';
import {RecordScreen} from '../features/record/screens/RecordScreen';
import {PodcastsTabHeader} from '../features/podcasts/components/PodcastsTabHeader';
import {PlayerProvider} from '../features/podcasts/context/PlayerContext';
import {PodcastsScreen} from '../features/podcasts/screens/PodcastsScreen';
import {SettingsScreen} from '../features/settings/screens/SettingsScreen';
import {AddNoteScreen} from '../features/vault/screens/AddNoteScreen';
import {NoteDetailScreen} from '../features/vault/screens/NoteDetailScreen';
import {VaultScreen} from '../features/vault/screens/VaultScreen';
import {
  AddNoteStackParamList,
  MainTabParamList,
  PlaylistStackParamList,
  PodcastsStackParamList,
  RecordStackParamList,
  SettingsStackParamList,
  VaultStackParamList,
} from './types';

const Tabs = createBottomTabNavigator<MainTabParamList>();
const PlaylistStack = createStackNavigator<PlaylistStackParamList>();
const PodcastsStack = createStackNavigator<PodcastsStackParamList>();
const AddNoteStack = createStackNavigator<AddNoteStackParamList>();
const VaultStack = createStackNavigator<VaultStackParamList>();
const RecordStack = createStackNavigator<RecordStackParamList>();
const SettingsStack = createStackNavigator<SettingsStackParamList>();
const playlistTabIcon: BottomTabNavigationOptions['tabBarIcon'] = ({color, size}) => (
  <MaterialIcons color={color} name="playlist-play" size={size} />
);
const newNoteTabIcon: BottomTabNavigationOptions['tabBarIcon'] = ({color, size}) => (
  <MaterialIcons color={color} name="add-box" size={size} />
);
const inboxTabIcon: BottomTabNavigationOptions['tabBarIcon'] = ({color, size}) => (
  <MaterialIcons color={color} name="move-to-inbox" size={size} />
);
const podcastsTabIcon: BottomTabNavigationOptions['tabBarIcon'] = ({color, size}) => (
  <MaterialIcons color={color} name="headphones" size={size} />
);
const RECORD_TAB_ICON_COLOR = '#e53935';
const recordTabIcon: BottomTabNavigationOptions['tabBarIcon'] = ({size}) => (
  <MaterialIcons color={RECORD_TAB_ICON_COLOR} name="fiber-manual-record" size={size} />
);
const tabBarButton: BottomTabNavigationOptions['tabBarButton'] = props => (
  <TabBarButton {...props} />
);

const renderTabBar = (props: Parameters<typeof BottomTabBar>[0]) => (
  <>
    <MiniPlayer />
    <BottomTabBar {...props} />
  </>
);

function renderPodcastsTabHeader(props: BottomTabHeaderProps) {
  return <PodcastsTabHeader {...props} />;
}

function TabBarButton({
  accessibilityLabel,
  accessibilityState,
  children,
  onLongPress,
  onPress,
  style,
  testID,
}: BottomTabBarButtonProps) {
  const isSelected = accessibilityState?.selected === true;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      android_ripple={{
        borderless: false,
        color: 'rgba(255,255,255,0.12)',
        radius: 32,
      }}
      onLongPress={onLongPress}
      onPress={onPress}
      style={[style, styles.tabButton]}
      testID={testID}>
      <View style={[styles.tabButtonInner, isSelected ? styles.tabButtonActive : null]}>
        {children}
      </View>
    </Pressable>
  );
}

function PlaylistStackScreen() {
  return (
    <PlaylistStack.Navigator screenOptions={{headerShown: false}}>
      <PlaylistStack.Screen component={PlaylistScreen} name="Playlist" />
    </PlaylistStack.Navigator>
  );
}

function PodcastsStackScreen() {
  return (
    <PodcastsStack.Navigator screenOptions={{headerShown: false}}>
      <PodcastsStack.Screen component={PodcastsScreen} name="Podcasts" />
    </PodcastsStack.Navigator>
  );
}

function AddNoteStackScreen() {
  return (
    <AddNoteStack.Navigator initialRouteName="AddNote" screenOptions={{headerShown: false}}>
      <AddNoteStack.Screen component={AddNoteScreen} name="AddNote" />
    </AddNoteStack.Navigator>
  );
}

function VaultStackScreen() {
  return (
    <VaultStack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: styles.tabHeader,
        headerTintColor: '#ffffff',
        headerTitleStyle: styles.tabHeaderTitle,
      }}>
      <VaultStack.Screen component={VaultScreen} name="Vault" />
      <VaultStack.Screen
        component={AddNoteScreen}
        name="AddNote"
        options={({route}) => ({
          headerShown: true,
          headerStyle: styles.tabHeader,
          headerTintColor: '#ffffff',
          headerTitleStyle: styles.tabHeaderTitle,
          title: route.params?.noteUri ? 'Edit note' : 'New note',
        })}
      />
      <VaultStack.Screen
        component={NoteDetailScreen}
        name="NoteDetail"
        options={{headerShown: false}}
      />
    </VaultStack.Navigator>
  );
}

function RecordStackScreen() {
  return (
    <RecordStack.Navigator screenOptions={{headerShown: false}}>
      <RecordStack.Screen component={RecordScreen} name="Record" />
    </RecordStack.Navigator>
  );
}

function SettingsStackScreen() {
  return (
    <SettingsStack.Navigator screenOptions={{headerShown: false}}>
      <SettingsStack.Screen component={SettingsScreen} name="Settings" />
    </SettingsStack.Navigator>
  );
}

export function MainTabNavigator() {
  return (
    <PlayerProvider>
      <Tabs.Navigator
        initialRouteName="VaultTab"
        screenOptions={{
          headerShown: true,
          headerStyle: styles.tabHeader,
          headerTintColor: '#ffffff',
          headerTitleStyle: styles.tabHeaderTitle,
          tabBarActiveTintColor: '#ffffff',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarShowLabel: true,
          tabBarStyle: styles.tabBar,
        }}
        tabBar={renderTabBar}>
        <Tabs.Screen
          component={PodcastsStackScreen}
          name="PodcastsTab"
          options={{
            header: renderPodcastsTabHeader,
            tabBarButton,
            tabBarIcon: podcastsTabIcon,
            title: 'Podcasts',
          }}
        />
        <Tabs.Screen
          component={PlaylistStackScreen}
          name="PlaylistTab"
          options={{
            tabBarButton,
            tabBarIcon: playlistTabIcon,
            title: 'Playlist',
          }}
        />
        <Tabs.Screen
          component={VaultStackScreen}
          name="VaultTab"
          options={{
            tabBarButton,
            tabBarIcon: inboxTabIcon,
            title: 'Inbox',
          }}
        />
        <Tabs.Screen
          component={AddNoteStackScreen}
          name="AddNoteTab"
          options={{
            tabBarButton,
            tabBarIcon: newNoteTabIcon,
            title: 'Note',
          }}
        />
        <Tabs.Screen
          component={RecordStackScreen}
          name="RecordTab"
          options={{
            tabBarAccessibilityLabel: 'Record',
            tabBarButton,
            tabBarIcon: recordTabIcon,
            tabBarLabel: 'Record',
            title: 'Record',
          }}
        />
        <Tabs.Screen
          component={SettingsStackScreen}
          name="SettingsTab"
          options={{
            tabBarButton: () => null,
            tabBarItemStyle: {display: 'none'},
            title: 'Settings',
          }}
        />
      </Tabs.Navigator>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#1d1d1d',
    borderTopColor: '#2d2d2d',
  },
  tabHeader: {
    backgroundColor: '#1d1d1d',
  },
  tabHeaderTitle: {
    color: '#ffffff',
    fontWeight: '600',
  },
  tabBarLabel: {
    fontSize: 11,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tabButtonInner: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
