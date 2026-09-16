import { HealthPanel } from "@/components/health-panel";

export default function Home() {
  return <main><section className="card" aria-labelledby="foundation-title">
    <p className="eyebrow">Map Chat</p><h1 id="foundation-title">Foundation is running</h1>
    <p>This scaffold verifies the browser-to-API path before product features are added.</p><HealthPanel />
  </section></main>;
}
