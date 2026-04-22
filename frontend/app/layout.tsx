import "./globals.css";

export const metadata = {
  title: "Energia IoT Monitor",
  description: "Painel de consumo em tempo real para sensores de borda.",
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
