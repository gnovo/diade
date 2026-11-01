import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';
import './src/sentry';
import App from './src/App';

registerRootComponent(Sentry.wrap(App));
