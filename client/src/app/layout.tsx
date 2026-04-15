import "./styles/globals.css";
import "@livekit/components-styles";

export const metadata = {
  title: "VideoChat HQ",
  description: "Social login + LiveKit ready video chat app"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
