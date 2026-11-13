// Two resources with different delays: the <Pending> around this card waits for both.
import { resource } from "@opentf/afw";
import { activity, fakeRequest, person } from "../fake-api.js";

export default function ProfileCard({ id = 1 }) {
  const user = resource(() => fakeRequest(() => person(id), { delay: 500 }));
  const feed = resource(() => fakeRequest(() => activity(id), { delay: 1100 }));
  return (
    <div class="demo-card">
      <p class="demo-jsx-line"><strong>{user.data?.name}</strong> · {user.data?.role}</p>
      <ul class="demo-list">{(feed.data ?? []).map((line) => <li class="demo-list-item">{line}</li>)}</ul>
    </div>
  );
}
