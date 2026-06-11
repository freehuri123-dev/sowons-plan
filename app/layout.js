import "./globals.css";

export const metadata = {
  title: "소원이네 일정판",
  description: "Sowon's Happy Plan",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
