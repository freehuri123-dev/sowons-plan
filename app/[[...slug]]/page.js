import ClientApp from "./client-app";
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClientApp />
    </Suspense>
  );
}
