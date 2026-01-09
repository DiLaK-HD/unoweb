import "./globals.css";

export const metadata = {
  title: "UNO Multijoueur",
  description: "Jouez à UNO en ligne avec vos amis!",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
