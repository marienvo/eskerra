import {
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {useColorScheme} from 'react-native';

import {appBreadcrumb} from '../core/observability';
import {SetupScreen} from '../features/setup/screens/SetupScreen';
import {MainTabNavigator} from './MainTabNavigator';
import {RootStackParamList} from './types';

const RootStack = createStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type RootNavigatorProps = {
  initialRouteName: keyof RootStackParamList;
};

export function RootNavigator({initialRouteName}: RootNavigatorProps) {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={isDarkMode ? DarkTheme : DefaultTheme}
      onStateChange={() => {
        const route = navigationRef.getCurrentRoute();
        if (!route) {
          return;
        }
        const params = route.params as Record<string, unknown> | undefined;
        appBreadcrumb({
          category: 'navigation',
          message: 'route',
          data: {
            name: route.name,
            params_keys: params ? Object.keys(params) : [],
          },
        });
      }}>
      <RootStack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{headerShown: false}}>
        <RootStack.Screen component={SetupScreen} name="Setup" />
        <RootStack.Screen component={MainTabNavigator} name="MainTabs" />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
