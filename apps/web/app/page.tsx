import { AuthPanel } from "@/components/auth-panel";

export default function Home() {
  return <main className="app-shell">
    <section className="hero" aria-labelledby="page-title">
      <div className="brand" aria-label="Map Chat"><span className="brand-mark" aria-hidden="true"><span /></span><span>Map Chat</span></div>
      <div className="hero__copy">
        <p className="eyebrow">Local conversations, placed on the map</p>
        <h1 id="page-title">Join the conversation around you.</h1>
        <p className="hero__lede">Discover public rooms, follow what people are talking about, and sign in when you are ready to add your voice.</p>
      </div>
      <ul className="feature-list" aria-label="Map Chat account benefits">
        <li><span aria-hidden="true">01</span> Read public conversations as a guest</li>
        <li><span aria-hidden="true">02</span> Create rooms with your Google account</li>
        <li><span aria-hidden="true">03</span> Use one clear and secure sign-in option</li>
      </ul>
    </section>
    <AuthPanel />
  </main>;
}
