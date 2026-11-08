import * as Sentry from '@sentry/react-native';
import { registerRootComponent } from 'expo';
import './src/sentry';
import App from './src/App';

registerRootComponent(Sentry.wrap(App));
