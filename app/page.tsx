import Header from "@/components/Header";
import HomeIntro from "@/components/HomeIntro";
import ToolGrid from "@/components/ToolGrid";

/**
 * Home is just a hub: a grid of tool cards. All upload/push logic lives
 * under /tools/*. To add a future destination (Vercel, Netlify, ...),
 * add another entry to ToolGrid and a new route under app/tools/.
 */
export default function HomePage() {
  return (
    <main className="min-h-dvh bg-base-bg pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <HomeIntro />
        <ToolGrid />
      </div>
    </main>
  );
}
