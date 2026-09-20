// Makes Nexus installable as an app on phones and desktops ("Add to home screen" / "Install").
export default function manifest() {
  return {
    name: "Nexus",
    short_name: "Nexus",
    description: "Study from your own materials, with answers you can check.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#eaf6fd",
    theme_color: "#1561ad",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
