// Change this to your server URL. Use 10.0.2.2 for Android emulator to reach host localhost.
import { Platform } from 'react-native';
const getBaseUrl = () => {
  if (__DEV__) {
    return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
  }
  return 'https://your-server.com'; // Replace with your deployed server
};
export const API_BASE = getBaseUrl();
