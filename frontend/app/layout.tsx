import "./globals.css";

export const metadata = {
  title: "IoT Energy Dashboard",
  description: "Dashboard em tempo real para sensores de borda.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
