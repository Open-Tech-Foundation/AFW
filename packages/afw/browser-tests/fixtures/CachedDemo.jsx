import { Pending, resource } from '@opentf/afw';

// A keyed resource: its runs wait for the test (window.__resolveProfile(value)).
function Profile() {
  const profile = resource(() => new Promise((resolve) => (window.__resolveProfile = resolve)), { key: 'profile' });
  return <p data-testid="profile">{profile.data}</p>;
}

export default function CachedDemo() {
  return (
    <Pending fallback={<p data-testid="skeleton">Loading…</p>} refreshing={<p data-testid="updating">Updating…</p>}>
      <Profile />
    </Pending>
  );
}
