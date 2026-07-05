import { Redirect } from 'expo-router';

export default function NavigationRedirect() {
  return <Redirect href={'/nav-widget' as any} />;
}
