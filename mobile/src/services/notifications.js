import * as Notifications from 'expo-notifications';

export async function requestNotificationPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleWelcomeNotification(userName) {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Welcome to Task Manager',
      body: `Hi ${userName || 'there'}, you're signed in. You'll get notified when tasks are assigned to you.`,
      data: {},
    },
    trigger: { seconds: 2 },
  });
}

export async function showLocalNotification(title, body, data = {}) {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: { seconds: 1 },
  });
}
