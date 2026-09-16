import { AuthPanel } from "@/components/auth-panel";
import { RoomMap } from "@/components/room-map";

export default function Home() {
  return <main className="map-app">
    <header className="map-header">
      <div className="brand" aria-label="Map Chat"><span className="brand-mark" aria-hidden="true"><span /></span><span>Map Chat</span></div>
      <div className="map-header__copy">
        <p className="eyebrow">Public conversations, placed on the map</p>
        <h1 id="page-title">Explore rooms around you.</h1>
        <p>Browse persisted public rooms as a guest. Sign in when you are ready to join the conversation.</p>
      </div>
    </header>
    <div className="map-layout">
      <section className="map-stage" aria-labelledby="page-title">
        <RoomMap />
      </section>
      <aside className="account-rail" aria-label="Account controls">
        <AuthPanel />
      </aside>
    </div>
  </main>;
}
